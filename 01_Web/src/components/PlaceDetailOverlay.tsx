import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Clock3, Image as ImageIcon, ImagePlus, Loader2, MapPin, NotebookPen, Pencil, Plus, X } from 'lucide-react'
// NOTE: the dev-only editor API clients (../data/localEditorApi and
// ../data/localContentEditorApi) are loaded via dynamic import inside
// import.meta.env.DEV guards, never statically — the production bundle must
// not contain any editor endpoint strings.
import type { CountryGroup } from '../domain/viewModel'
import { collectMemoryMedia, getVisitStatus, isCompletedVisit, orderMemoriesChronologically, selectVisits } from '../domain/viewModel'
import { memoryTypeLabels, placeStatusLabels } from '../domain/types'
import type { Media, MediaId, Memory, MemoryId, Place, Visit, VisitId } from '../domain/types'
import { mediaService } from '../services/mediaService'
import { statusDotStyle } from './placeStatusStyle'
import { overlayEscapeStack } from './overlayEscapeStack'
import { ConfirmDeleteButton } from './editor/ConfirmDeleteButton'
import type { PlacePhotoGalleryRequest } from './PlacePhotoGalleryModal'

type PlaceDetailOverlayProps = {
  place: Place
  group?: CountryGroup
  visits: Visit[]
  memoriesByVisitId: Record<VisitId, Memory[]>
  /** Media lookup for memory-attached photos (memory.mediaIds → Media). */
  mediaById: Record<MediaId, Media>
  photos: Media[]
  cover?: Media
  dateRangeLabel: string
  /** Local editor (dev-only): shows place/visit/memory edit entries. */
  editEnabled?: boolean
  onClose: () => void
  onOpenPhotos: (request: PlacePhotoGalleryRequest) => void
  onEditPlace?: () => void
  /** Delete callbacks must not throw; the overlay surfaces errors inline. */
  onDeletePlace?: () => Promise<void>
  onCreateVisit?: () => void
  onEditVisit?: (visit: Visit) => void
  onDeleteVisit?: (visit: Visit) => Promise<void>
  onCreateMemory?: (visit: Visit) => void
  onEditMemory?: (memory: Memory) => void
  onDeleteMemory?: (memory: Memory) => Promise<void>
  /** In-place refresh after media imports (dev-only; no page reload). */
  onMediaSaved?: () => Promise<void>
}

type AddMediaState =
  | { phase: 'idle' }
  | { phase: 'uploading'; done: number; total: number }
  | { phase: 'importing' }
  | { phase: 'error'; message: string }

const formatVisitDates = (visit: Visit) => {
  if (!visit.startDate) return '日期待定'
  return visit.endDate && visit.endDate !== visit.startDate
    ? `${visit.startDate} - ${visit.endDate}`
    : visit.startDate
}

const memoryTypeIcons = {
  note: NotebookPen,
  activity: Clock3,
  photo: ImageIcon,
} as const

// Small per-type marker colors for the timeline rail: distinct but calm.
const memoryTypeDotClass = {
  note: 'bg-slate-400',
  activity: 'bg-sky-300',
  photo: 'bg-rose-300',
} as const

const formatMemoryMeta = (memory: Memory) =>
  [memory.date, memory.time].filter(Boolean).join(' · ')

// Immersive place detail page (overlay, no router). Data arrives as plain
// props from useWorldContent — Place → Visit → Memory plus gallery media.
export function PlaceDetailOverlay({
  place,
  group,
  visits,
  memoriesByVisitId,
  mediaById,
  photos,
  cover,
  dateRangeLabel,
  editEnabled = false,
  onClose,
  onOpenPhotos,
  onEditPlace,
  onDeletePlace,
  onCreateVisit,
  onEditVisit,
  onDeleteVisit,
  onCreateMemory,
  onEditMemory,
  onDeleteMemory,
  onMediaSaved,
}: PlaceDetailOverlayProps) {
  const accent = group?.accent ?? '#38bdf8'
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [addMediaState, setAddMediaState] = useState<AddMediaState>({ phase: 'idle' })
  const addMediaBusy = addMediaState.phase === 'uploading' || addMediaState.phase === 'importing'
  // Delete errors from the local editor surface inline above the photo grid.
  const [deleteError, setDeleteError] = useState('')
  // Visit selection: 'all' shows every visit's memories; picking one visit
  // narrows the memory list to that trip.
  const [selectedVisitId, setSelectedVisitId] = useState<VisitId | 'all'>('all')
  // Memory drill-in: a selected memory renders as a full-screen detail layer
  // on top of the place overlay; back/Escape returns to the place.
  const [selectedMemoryId, setSelectedMemoryId] = useState<MemoryId | undefined>()
  const [memoryPhotoIndex, setMemoryPhotoIndex] = useState(0)
  const selectedVisits = selectVisits(visits, selectedVisitId)
  const hasCompletedVisits = visits.some(isCompletedVisit)
  const selectedMemories = selectedVisits.flatMap((visit) => memoriesByVisitId[visit.id] ?? [])
  // Gallery aggregation: the place's curated gallery plus photos attached to
  // the currently selected visits' memories (deduped, memory order).
  const memoryPhotos = collectMemoryMedia(selectedMemories, mediaById)
  const galleryPhotos = [
    ...photos,
    ...memoryPhotos.filter((media) => !photos.some((photo) => photo.id === media.id)),
  ]
  const selectedMemory = selectedMemoryId
    ? selectedMemories.find((memory) => memory.id === selectedMemoryId)
    : undefined
  const selectedMemoryMedia = selectedMemory
    ? collectMemoryMedia([selectedMemory], mediaById)
    : []
  const activeMemoryMedia =
    selectedMemoryMedia[Math.min(memoryPhotoIndex, Math.max(selectedMemoryMedia.length - 1, 0))]
  const SelectedMemoryTypeIcon = selectedMemory ? memoryTypeIcons[selectedMemory.type] : undefined

  const openMemory = (memoryId: MemoryId) => {
    setSelectedMemoryId(memoryId)
    setMemoryPhotoIndex(0)
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  // Latest-handler ref so the stack registration stays stable (re-registering
  // on every render could reorder this layer above an open lightbox).
  const escapeHandlerRef = useRef<() => void>(() => undefined)
  useEffect(() => {
    // Layered dismissal: Escape closes the memory detail first, then the
    // place overlay — and only when this overlay is the topmost layer (a
    // lightbox above it gets Escape first).
    escapeHandlerRef.current = () => {
      if (selectedMemoryId) {
        setSelectedMemoryId(undefined)
        return
      }
      onClose()
    }
  }, [onClose, selectedMemoryId])

  useEffect(() => overlayEscapeStack.register(() => escapeHandlerRef.current()), [])

  // One-step add media (dev/local editor only): pick → upload → import →
  // in-place refresh (no page reload).
  const addMedia = async (files: FileList | null) => {
    // Keep the DEV guard as its own statement so the dynamic import below is
    // tree-shaken out of the production bundle (compound conditions are not).
    if (!import.meta.env.DEV) return
    if (!files?.length) return
    const fileList = Array.from(files)
    try {
      const { importLocalMedia, uploadLocalMedia } = await import('../data/localEditorApi')
      const uploadedSourcePaths: string[] = []
      for (const [index, file] of fileList.entries()) {
        setAddMediaState({ phase: 'uploading', done: index, total: fileList.length })
        const uploaded = await uploadLocalMedia({
          placeId: place.id,
          kind: 'photo',
          file,
        })
        uploadedSourcePaths.push(uploaded.sourcePath)
      }
      setAddMediaState({ phase: 'importing' })
      await importLocalMedia(uploadedSourcePaths)
      await onMediaSaved?.()
      setAddMediaState({ phase: 'idle' })
    } catch (error) {
      setAddMediaState({
        phase: 'error',
        message: error instanceof Error ? error.message : '照片导入失败。',
      })
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Wrap editor deletes so failures surface inline instead of throwing
  // through ConfirmDeleteButton; `after` cleans up local selection state.
  const runDelete = async (action: (() => Promise<void>) | undefined, after?: () => void) => {
    if (!action) return
    setDeleteError('')
    try {
      await action()
      after?.()
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : '删除失败。')
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${place.name} 详情`}
      className="place-detail-overlay fixed inset-0 z-[70] overflow-y-auto bg-[#020817] text-slate-100"
    >
      <div className="relative h-[36vh] min-h-[220px] w-full overflow-hidden sm:h-[42vh]">
        {cover ? (
          <img
            src={mediaService.getUrl(cover)}
            alt={cover.alt ?? `${place.nameEn ?? place.name} cover`}
            className="h-full w-full object-cover"
            decoding="async"
          />
        ) : (
          <div
            className="h-full w-full bg-[radial-gradient(circle_at_24%_20%,rgba(255,255,255,0.55),transparent_26%),linear-gradient(135deg,rgba(14,165,233,0.4),rgba(2,8,23,0.85)),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[length:auto,auto,36px_36px]"
            style={{ backgroundColor: accent }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#020817] via-[#020817]/35 to-transparent" />

        <div className="absolute left-4 top-4 flex items-center gap-2 sm:left-8 sm:top-6">
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 place-items-center rounded-full border border-white/16 bg-slate-950/62 text-slate-100 backdrop-blur-xl transition hover:bg-slate-950/82 active:scale-95"
            aria-label="返回地球"
            title="返回地球"
          >
            <ArrowLeft className="size-5" />
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 grid size-11 place-items-center rounded-full border border-white/16 bg-slate-950/62 text-slate-100 backdrop-blur-xl transition hover:bg-slate-950/82 active:scale-95 sm:right-8 sm:top-6"
          aria-label="关闭详情"
          title="关闭详情"
        >
          <X className="size-5" />
        </button>

        <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-3xl px-5 pb-6 sm:px-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-300/85">
            {group ? `${group.name} · ${group.nameEn ?? ''}` : 'Place'}
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-normal text-white sm:text-5xl">
            {place.name}
          </h1>
          {place.nameEn && place.nameEn !== place.name ? (
            <p className="mt-1 text-lg font-medium text-slate-300">{place.nameEn}</p>
          ) : null}
          <p className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-400">
            <span className="inline-block size-2 shrink-0 rounded-full" style={statusDotStyle(place.status, accent)} aria-hidden="true" />
            {placeStatusLabels[place.status]}
            {place.status === 'visited' && dateRangeLabel ? ` · ${dateRangeLabel}` : ''}
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-5 pb-24 pt-8 sm:px-8">
        {place.summary ? (
          <p className="border-l-2 pl-4 text-base leading-7 text-slate-200" style={{ borderColor: accent }}>
            {place.summary}
          </p>
        ) : null}

        {place.status === 'wishlist' && place.wishlistReason ? (
          <section className="mt-10">
            <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
              想去理由 · Why
            </h2>
            <p
              className="mt-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-sm leading-7 text-slate-300"
            >
              {place.wishlistReason}
            </p>
          </section>
        ) : null}

        {editEnabled ? (
          <section
            aria-label="地点编辑"
            className="mt-8 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-amber-300/30 bg-amber-300/[0.05] p-3"
          >
            <span className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/70">
              编辑模式
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={onEditPlace}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-white/16 bg-white/8 px-4 text-xs font-semibold text-slate-200 transition hover:bg-white/14 active:scale-95"
            >
              <Pencil className="size-3.5" />
              编辑地点
            </button>
            <ConfirmDeleteButton
              label="删除地点"
              onConfirm={() => runDelete(onDeletePlace)}
            />
          </section>
        ) : null}

        {visits.length > 0 || editEnabled ? (
          <section className="mt-10">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                {hasCompletedVisits ? '到访 · Visits' : '计划 · Plans'}
              </h2>
              {editEnabled ? (
                <button
                  type="button"
                  onClick={onCreateVisit}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/16 bg-white/8 px-3.5 text-xs font-semibold text-slate-200 transition hover:bg-white/14 active:scale-95"
                >
                  <Plus className="size-3.5" />
                  新增到访
                </button>
              ) : null}
            </div>
            {visits.length === 0 ? (
              <div className="mt-4 rounded-3xl border border-dashed border-white/14 bg-white/[0.04] p-5 text-sm leading-6 text-slate-400">
                还没有到访记录。点击右上角「新增到访」创建第一条。
              </div>
            ) : null}
            {visits.length > 1 ? (
              <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="选择到访">
                <button
                  type="button"
                  aria-pressed={selectedVisitId === 'all'}
                  onClick={() => setSelectedVisitId('all')}
                  className={`flex h-9 items-center rounded-full border px-4 text-xs font-semibold transition ${
                    selectedVisitId === 'all'
                      ? 'border-sky-300/80 bg-sky-400/20 text-sky-100'
                      : 'border-white/14 bg-white/[0.06] text-slate-300 hover:bg-white/12'
                  }`}
                >
                  全部到访
                </button>
                {visits.map((visit) => {
                  const isActive = selectedVisitId === visit.id
                  const isPlanned = getVisitStatus(visit) === 'planned'
                  return (
                    <button
                      key={visit.id}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setSelectedVisitId(isActive ? 'all' : visit.id)}
                      className={`flex h-9 items-center gap-2 rounded-full border px-4 text-xs font-semibold transition ${
                        isActive
                          ? 'border-sky-300/80 bg-sky-400/20 text-sky-100'
                          : 'border-white/14 bg-white/[0.06] text-slate-300 hover:bg-white/12'
                      }`}
                    >
                      {visit.title ?? formatVisitDates(visit)}
                      {isPlanned ? (
                        <span className="rounded-full border border-white/24 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                          计划中
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            ) : null}
            <div className="mt-4 space-y-6">
              {selectedVisits.map((visit) => {
                const visitMemories = memoriesByVisitId[visit.id] ?? []
                const isPlanned = getVisitStatus(visit) === 'planned'
                return (
                  <article
                    key={visit.id}
                    className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"
                  >
                    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      {formatVisitDates(visit)}
                      {isPlanned ? (
                        <span className="rounded-full border border-white/24 px-1.5 py-0.5 text-[10px] font-medium tracking-normal text-slate-400">
                          计划中
                        </span>
                      ) : null}
                    </p>
                    <h3 className="mt-1.5 text-lg font-semibold text-slate-100">
                      {visit.title ?? (isPlanned ? '计划行程' : '未命名行程')}
                    </h3>
                    {visit.summary ? (
                      <p className="mt-1.5 text-sm leading-6 text-slate-400">{visit.summary}</p>
                    ) : null}
                    {editEnabled ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onEditVisit?.(visit)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/16 bg-white/8 px-3 text-[11px] font-semibold text-slate-300 transition hover:bg-white/14 active:scale-95"
                        >
                          <Pencil className="size-3" />
                          编辑到访
                        </button>
                        <ConfirmDeleteButton
                          compact
                          label="删除到访"
                          onConfirm={() => runDelete(
                            onDeleteVisit ? () => onDeleteVisit(visit) : undefined,
                            () => {
                              if (selectedVisitId === visit.id) setSelectedVisitId('all')
                            },
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => onCreateMemory?.(visit)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/16 bg-white/8 px-3 text-[11px] font-semibold text-slate-300 transition hover:bg-white/14 active:scale-95"
                        >
                          <Plus className="size-3" />
                          新增记忆
                        </button>
                      </div>
                    ) : null}
                    {visitMemories.length > 0 ? (
                      <ol className="relative mt-5 space-y-5 border-l border-white/12 pl-5">
                        {orderMemoriesChronologically(visitMemories).map((memory) => {
                          const TypeIcon = memoryTypeIcons[memory.type]
                          const memoryMedia = collectMemoryMedia([memory], mediaById)
                          const meta = formatMemoryMeta(memory)
                          return (
                            <li key={memory.id} className="relative">
                              <span
                                className={`absolute -left-[26px] top-1.5 size-2.5 rounded-full ring-4 ring-[#0b1526] ${memoryTypeDotClass[memory.type]}`}
                                aria-hidden="true"
                              />
                              <button
                                type="button"
                                onClick={() => openMemory(memory.id)}
                                className="group block w-full rounded-2xl px-1 py-0.5 text-left transition hover:bg-white/[0.04]"
                                aria-label={`查看记忆：${memory.title ?? memoryTypeLabels[memory.type]}`}
                              >
                                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-slate-500">
                                  <span className="inline-flex items-center gap-1 text-slate-400">
                                    <TypeIcon className="size-3.5" aria-hidden="true" />
                                    {memoryTypeLabels[memory.type]}
                                  </span>
                                  {meta ? <span>{meta}</span> : null}
                                  {memory.locationName ? (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-white/12 px-2 py-0.5 text-[11px] text-slate-400">
                                      <MapPin className="size-3" aria-hidden="true" />
                                      {memory.locationName}
                                    </span>
                                  ) : null}
                                </p>
                                <p className="mt-1 text-sm font-semibold text-slate-200 transition group-hover:text-white">
                                  {memory.title ?? '未命名记忆'}
                                </p>
                                {memory.body && memory.type !== 'photo' ? (
                                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-400">{memory.body}</p>
                                ) : null}
                                {memoryMedia.length > 0 ? (
                                  <span className="mt-2 flex gap-2">
                                    {memoryMedia.map((media) => (
                                      <img
                                        key={media.id}
                                        src={mediaService.getThumbnailUrl(media)}
                                        alt={media.alt ?? ''}
                                        className="h-16 w-16 rounded-xl border border-white/10 object-cover"
                                        loading="lazy"
                                        decoding="async"
                                      />
                                    ))}
                                  </span>
                                ) : null}
                              </button>
                              {editEnabled ? (
                                <span className="mt-1 flex items-center gap-2 px-1">
                                  <button
                                    type="button"
                                    onClick={() => onEditMemory?.(memory)}
                                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/16 bg-white/8 px-3 text-[11px] font-semibold text-slate-300 transition hover:bg-white/14 active:scale-95"
                                  >
                                    <Pencil className="size-3" />
                                    编辑
                                  </button>
                                  <ConfirmDeleteButton
                                    compact
                                    label="删除"
                                    onConfirm={() => runDelete(
                                      onDeleteMemory ? () => onDeleteMemory(memory) : undefined,
                                      () => {
                                        if (selectedMemoryId === memory.id) setSelectedMemoryId(undefined)
                                      },
                                    )}
                                  />
                                </span>
                              ) : null}
                            </li>
                          )
                        })}
                      </ol>
                    ) : null}
                  </article>
                )
              })}
            </div>
          </section>
        ) : place.status === 'planned' ? (
          <section className="mt-10">
            <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
              计划 · Plans
            </h2>
            <div className="mt-4 rounded-3xl border border-dashed border-white/14 bg-white/[0.04] p-5 text-sm leading-6 text-slate-400">
              计划日期：待定。行程确定后会显示在这里。
            </div>
          </section>
        ) : null}

        <div className="mt-10 flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
            照片 · Photos
          </h2>
          {editEnabled ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={addMediaBusy}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-white/16 bg-white/8 px-4 text-xs font-semibold text-slate-100 transition hover:bg-white/14 active:scale-95 disabled:opacity-60"
              >
                {addMediaBusy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                添加照片
              </button>
              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                multiple
                onChange={(event) => void addMedia(event.currentTarget.files)}
              />
            </div>
          ) : null}
        </div>

        {editEnabled ? (
          <p className="mt-2 text-[11px] leading-5 text-slate-500">
            网页上传目前仅支持 JPG / PNG / WebP / AVIF 图片；视频请直接放入 MediaInbox 后运行 media:import。
          </p>
        ) : null}

        {deleteError ? (
          <p role="alert" className="mt-3 whitespace-pre-line text-xs font-medium text-rose-300">
            {deleteError}
          </p>
        ) : null}

        {addMediaState.phase === 'uploading' ? (
          <p role="status" className="mt-3 text-xs font-medium text-sky-300">
            正在接收照片 {addMediaState.done + 1} / {addMediaState.total}…
          </p>
        ) : null}
        {addMediaState.phase === 'importing' ? (
          <p role="status" className="mt-3 text-xs font-medium text-sky-300">
            照片已进入私有投递箱，正在生成网页资源…
          </p>
        ) : null}
        {addMediaState.phase === 'error' ? (
          <p role="alert" className="mt-3 whitespace-pre-line text-xs font-medium text-rose-300">
            {addMediaState.message}
          </p>
        ) : null}

        {galleryPhotos.length > 0 ? (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {galleryPhotos.map((photo, index) => (
              <button
                key={photo.id}
                type="button"
                className="group overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition hover:border-white/24"
                aria-label={`查看照片 ${index + 1}`}
                onClick={() => onOpenPhotos({
                  photos: galleryPhotos,
                  placeName: place.name,
                  initialPhotoId: photo.id,
                  mode: 'viewer',
                })}
              >
                <img
                  src={mediaService.getThumbnailUrl(photo)}
                  alt={photo.alt ?? `${place.nameEn ?? place.name} photo ${index + 1}`}
                  className="aspect-[4/3] w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                  loading="lazy"
                  decoding="async"
                />
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-white/14 bg-white/[0.04] px-5 py-10 text-center text-sm text-slate-400">
            还没有照片。{editEnabled ? '点击右上角「添加照片」即可从本机导入。' : '照片导入后会显示在这里。'}
          </div>
        )}
      </div>

      {selectedMemory ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`记忆详情：${selectedMemory.title ?? memoryTypeLabels[selectedMemory.type]}`}
          className="fixed inset-0 z-[80] overflow-y-auto bg-[#010409] text-slate-100"
        >
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 pt-5 sm:px-8">
            <button
              type="button"
              onClick={() => setSelectedMemoryId(undefined)}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-white/16 bg-white/8 px-4 text-xs font-semibold text-slate-100 transition hover:bg-white/14 active:scale-95"
              aria-label="返回地点详情"
            >
              <ArrowLeft className="size-4" />
              返回{place.name}
            </button>
            <button
              type="button"
              onClick={() => setSelectedMemoryId(undefined)}
              className="grid size-11 place-items-center rounded-full border border-white/16 bg-white/8 text-slate-100 transition hover:bg-white/14 active:scale-95"
              aria-label="关闭记忆详情"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="mx-auto w-full max-w-3xl px-5 pb-24 pt-6 sm:px-8">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 text-slate-400">
                {SelectedMemoryTypeIcon ? <SelectedMemoryTypeIcon className="size-4" aria-hidden="true" /> : null}
                {memoryTypeLabels[selectedMemory.type]}
              </span>
              {formatMemoryMeta(selectedMemory) ? <span>{formatMemoryMeta(selectedMemory)}</span> : null}
              {selectedMemory.locationName ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/12 px-2 py-0.5 text-[11px] text-slate-400">
                  <MapPin className="size-3" aria-hidden="true" />
                  {selectedMemory.locationName}
                </span>
              ) : null}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white">
              {selectedMemory.title ?? '未命名记忆'}
            </h1>

            {activeMemoryMedia ? (
              <div className="mt-6">
                <img
                  key={activeMemoryMedia.id}
                  src={mediaService.getUrl(activeMemoryMedia)}
                  alt={activeMemoryMedia.alt ?? selectedMemory.title ?? ''}
                  className="w-full rounded-3xl border border-white/10 object-cover"
                  decoding="async"
                />
                {selectedMemoryMedia.length > 1 ? (
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                    {selectedMemoryMedia.map((media, index) => (
                      <button
                        key={media.id}
                        type="button"
                        aria-label={`切换到照片 ${index + 1}`}
                        aria-pressed={index === memoryPhotoIndex}
                        onClick={() => setMemoryPhotoIndex(index)}
                        className={`shrink-0 overflow-hidden rounded-xl border transition ${
                          index === memoryPhotoIndex ? 'border-sky-300/90' : 'border-white/10 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={mediaService.getThumbnailUrl(media)}
                          alt=""
                          className="h-16 w-16 object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {selectedMemory.body ? (
              <p className="mt-6 border-l-2 pl-4 text-base leading-8 text-slate-200" style={{ borderColor: accent }}>
                {selectedMemory.body}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

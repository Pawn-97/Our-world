import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Clock3, Image as ImageIcon, ImagePlus, Loader2, MapPin, NotebookPen, Pencil, Plus, Sparkles } from 'lucide-react'
// NOTE: the dev-only editor API clients (../data/localEditorApi and
// ../data/localContentEditorApi) are loaded via dynamic import inside
// import.meta.env.DEV guards, never statically — the production bundle must
// not contain any editor endpoint strings.
import type { CountryGroup } from '../domain/viewModel'
import { collectMemoryMedia, getVisitStatus, isCompletedVisit, orderMemoriesChronologically, selectVisits } from '../domain/viewModel'
import { memoryTypeLabels, placeStatusLabels } from '../domain/types'
import type { Media, MediaId, Memory, MemoryId, Place, Visit, VisitId } from '../domain/types'
import { mediaService } from '../services/mediaService'
import { overlayEscapeStack } from './overlayEscapeStack'
import { ConfirmDeleteButton } from './editor/ConfirmDeleteButton'
import type { PlacePhotoGalleryRequest } from './PlacePhotoGalleryModal'
import {
  CameraDoodle,
  CountryStamp,
  PaperTape,
  PinDoodle,
  PlaneDoodle,
  Polaroid,
  ScrapPaperCard,
  StickyNote,
  StickerPill,
  SunglassesDoodle,
  WaveDoodle,
} from './scrapbook/ScrapbookBits'
import {
  buildPlaceMeta,
  formatVisitWindow,
  offsetFor,
  scrapMonthLabel,
  splitParagraphs,
  tiltFor,
} from './scrapbook/scrapbookStyle'

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

const memoryTypeIcons = {
  note: NotebookPen,
  activity: Clock3,
  photo: ImageIcon,
} as const

const tapeToneByStatus = {
  visited: 'mint',
  planned: 'butter',
  wishlist: 'rose',
} as const

/** "2024-10-25 - 2026-06-13" → "2024.10.25 → 2026.06.13" for the meta line. */
const compactDateRange = (label: string) =>
  label
    .replace(/\d{4}(?:-\d{2}){1,2}/g, (date) => date.replace(/-/g, '.'))
    .replace(/\s+-\s+/, ' → ')

const polaroidSeed = (placeId: string, bucket: string) => `${placeId}:${bucket}`

const formatMemoryDate = (memory: Memory) =>
  memory.date
    ? memory.date.length > 7
      ? memory.date.replace(/-/g, '.')
      : scrapMonthLabel(memory.date)
    : ''

const MemoryEditActions = ({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) => (
  <span className="flex items-center gap-2">
    <button
      type="button"
      onClick={onEdit}
      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 text-[11px] font-semibold text-[#414b59] transition hover:bg-[#fffdf6] active:scale-95"
    >
      <Pencil className="size-3" />
      编辑
    </button>
    <ConfirmDeleteButton compact label="删除" onConfirm={onDelete} />
  </span>
)

// Scrapbook place detail (overlay, no router). Data arrives as plain props from
// useWorldContent — Place → Visit → Memory plus gallery media. The visual
// language is a paper collage: tilted polaroids, washi tape, torn note cards,
// sticker pills and a passport stamp on a light map-paper canvas.
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
  const accent = group?.accent ?? '#66c7a8'
  const fileInputRef = useRef<HTMLInputElement>(null)
  const wallRef = useRef<HTMLDivElement>(null)
  const [addMediaState, setAddMediaState] = useState<AddMediaState>({ phase: 'idle' })
  const addMediaBusy = addMediaState.phase === 'uploading' || addMediaState.phase === 'importing'
  // Delete errors from the local editor surface inline above the photo wall.
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
  const metaLine = buildPlaceMeta({
    photoCount: galleryPhotos.length,
    memoryCount: selectedMemories.length,
    dateRangeLabel: compactDateRange(dateRangeLabel),
  })
  const latestCompletedVisit = visits
    .filter((visit) => isCompletedVisit(visit) && visit.startDate)
    .sort((left, right) => String(right.startDate).localeCompare(String(left.startDate)))[0]
  const stickyLabel = latestCompletedVisit
    ? scrapMonthLabel(latestCompletedVisit.startDate)
    : placeStatusLabels[place.status]

  const openMemory = (memoryId: MemoryId) => {
    setSelectedMemoryId(memoryId)
    setMemoryPhotoIndex(0)
  }

  const openWall = (mediaId: MediaId | undefined) => {
    if (!mediaId) return
    onOpenPhotos({
      photos: galleryPhotos,
      placeName: place.name,
      initialPhotoId: mediaId,
      mode: 'viewer',
    })
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
      className="scrap-root fixed inset-0 z-[70] overflow-y-auto overflow-x-hidden overscroll-contain"
    >
      <header className="scrap-header sticky top-0 z-30">
        <div className="mx-auto flex w-full max-w-[720px] items-center gap-3 px-4 py-3 lg:max-w-[1180px] lg:px-8">
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 shrink-0 place-items-center rounded-full border border-black/8 bg-white text-[#232c38] shadow-[0_6px_16px_-8px_rgba(30,36,48,.6)] transition hover:bg-[#fffdf6] active:scale-95"
            aria-label="返回地球"
            title="返回地球"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <h1 className="truncate text-[22px] font-bold leading-tight tracking-tight text-[#1b2430] sm:text-[25px]">
              {place.name}
            </h1>
            <p className="mt-0.5 truncate text-[11.5px] font-medium text-[#7b8494] sm:text-xs">
              {metaLine || placeStatusLabels[place.status]}
            </p>
          </div>
          <span
            className="hidden size-11 shrink-0 place-items-center rounded-full border border-black/8 bg-white text-[15px] shadow-[0_6px_16px_-8px_rgba(30,36,48,.6)] sm:grid"
            title={group?.name}
          >
            {group?.flag ?? <MapPin className="size-4 text-[#5b6472]" />}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[720px] px-4 pb-44 pt-5 lg:grid lg:max-w-[1180px] lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-14 lg:px-8 lg:pb-24 lg:pt-8">
        {/* ── Hero collage ─────────────────────────────────────────────── */}
        <div className="scrap-hero lg:sticky lg:top-24 lg:self-start">
          <div className="scrap-hero__collage relative mx-auto w-[76%] max-w-[300px] sm:w-[60%] lg:mt-8 lg:w-[88%] lg:max-w-none">
            <StickyNote seed={polaroidSeed(place.id, 'note')} className="-top-5 right-0 z-20 sm:-right-3">
              {stickyLabel}
            </StickyNote>
            <PaperTape seed={`${place.id}:tape-l`} tone="sky" className="-left-4 -top-3 z-20 sm:-left-6" />
            {cover ? (
              <Polaroid
                src={mediaService.getUrl(cover)}
                alt={cover.alt ?? `${place.nameEn ?? place.name} cover`}
                seed={polaroidSeed(place.id, 'cover')}
                caption={place.nameEn ?? place.name}
                imgClassName="aspect-[4/5] lg:max-h-[44vh]"
                className="relative z-10"
                priority
                onClick={() => openWall(cover.id)}
              />
            ) : (
              <div
                className="scrap-polaroid relative z-10 flex aspect-[4/5] items-center justify-center"
                style={{ transform: `rotate(${tiltFor(place.id, 2.6)}deg)` }}
              >
                <span className="scrap-hand px-4 text-center text-lg text-[#7b8494]">
                  {place.status === 'wishlist' || place.status === 'planned' ? '还没去过 · 想去' : '还没有照片'}
                </span>
              </div>
            )}
            <StickerPill icon={<MapPin />} className="absolute -bottom-3 left-0 z-20 sm:-left-4">
              {place.name}
            </StickerPill>
            {group ? (
              <CountryStamp
                label={(group.nameEn ?? group.name).toUpperCase()}
                center={group.flag}
                accent={accent}
                className="absolute -right-2 bottom-14 z-20 grid sm:-right-3 lg:-right-6"
              />
            ) : null}
            <SunglassesDoodle className="-left-2 bottom-20 z-0 w-14 sm:-left-8 sm:w-16 lg:-left-12 lg:w-20" />
            <CameraDoodle className="-bottom-10 right-1 z-0 w-16 sm:-right-4 sm:w-[74px]" />
            {group?.countryCode === 'cn' ? (
              <PinDoodle className="left-0 top-1/2 z-0 w-6 sm:-left-4 lg:-left-8" />
            ) : (
              <PlaneDoodle className="-left-1 top-1/2 z-0 w-12 sm:-left-6 lg:-left-10" />
            )}
          </div>

          <div className="scrap-hero__chips mt-12 flex flex-wrap items-center justify-center gap-2 lg:mt-14">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-black/8 bg-white/85 px-3 py-1.5 text-[12px] font-semibold text-[#414b59]">
              <span
                className="inline-block size-2 shrink-0 rounded-full"
                style={{ background: accent }}
                aria-hidden="true"
              />
              {placeStatusLabels[place.status]}
            </span>
            {hasCompletedVisits ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-black/8 bg-white/85 px-3 py-1.5 text-[12px] font-semibold text-[#414b59]">
                {visits.filter(isCompletedVisit).length} 次到访
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => wallRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="inline-flex items-center gap-1.5 rounded-full border border-black/8 bg-white/85 px-3 py-1.5 text-[12px] font-semibold text-[#414b59] transition hover:bg-white active:scale-95"
            >
              <ImageIcon className="size-3.5" aria-hidden="true" />
              {galleryPhotos.length} 张照片
            </button>
          </div>

          {place.summary ? (
            <ScrapPaperCard seed={`${place.id}:summary`} className="mt-7 px-5 py-4">
              <p className="text-[15px] leading-7 text-[#3b4453]">{place.summary}</p>
            </ScrapPaperCard>
          ) : null}

          {place.wishlistReason ? (
            <ScrapPaperCard seed={`${place.id}:why`} className="mt-5 px-5 py-4">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-[#98a0ae]">
                <Sparkles className="size-3.5" aria-hidden="true" />想去理由
              </p>
              <p className="scrap-hand mt-2 text-[16px] leading-8 text-[#3b4453]">{place.wishlistReason}</p>
            </ScrapPaperCard>
          ) : null}

          {editEnabled ? (
            <section
              aria-label="地点编辑"
              className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-[#d9b45c] bg-[#fff7e0]/70 p-3"
            >
              <span className="px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#9a7b25]">
                编辑模式
              </span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={onEditPlace}
                className="inline-flex h-10 items-center gap-1.5 rounded-full border border-black/10 bg-white px-4 text-xs font-semibold text-[#3b4453] transition hover:bg-[#fffdf6] active:scale-95"
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
        </div>

        {/* ── Memory stream ────────────────────────────────────────────── */}
        <div className="mt-12 lg:mt-0">
          {visits.length > 0 || editEnabled ? (
            <section aria-label="到访记忆">
              <h2 className="scrap-section-title">
                {hasCompletedVisits ? '到访记录 · Visits' : '计划 · Plans'}
              </h2>
              {editEnabled ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onCreateVisit}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-black/10 bg-white px-3.5 text-xs font-semibold text-[#3b4453] transition hover:bg-[#fffdf6] active:scale-95"
                  >
                    <Plus className="size-3.5" />
                    新增到访
                  </button>
                </div>
              ) : null}
              {visits.length === 0 ? (
                <ScrapPaperCard seed={`${place.id}:novisit`} className="mt-4 px-5 py-6">
                  <p className="text-sm leading-6 text-[#5b6472]">
                    还没有到访记录。{editEnabled ? '点击「新增到访」创建第一条。' : '记录一次到访后，记忆会显示在这里。'}
                  </p>
                </ScrapPaperCard>
              ) : null}
              <div className="mt-7 space-y-14">
                {selectedVisits.map((visit) => {
                  const visitMemories = orderMemoriesChronologically(memoriesByVisitId[visit.id] ?? [])
                  const isPlanned = getVisitStatus(visit) === 'planned'
                  const visitPhotos = collectMemoryMedia(
                    visitMemories.filter((memory) => memory.type === 'photo'),
                    mediaById,
                  )
                  return (
                    <article key={visit.id}>
                      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-dashed border-black/12 pb-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>
                            {formatVisitWindow(visit)}
                            {isPlanned ? ' · 计划中' : ''}
                          </p>
                          <h3 className="mt-1 text-[19px] font-bold leading-snug text-[#1b2430] sm:text-[21px]">
                            {visit.title ?? (isPlanned ? '计划行程' : '未命名行程')}
                          </h3>
                        </div>
                        {visitPhotos.length > 0 ? (
                          <span className="shrink-0 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-[#7b8494]">
                            {visitPhotos.length} 张照片
                          </span>
                        ) : null}
                        {visit.summary ? (
                          <p className="w-full text-[13.5px] leading-6 text-[#6b7482]">{visit.summary}</p>
                        ) : null}
                        {editEnabled ? (
                          <div className="flex w-full flex-wrap items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => onEditVisit?.(visit)}
                              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 text-[11px] font-semibold text-[#414b59] transition hover:bg-[#fffdf6] active:scale-95"
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
                              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 text-[11px] font-semibold text-[#414b59] transition hover:bg-[#fffdf6] active:scale-95"
                            >
                              <Plus className="size-3" />
                              新增记忆
                            </button>
                          </div>
                        ) : null}
                      </header>

                      <div className="mt-6 space-y-7">
                        {visitMemories.map((memory) => {
                          const TypeIcon = memoryTypeIcons[memory.type]
                          const memoryMedia = collectMemoryMedia([memory], mediaById)
                          const paragraphs = splitParagraphs(memory.body)
                          const meta = [
                            memory.date ? formatMemoryDate(memory) : '',
                            memory.time,
                            memory.locationName,
                          ].filter(Boolean).join(' · ')
                          const editActions = editEnabled ? (
                            <MemoryEditActions
                              onEdit={() => onEditMemory?.(memory)}
                              onDelete={() => runDelete(
                                onDeleteMemory ? () => onDeleteMemory(memory) : undefined,
                                () => {
                                  if (selectedMemoryId === memory.id) setSelectedMemoryId(undefined)
                                },
                              )}
                            />
                          ) : null

                          if (memory.type === 'photo' && memoryMedia.length > 0) {
                            return (
                              <div key={memory.id} className="flex flex-wrap items-center gap-3">
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#98a0ae]">
                                  <TypeIcon className="size-3.5" aria-hidden="true" />
                                  {memory.title ?? memoryTypeLabels.photo}
                                </span>
                                <span className="flex flex-wrap gap-2">
                                  {memoryMedia.slice(0, 6).map((media, index) => (
                                    <button
                                      key={media.id}
                                      type="button"
                                      onClick={() => openWall(media.id)}
                                      aria-label={`查看照片：${media.alt ?? ''}`}
                                      className="overflow-hidden rounded-lg border-2 border-white shadow-[0_4px_10px_-4px_rgba(30,36,48,.5)] transition hover:-translate-y-0.5"
                                      style={{ transform: `rotate(${tiltFor(`${memory.id}:${index}`, 3)}deg)` }}
                                    >
                                      <img
                                        src={mediaService.getThumbnailUrl(media)}
                                        alt=""
                                        className="size-14 object-cover"
                                        loading="lazy"
                                        decoding="async"
                                      />
                                    </button>
                                  ))}
                                </span>
                                {memoryMedia.length > 6 ? (
                                  <button
                                    type="button"
                                    onClick={() => openWall(memoryMedia[0]?.id)}
                                    className="text-[12px] font-semibold underline decoration-dotted underline-offset-4 text-[#6b7482]"
                                  >
                                    全部 {memoryMedia.length} 张
                                  </button>
                                ) : null}
                                {editActions}
                              </div>
                            )
                          }

                          if (memory.type === 'activity') {
                            return (
                              <div key={memory.id} className="flex items-start gap-3">
                                <span
                                  className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-black/8 bg-white text-[#5b6472] shadow-[0_4px_10px_-6px_rgba(30,36,48,.6)]"
                                  style={{ transform: `rotate(${tiltFor(`${memory.id}:act`, 6)}deg)` }}
                                >
                                  <TypeIcon className="size-4" aria-hidden="true" />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[15px] font-semibold leading-snug text-[#28313d]">
                                    {memory.title ?? memoryTypeLabels.activity}
                                  </p>
                                  {meta ? (
                                    <p className="mt-0.5 text-[12px] font-medium text-[#8b93a1]">{meta}</p>
                                  ) : null}
                                  {paragraphs.length > 0 ? (
                                    <p className="mt-1 text-[13.5px] leading-6 text-[#5b6472]">{paragraphs[0]}</p>
                                  ) : null}
                                  {editActions}
                                </div>
                              </div>
                            )
                          }

                          return (
                            <div key={memory.id} className="relative">
                              <PaperTape
                                seed={`${memory.id}:tape`}
                                tone={tapeToneByStatus[place.status]}
                                className="-top-3 left-6 z-10"
                              />
                              <ScrapPaperCard
                                seed={memory.id}
                                ariaLabel={`记忆：${memory.title ?? memoryTypeLabels[memory.type]}`}
                                className="px-5 py-5 sm:px-7 sm:py-6"
                                style={{ marginTop: `${Math.max(offsetFor(memory.id, 6), -3)}px` }}
                                onClick={() => openMemory(memory.id)}
                              >
                                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#98a0ae]">
                                  <TypeIcon className="size-3.5" aria-hidden="true" />
                                  {memoryTypeLabels[memory.type]}
                                  {meta ? (
                                    <span className="truncate normal-case tracking-normal text-[#a8afbb]">· {meta}</span>
                                  ) : null}
                                </p>
                                <h4 className="mt-2 text-[17px] font-bold leading-snug text-[#1b2430] sm:text-[18px]">
                                  {memory.title ?? '未命名记忆'}
                                </h4>
                                {paragraphs.length > 0 ? (
                                  <div className="scrap-hand mt-2.5 space-y-2 text-[16.5px] leading-[1.95] text-[#3b4453] sm:text-[17px]">
                                    <p>{paragraphs[0]}</p>
                                    {paragraphs.length > 1 ? (
                                      <p className="line-clamp-2">{paragraphs.slice(1).join(' ')}</p>
                                    ) : null}
                                  </div>
                                ) : null}
                                {memoryMedia.length > 0 ? (
                                  <span className="mt-3 flex gap-2">
                                    {memoryMedia.slice(0, 4).map((media, index) => (
                                      <img
                                        key={media.id}
                                        src={mediaService.getThumbnailUrl(media)}
                                        alt=""
                                        className="size-16 rounded-md border-2 border-white object-cover shadow-[0_4px_10px_-6px_rgba(30,36,48,.6)]"
                                        style={{ transform: `rotate(${tiltFor(`${memory.id}:${index}`, 3)}deg)` }}
                                        loading="lazy"
                                        decoding="async"
                                      />
                                    ))}
                                  </span>
                                ) : null}
                                <p className="mt-3 text-[12px] font-semibold text-[#9aa2b0]">点开读全文 →</p>
                              </ScrapPaperCard>
                              {editEnabled ? <div className="mt-2">{editActions}</div> : null}
                            </div>
                          )
                        })}
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ) : place.status === 'planned' ? (
            <ScrapPaperCard seed={`${place.id}:plan`} className="px-5 py-6">
              <p className="text-sm leading-6 text-[#5b6472]">计划日期：待定。行程确定后会显示在这里。</p>
            </ScrapPaperCard>
          ) : null}

          {/* ── Photo wall ─────────────────────────────────────────────── */}
          <section ref={wallRef} aria-label="照片墙" className="mt-16 scroll-mt-24">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="scrap-section-title">照片墙 · Photos</h2>
              {editEnabled ? (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={addMediaBusy}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex h-11 items-center gap-2 rounded-full border border-black/10 bg-white px-4 text-xs font-semibold text-[#28313d] transition hover:bg-[#fffdf6] active:scale-95 disabled:opacity-60"
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
              <p className="mt-2 text-[11px] leading-5 text-[#8b93a1]">
                网页上传目前仅支持 JPG / PNG / WebP / AVIF 图片；视频请直接放入 MediaInbox 后运行 media:import。
              </p>
            ) : null}

            {deleteError ? (
              <p role="alert" className="mt-3 whitespace-pre-line text-xs font-semibold text-[#c0453f]">
                {deleteError}
              </p>
            ) : null}
            {addMediaState.phase === 'uploading' ? (
              <p role="status" className="mt-3 text-xs font-semibold text-[#3d7ab8]">
                正在接收照片 {addMediaState.done + 1} / {addMediaState.total}…
              </p>
            ) : null}
            {addMediaState.phase === 'importing' ? (
              <p role="status" className="mt-3 text-xs font-semibold text-[#3d7ab8]">
                照片已进入私有投递箱，正在生成网页资源…
              </p>
            ) : null}
            {addMediaState.phase === 'error' ? (
              <p role="alert" className="mt-3 whitespace-pre-line text-xs font-semibold text-[#c0453f]">
                {addMediaState.message}
              </p>
            ) : null}

            {galleryPhotos.length > 0 ? (
              <>
                <div className="mt-7 grid grid-cols-2 gap-x-4 gap-y-9 sm:grid-cols-3 lg:gap-x-6">
                  {galleryPhotos.map((photo, index) => (
                    <Polaroid
                      key={photo.id}
                      src={mediaService.getThumbnailUrl(photo)}
                      alt={photo.alt ?? `${place.nameEn ?? place.name} photo ${index + 1}`}
                      seed={polaroidSeed(place.id, photo.id)}
                      caption={photo.capturedAt ? scrapMonthLabel(photo.capturedAt) : undefined}
                      imgClassName="aspect-[4/5]"
                      onClick={() => openWall(photo.id)}
                    />
                  ))}
                </div>
                <WaveDoodle className="mx-auto mt-10 w-24 opacity-70" />
              </>
            ) : (
              <ScrapPaperCard seed={`${place.id}:nophoto`} className="mt-6 px-5 py-10 text-center">
                <p className="text-sm text-[#5b6472]">
                  还没有照片。{editEnabled ? '点击「添加照片」即可从本机导入。' : '照片导入后会显示在这里。'}
                </p>
              </ScrapPaperCard>
            )}
          </section>
        </div>
      </main>

      {/* ── Visit filter dock ──────────────────────────────────────────── */}
      {visits.length > 1 ? (
        <nav
          aria-label="选择到访"
          className="scrap-dock-bar pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(16px,env(safe-area-inset-bottom))] lg:pb-6"
        >
          <div className="scrap-dock pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full px-2.5 py-2">
            <button
              type="button"
              aria-pressed={selectedVisitId === 'all'}
              onClick={() => setSelectedVisitId('all')}
              className={`h-9 shrink-0 rounded-full px-4 text-[12.5px] font-bold transition ${
                selectedVisitId === 'all' ? 'scrap-dock-active' : 'text-[#5b6472] hover:text-[#1b2430]'
              }`}
            >
              全部
            </button>
            {visits.map((visit) => {
              const isActive = selectedVisitId === visit.id
              return (
                <button
                  key={visit.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setSelectedVisitId(isActive ? 'all' : visit.id)}
                  className={`h-9 shrink-0 rounded-full px-4 text-[12.5px] font-bold transition ${
                    isActive ? 'scrap-dock-active' : 'text-[#5b6472] hover:text-[#1b2430]'
                  }`}
                >
                  {formatVisitWindow(visit).replace(/^\d{4}\./, '')}
                  {getVisitStatus(visit) === 'planned' ? ' ·计划' : ''}
                </button>
              )
            })}
          </div>
        </nav>
      ) : null}

      {selectedMemory ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`记忆详情：${selectedMemory.title ?? memoryTypeLabels[selectedMemory.type]}`}
          className="scrap-root fixed inset-0 z-[80] overflow-y-auto overscroll-contain"
        >
          <header className="scrap-header sticky top-0 z-30">
            <div className="mx-auto flex w-full max-w-[720px] items-center gap-3 px-4 py-3 lg:max-w-[1180px] lg:px-8">
              <button
                type="button"
                onClick={() => setSelectedMemoryId(undefined)}
                className="grid size-11 shrink-0 place-items-center rounded-full border border-black/8 bg-white text-[#232c38] shadow-[0_6px_16px_-8px_rgba(30,36,48,.6)] transition hover:bg-[#fffdf6] active:scale-95"
                aria-label={`返回${place.name}详情`}
                title={`返回${place.name}`}
              >
                <ArrowLeft className="size-5" />
              </button>
              <div className="min-w-0 flex-1 text-center">
                <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-[#98a0ae]">
                  {SelectedMemoryTypeIcon ? <SelectedMemoryTypeIcon className="size-3.5" aria-hidden="true" /> : null}
                  {memoryTypeLabels[selectedMemory.type]}
                </p>
                <p className="mt-0.5 truncate text-[11.5px] font-medium text-[#7b8494]">
                  {[formatMemoryDate(selectedMemory), selectedMemory.locationName].filter(Boolean).join(' · ')
                    || place.name}
                </p>
              </div>
              <span className="size-11 shrink-0" aria-hidden="true" />
            </div>
          </header>

          <div className="mx-auto w-full max-w-[640px] px-4 pb-28 pt-4 lg:px-8">
            {activeMemoryMedia ? (
              <div className="relative">
                <PaperTape seed={`${selectedMemory.id}:hero`} tone="butter" className="-top-3 left-1/2 z-20 -ml-10" />
                <figure className="scrap-polaroid" style={{ transform: `rotate(${tiltFor(selectedMemory.id, 1.2)}deg)` }}>
                  <img
                    key={activeMemoryMedia.id}
                    src={mediaService.getUrl(activeMemoryMedia)}
                    alt={activeMemoryMedia.alt ?? selectedMemory.title ?? ''}
                    className="w-full bg-[#e9e4da] object-cover"
                    decoding="async"
                  />
                </figure>
                {selectedMemoryMedia.length > 1 ? (
                  <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                    {selectedMemoryMedia.map((media, index) => (
                      <button
                        key={media.id}
                        type="button"
                        aria-label={`切换到照片 ${index + 1}`}
                        aria-pressed={index === memoryPhotoIndex}
                        onClick={() => setMemoryPhotoIndex(index)}
                        className={`shrink-0 overflow-hidden rounded-lg border-2 transition ${
                          index === memoryPhotoIndex
                            ? 'border-[#6a4cf0] shadow-[0_0_0_2px_rgba(255,255,255,.9)]'
                            : 'border-white opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={mediaService.getThumbnailUrl(media)}
                          alt=""
                          className="size-14 object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <h1 className="mt-8 text-[26px] font-bold leading-tight tracking-tight text-[#1b2430] sm:text-[30px]">
              {selectedMemory.title ?? '未命名记忆'}
            </h1>

            {selectedMemory.body ? (
              <ScrapPaperCard seed={`${selectedMemory.id}:full`} className="mt-5 px-5 py-6 sm:px-7 sm:py-7">
                <div className="scrap-hand space-y-3 text-[17.5px] leading-[2] text-[#333c4a] sm:text-[18px]">
                  {splitParagraphs(selectedMemory.body).map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                </div>
              </ScrapPaperCard>
            ) : null}

            {selectedMemory.tags && selectedMemory.tags.length > 0 ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {selectedMemory.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-black/8 bg-white/80 px-3 py-1 text-[12px] font-semibold text-[#6b7482]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

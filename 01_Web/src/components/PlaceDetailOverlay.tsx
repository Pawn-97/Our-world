import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ImagePlus, Loader2, X } from 'lucide-react'
import { localEditorAvailable } from '../data/editorState'
import { importLocalMedia, reloadAfterLocalSave, uploadLocalMedia } from '../data/localEditorApi'
import type { CountryGroup } from '../domain/viewModel'
import { placeStatusLabels } from '../domain/types'
import type { Media, Memory, Place, Visit, VisitId } from '../domain/types'
import { mediaService } from '../services/mediaService'
import { statusDotStyle } from './placeStatusStyle'
import type { PlacePhotoGalleryRequest } from './PlacePhotoGalleryModal'

type PlaceDetailOverlayProps = {
  place: Place
  group?: CountryGroup
  visits: Visit[]
  memoriesByVisitId: Record<VisitId, Memory[]>
  photos: Media[]
  cover?: Media
  dateRangeLabel: string
  onClose: () => void
  onOpenPhotos: (request: PlacePhotoGalleryRequest) => void
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

// Immersive place detail page (overlay, no router). Data arrives as plain
// props from useWorldContent — Place → Visit → Memory plus gallery media.
export function PlaceDetailOverlay({
  place,
  group,
  visits,
  memoriesByVisitId,
  photos,
  cover,
  dateRangeLabel,
  onClose,
  onOpenPhotos,
}: PlaceDetailOverlayProps) {
  const accent = group?.accent ?? '#38bdf8'
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [addMediaState, setAddMediaState] = useState<AddMediaState>({ phase: 'idle' })
  const addMediaBusy = addMediaState.phase === 'uploading' || addMediaState.phase === 'importing'

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  // One-step add media (dev/local editor only): pick → upload → import → reload.
  const addMedia = async (files: FileList | null) => {
    if (!files?.length) return
    const fileList = Array.from(files)
    try {
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
      reloadAfterLocalSave()
    } catch (error) {
      setAddMediaState({
        phase: 'error',
        message: error instanceof Error ? error.message : '照片导入失败。',
      })
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
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

        {visits.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
              到访 · Visits
            </h2>
            <div className="mt-4 space-y-6">
              {visits.map((visit) => {
                const visitMemories = memoriesByVisitId[visit.id] ?? []
                return (
                  <article
                    key={visit.id}
                    className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      {formatVisitDates(visit)}
                    </p>
                    <h3 className="mt-1.5 text-lg font-semibold text-slate-100">
                      {visit.title ?? '未命名行程'}
                    </h3>
                    {visit.summary ? (
                      <p className="mt-1.5 text-sm leading-6 text-slate-400">{visit.summary}</p>
                    ) : null}
                    {visitMemories.length > 0 ? (
                      <ul className="mt-4 space-y-3 border-l border-white/12 pl-4">
                        {visitMemories.map((memory) => (
                          <li key={memory.id}>
                            <p className="text-xs font-medium text-slate-500">{memory.date ?? ''}</p>
                            <p className="mt-0.5 text-sm font-semibold text-slate-200">
                              {memory.title ?? '未命名记忆'}
                            </p>
                            {memory.body ? (
                              <p className="mt-1 text-sm leading-6 text-slate-400">{memory.body}</p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                )
              })}
            </div>
          </section>
        ) : null}

        <div className="mt-10 flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
            照片 · Photos
          </h2>
          {localEditorAvailable ? (
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

        {localEditorAvailable ? (
          <p className="mt-2 text-[11px] leading-5 text-slate-500">
            网页上传目前仅支持 JPG / PNG / WebP / AVIF 图片；视频请直接放入 MediaInbox 后运行 media:import。文本记忆请在 content/memories.json 中维护。
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

        {photos.length > 0 ? (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo, index) => (
              <button
                key={photo.id}
                type="button"
                className="group overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition hover:border-white/24"
                aria-label={`查看照片 ${index + 1}`}
                onClick={() => onOpenPhotos({
                  photos,
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
            还没有照片。{localEditorAvailable ? '点击右上角「添加照片」即可从本机导入。' : '照片导入后会显示在这里。'}
          </div>
        )}
      </div>
    </div>
  )
}

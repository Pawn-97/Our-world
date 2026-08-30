import { X } from 'lucide-react'
import type { CountryGroup } from '../domain/viewModel'
import { placeStatusLabels } from '../domain/types'
import type { Media, Place } from '../domain/types'
import { mediaService } from '../services/mediaService'
import { statusDotStyle } from './placeStatusStyle'

type PlacePreviewSheetProps = {
  place: Place
  group?: CountryGroup
  /** Curated cover photo; an elegant placeholder renders when absent. */
  cover?: Media
  /** Completed visits only. */
  visitCount: number
  /** Latest completed-visit date (e.g. "2025-04-06"); empty when unknown. */
  lastVisitDateLabel?: string
  onClose: () => void
  onOpenDetail: () => void
}

// Mobile-only compact place preview: shown below the 1100px sidebar
// breakpoint when a place marker is selected. It floats above the bottom
// dock so globe gestures and dock controls stay reachable.
export function PlacePreviewSheet({
  place,
  group,
  cover,
  visitCount,
  lastVisitDateLabel,
  onClose,
  onOpenDetail,
}: PlacePreviewSheetProps) {
  const accent = group?.accent ?? '#38bdf8'

  return (
    <section
      aria-label={`${place.name} preview`}
      className="place-preview-sheet pointer-events-auto fixed inset-x-3 z-40 rounded-3xl border border-white/14 bg-slate-950/82 p-4 text-left shadow-[0_24px_60px_rgba(2,6,23,0.62)] backdrop-blur-2xl"
      style={{ bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="flex items-start gap-3">
        {cover ? (
          <img
            src={mediaService.getThumbnailUrl(cover)}
            alt={cover.alt ?? `${place.nameEn ?? place.name} cover`}
            className="h-20 w-20 shrink-0 rounded-2xl border border-white/14 object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div
            className="h-20 w-20 shrink-0 rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_26%_22%,rgba(255,255,255,0.6),transparent_28%),linear-gradient(135deg,rgba(14,165,233,0.35),rgba(2,8,23,0.72)),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[length:auto,auto,14px_14px]"
            style={{ backgroundColor: accent }}
            aria-hidden="true"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                {group ? `${group.name} · ${group.nameEn ?? ''}` : 'Place'}
              </p>
              <h2 className="mt-1 truncate text-xl font-semibold text-slate-50">
                {place.name}
                {place.nameEn && place.nameEn !== place.name ? (
                  <span className="ml-2 text-sm font-medium text-slate-400">{place.nameEn}</span>
                ) : null}
              </h2>
            </div>
            <button
              type="button"
              aria-label="关闭地点预览"
              className="grid size-11 shrink-0 place-items-center rounded-full border border-white/16 bg-white/8 text-slate-200 transition active:scale-95"
              onClick={onClose}
            >
              <X className="size-5" />
            </button>
          </div>
          <p className="mt-1 flex items-center gap-2 text-xs font-medium text-slate-400">
            <span className="inline-block size-2 shrink-0 rounded-full" style={statusDotStyle(place.status, accent)} aria-hidden="true" />
            {placeStatusLabels[place.status]}
            {place.status === 'visited' && visitCount > 0 ? ` · ${visitCount} 次到访` : ''}
            {place.status === 'visited' && lastVisitDateLabel ? ` · 最近 ${lastVisitDateLabel}` : ''}
          </p>
        </div>
      </div>
      {place.summary ? (
        <p className="mt-3 line-clamp-3 border-l-2 pl-3 text-sm leading-6 text-slate-300" style={{ borderColor: accent }}>
          {place.summary}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onOpenDetail}
        className="mt-3 flex h-12 w-full items-center justify-center rounded-full bg-sky-500/90 text-sm font-semibold text-white transition active:scale-[0.98]"
      >
        查看详情 · Open
      </button>
    </section>
  )
}

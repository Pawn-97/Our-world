import { useMemo, useRef, useState } from 'react'
import { CalendarDays, Compass, GripVertical, Layers3, Star, X } from 'lucide-react'
import { localEditorAvailable, mediaEditorState } from '../data/editorState'
import { importLocalMedia, reloadAfterLocalSave, updateLocalEditorState, uploadLocalMedia } from '../data/localEditorApi'
import type { CountryGroup } from '../domain/viewModel'
import { placeStatusLabels } from '../domain/types'
import type { Media, Place, PlaceId, SelectionMode } from '../domain/types'
import { mediaService } from '../services/mediaService'
import { statusDotStyle } from './placeStatusStyle'
import type { PlacePhotoGalleryRequest } from './PlacePhotoGalleryModal'
import { LocalEditorToolbar } from './LocalEditorToolbar'
import { useFlipLayout } from './useFlipLayout'

type InfoCardProps = {
  mode: SelectionMode
  worldName: string
  group?: CountryGroup
  place?: Place
  /** Gallery photos for the selected place (visible, curated order). */
  photos: Media[]
  /** Cover lookup used by country-mode place cards. */
  coverForPlace: (placeId: PlaceId) => Media | undefined
  /** Saved hidden photo ids for the selected place (editor restore flow). */
  hiddenPhotoIds: string[]
  dateRangeForPlace: (placeId: PlaceId) => string
  onSelectPlace?: (placeId: PlaceId) => void
  onOpenPhotos?: (request: PlacePhotoGalleryRequest) => void
  onOpenPlaceDetail?: () => void
}

// Right-hand panel: overview intro, country place cards, or the selected
// place with its photo grid. The old city add/reorder/hide record editing was
// removed in Milestone 2; photo order/hide/cover curation remains (dev only).
export function InfoCard({
  mode,
  worldName,
  group,
  place,
  photos,
  coverForPlace,
  hiddenPhotoIds,
  dateRangeForPlace,
  onSelectPlace,
  onOpenPhotos,
  onOpenPlaceDetail,
}: InfoCardProps) {
  const isPlaceMode = mode === 'place' && place && group
  const isOverview = mode === 'overview' || !group
  const groupPlaces = useMemo(() => group?.places ?? [], [group])
  const isCountryGrid = mode === 'country' && Boolean(group)
  const isPhotoGrid = isPlaceMode && photos.length > 0
  const usesGridPreview = isCountryGrid || Boolean(isPlaceMode)
  const memorySectionLabel = isPlaceMode ? 'Place photos' : 'Place cards'
  const placeCover = useMemo(() => (isPlaceMode && place ? coverForPlace(place.id) : undefined), [coverForPlace, isPlaceMode, place])
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [photoEditing, setPhotoEditing] = useState(false)
  const [editorNotice, setEditorNotice] = useState('')
  const [editorBusy, setEditorBusy] = useState(false)
  const [draggedPhotoId, setDraggedPhotoId] = useState<string>()
  const [draftPhotoIds, setDraftPhotoIds] = useState<string[]>(photos.map((item) => item.id))
  const [draftHiddenPhotoIds, setDraftHiddenPhotoIds] = useState<string[]>(mediaEditorState.hiddenMediaIds)
  const [draftCoverPhotoId, setDraftCoverPhotoId] = useState<string | undefined>(placeCover?.id)
  const photoByDraftId = new Map(photos.map((item) => [item.id, item]))
  const displayedPhotos = photoEditing
    ? draftPhotoIds.map((id) => photoByDraftId.get(id)).filter(Boolean)
    : photos
  const memoryGridRef = useFlipLayout<HTMLDivElement>(draftPhotoIds.join('|'))
  const knownPhotoIdsForPlace = new Set([...photos.map((photo) => photo.id), ...hiddenPhotoIds])
  const hiddenPhotoIdsForPlace = draftHiddenPhotoIds.filter((id) => knownPhotoIdsForPlace.has(id))

  const savePhotoDraft = async () => {
    if (!place) return
    setEditorBusy(true)
    setEditorNotice('正在保存照片布局…')
    try {
      await updateLocalEditorState((current) => ({
        ...current,
        mediaOrderByPlace: { ...current.mediaOrderByPlace, [place.id]: draftPhotoIds },
        hiddenMediaIds: draftHiddenPhotoIds,
        coverMediaByPlace: draftCoverPhotoId
          ? { ...current.coverMediaByPlace, [place.id]: draftCoverPhotoId }
          : current.coverMediaByPlace,
      }))
      reloadAfterLocalSave()
    } catch (error) {
      setEditorNotice(error instanceof Error ? error.message : '保存失败。')
      setEditorBusy(false)
    }
  }

  const uploadPhotos = async (files: FileList | null) => {
    if (!files?.length || !place) return
    setEditorBusy(true)
    setEditorNotice(`正在接收 ${files.length} 张照片…`)
    try {
      const uploadedSourcePaths: string[] = []
      for (const file of Array.from(files)) {
        const uploaded = await uploadLocalMedia({ placeId: place.id, kind: 'photo', file })
        uploadedSourcePaths.push(uploaded.sourcePath)
      }
      setEditorNotice('照片已进入私有投递箱，正在生成三级网页资源…')
      await importLocalMedia(uploadedSourcePaths)
      reloadAfterLocalSave()
    } catch (error) {
      setEditorNotice(error instanceof Error ? error.message : '照片导入失败。')
      setEditorBusy(false)
    } finally {
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

  const openGallery = (galleryMode: PlacePhotoGalleryRequest['mode'], initialPhotoId?: string) => {
    if (!isPhotoGrid || !place) return
    onOpenPhotos?.({
      photos,
      placeName: place.name,
      initialPhotoId,
      mode: galleryMode,
    })
  }

  const eyebrowLabel = isOverview ? 'Overview' : isPlaceMode ? 'Place info' : 'Selected country'
  const title = isOverview ? worldName : isPlaceMode ? place.name : group.name
  const titleDetail = isOverview
    ? 'World overview'
    : isPlaceMode
      ? `${place.name}${place.nameEn ? ` / ${place.nameEn}` : ''}`
      : `${group.name}${group.nameEn ? ` / ${group.nameEn}` : ''}`
  const subtitle = isOverview
    ? 'Select a country or place'
    : isPlaceMode
      ? `${placeStatusLabels[place.status]}${place.status === 'visited' ? ` · ${dateRangeForPlace(place.id)}` : ''}`
      : `${group.visitCount} visits · ${group.dateRangeLabel}`
  const summary = isOverview
    ? 'A soft overview of the places we have been, the ones we plan to visit, and the ones still on the wishlist.'
    : isPlaceMode
      ? place.summary
      : `${group.places.length} places · ${group.region ?? ''}`

  return (
    <aside
      className="atlas-info-panel selector-scrollbar glass-panel pointer-events-auto relative z-10 flex w-full max-w-sm flex-col overflow-hidden p-5 text-left"
      data-memory-layout={usesGridPreview ? 'grid' : 'track'}
    >
      <div className="atlas-info-header mb-5 flex shrink-0 items-center justify-between gap-3">
        <div className="atlas-panel-body">
          <p className="atlas-card-eyebrow text-xs font-semibold uppercase tracking-[0.24em] text-white">
            {eyebrowLabel}
          </p>
          <h2 className="atlas-card-title mt-2 text-2xl font-semibold tracking-normal text-slate-950">
            {title}
          </h2>
          {!isOverview ? (
            <>
              <p className="mt-1 text-sm font-medium text-slate-600">
                {isPlaceMode ? place.nameEn : group.nameEn}
              </p>
              <p className="mt-2 flex items-center gap-2 text-sm font-medium text-white">
                {isPlaceMode ? (
                  <span className="inline-block size-2 shrink-0 rounded-full" style={statusDotStyle(place.status, group.accent)} aria-hidden="true" />
                ) : null}
                {subtitle}
              </p>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <div className="atlas-panel-body grid size-11 place-items-center rounded-full bg-slate-950 text-white shadow-lg">
            <CalendarDays className="size-5" />
          </div>
        </div>
      </div>

      <div className="atlas-info-content atlas-panel-body flex min-h-0 flex-1 flex-col gap-4">
        {isOverview ? (
          <div>
            <p className="text-sm text-slate-500">
              {subtitle}
            </p>
            <h3 className="mt-1 text-xl font-semibold tracking-normal text-slate-950">
              {titleDetail}
            </h3>
          </div>
        ) : null}

        {isPlaceMode ? (
          <div className="atlas-preview-card shrink-0 overflow-hidden rounded-[22px] border border-white/70 bg-white/50 shadow-[0_16px_50px_rgba(15,23,42,0.1)]">
            {placeCover ? (
              <img
                src={mediaService.getThumbnailUrl(placeCover)}
                alt={placeCover.alt ?? `${place.nameEn ?? place.name} travel preview`}
                className="h-24 w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div
                className="h-24 bg-[radial-gradient(circle_at_22%_22%,rgba(255,255,255,0.95),transparent_24%),linear-gradient(135deg,rgba(14,165,233,0.52),rgba(15,23,42,0.78)),linear-gradient(90deg,rgba(255,255,255,0.24)_1px,transparent_1px)] bg-[length:auto,auto,28px_28px]"
                style={{ backgroundColor: group.accent }}
              />
            )}
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Preview image
              </span>
              <span className="text-xs font-medium text-slate-500">{place.nameEn}</span>
            </div>
          </div>
        ) : null}

        {isPlaceMode && onOpenPlaceDetail ? (
          <button
            type="button"
            onClick={onOpenPlaceDetail}
            className="atlas-panel-body flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-slate-950/80 bg-slate-950 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(15,23,42,0.2)] transition hover:bg-slate-800 active:scale-[0.98]"
          >
            查看详情 · Open place
          </button>
        ) : null}

        <div className="grid shrink-0 grid-cols-2 gap-3">
          <div className="atlas-info-metric rounded-[18px] border border-white/60 bg-white/55 p-3">
            <p className="text-xs text-slate-400">
              {isOverview ? 'Mode' : isPlaceMode ? 'Country' : 'Places'}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {isOverview
                ? 'Overview'
                : isPlaceMode
                  ? group.nameEn
                  : `${group.places.length} ${group.places.length === 1 ? 'place' : 'places'}`}
            </p>
          </div>
          <div className="atlas-info-metric rounded-[18px] border border-white/60 bg-white/55 p-3">
            <p className="text-xs text-slate-400">{isOverview ? 'Keywords' : 'Region'}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {isOverview ? 'Travel / Life' : group.region ?? '—'}
            </p>
          </div>
        </div>

        {isOverview ? <p className="text-sm leading-6 text-slate-600">{summary}</p> : null}

        {(isCountryGrid || isPlaceMode) && (
          (isPlaceMode ? photos.length > 0 : groupPlaces.length > 0) || localEditorAvailable
        ) ? (
          <div
            className={`atlas-memory-panel flex min-h-0 flex-col rounded-[22px] bg-slate-950 p-3 text-white shadow-[0_18px_50px_rgba(15,23,42,0.2)] ${
              usesGridPreview ? 'atlas-memory-panel-grid-preview' : ''
            }`}
            data-photo-gallery={isPlaceMode ? 'true' : undefined}
            onClick={isPhotoGrid ? () => openGallery('grid') : undefined}
          >
            <div className="atlas-memory-panel-heading-row mb-3">
              {isPlaceMode ? (
                <button
                  type="button"
                  className="atlas-memory-panel-heading flex shrink-0 items-center gap-2"
                  disabled={!isPhotoGrid || photoEditing}
                  onClick={(event) => {
                    event.stopPropagation()
                    openGallery('grid')
                  }}
                >
                  <Layers3 className="size-4 text-sky-300" />
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    {memorySectionLabel}
                  </span>
                </button>
              ) : (
                <div className="flex shrink-0 items-center gap-2">
                  <Layers3 className="size-4 text-sky-300" />
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    {memorySectionLabel}
                  </p>
                </div>
              )}
              {isPlaceMode && localEditorAvailable ? (
                <LocalEditorToolbar
                  editing={photoEditing}
                  busy={editorBusy}
                  label="地点照片"
                  onToggle={() => {
                    setPhotoEditing((editing) => !editing)
                    setDraftPhotoIds(photos.map((photo) => photo.id))
                    setDraftHiddenPhotoIds(mediaEditorState.hiddenMediaIds)
                    setDraftCoverPhotoId(placeCover?.id)
                    setEditorNotice('')
                  }}
                  onReset={() => {
                    setDraftPhotoIds(photos.map((photo) => photo.id))
                    setDraftHiddenPhotoIds(mediaEditorState.hiddenMediaIds)
                    setDraftCoverPhotoId(placeCover?.id)
                    setEditorNotice('已撤销本轮尚未保存的照片调整。')
                  }}
                  onAdd={() => photoInputRef.current?.click()}
                  onSave={savePhotoDraft}
                />
              ) : null}
              {isPlaceMode ? (
                <input
                  ref={photoInputRef}
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  multiple
                  onChange={(event) => void uploadPhotos(event.currentTarget.files)}
                />
              ) : null}
            </div>

            {editorNotice ? <p className="atlas-local-editor-notice atlas-local-editor-notice-dark" role="status">{editorNotice}</p> : null}

            {isPlaceMode && photoEditing && hiddenPhotoIdsForPlace.length > 0 ? (
              <button
                type="button"
                className="atlas-local-editor-restore"
                disabled={editorBusy}
                onClick={(event) => {
                  event.stopPropagation()
                  setEditorBusy(true)
                  void updateLocalEditorState((current) => ({
                    ...current,
                    hiddenMediaIds: current.hiddenMediaIds.filter((id) => !hiddenPhotoIdsForPlace.includes(id)),
                  })).then(reloadAfterLocalSave).catch((error: unknown) => {
                    setEditorNotice(error instanceof Error ? error.message : '恢复失败。')
                    setEditorBusy(false)
                  })
                }}
              >
                恢复本地点已隐藏照片（{hiddenPhotoIdsForPlace.length}）
              </button>
            ) : null}

            {isPlaceMode && displayedPhotos.length === 0 ? (
              <div className="atlas-local-editor-empty">暂无照片。点击设置，再点＋即可从本机导入。</div>
            ) : null}
            <div
              ref={memoryGridRef}
              className={`atlas-memory-track selector-scrollbar min-h-0 gap-3 overflow-auto pb-2 ${
                usesGridPreview ? 'atlas-memory-grid-preview' : 'flex snap-x'
              }`}
            >
              {isPlaceMode ? displayedPhotos.map((photo, index) => {
                if (!photo) return null
                return (
                <button
                  type="button"
                  key={photo.id}
                  data-flip-id={photo.id}
                  className="city-photo-card"
                  data-editing={photoEditing}
                  data-dragging={draggedPhotoId === photo.id}
                  draggable={photoEditing}
                  aria-label={`Open ${place.nameEn ?? place.name} photo ${index + 1}`}
                  onDragStart={(event) => {
                    if (!photoEditing) return
                    setDraggedPhotoId(photo.id)
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', photo.id)
                  }}
                  onDragOver={(event) => {
                    if (!photoEditing || !draggedPhotoId || draggedPhotoId === photo.id) return
                    event.preventDefault()
                    setDraftPhotoIds((current) => {
                      const next = current.filter((id) => id !== draggedPhotoId)
                      next.splice(next.indexOf(photo.id), 0, draggedPhotoId)
                      return next
                    })
                  }}
                  onDragEnd={() => setDraggedPhotoId(undefined)}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (!photoEditing) openGallery('viewer', photo.id)
                  }}
                >
                  <img
                    src={mediaService.getThumbnailUrl(photo)}
                    alt={photo.alt ?? `${place.nameEn ?? place.name} photo ${index + 1}`}
                    loading="lazy"
                    decoding="async"
                  />
                  {photoEditing ? (
                    <span className="atlas-local-media-tools" onClick={(event) => event.stopPropagation()}>
                      <span className="atlas-local-editor-drag" aria-label="拖动照片排序"><GripVertical /></span>
                      <span
                        role="button"
                        tabIndex={0}
                        data-active={draftCoverPhotoId === photo.id}
                        aria-label="设为封面"
                        title="设为封面"
                        onClick={() => setDraftCoverPhotoId(photo.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') setDraftCoverPhotoId(photo.id)
                        }}
                      ><Star /></span>
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="隐藏照片"
                        title="隐藏（不删除原图）"
                        onClick={() => {
                          setDraftPhotoIds((current) => current.filter((id) => id !== photo.id))
                          setDraftHiddenPhotoIds((current) => [...new Set([...current, photo.id])])
                          if (draftCoverPhotoId === photo.id) setDraftCoverPhotoId(undefined)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            setDraftPhotoIds((current) => current.filter((id) => id !== photo.id))
                            setDraftHiddenPhotoIds((current) => [...new Set([...current, photo.id])])
                          }
                        }}
                      ><X /></span>
                    </span>
                  ) : null}
                  {draftCoverPhotoId === photo.id ? <span className="atlas-local-cover-badge">封面</span> : null}
                </button>
              )}) : groupPlaces.map((groupPlace, index) => {
                const isActive = groupPlace.id === place?.id
                const placeCardCover = coverForPlace(groupPlace.id)

                return (
                  <button
                    type="button"
                    key={groupPlace.id}
                    data-flip-id={groupPlace.id}
                    onClick={() => onSelectPlace?.(groupPlace.id)}
                    aria-pressed={isActive}
                    className={`memory-city-card overflow-hidden rounded-[18px] border transition ${
                      usesGridPreview
                        ? 'memory-city-card-grid-preview min-w-0'
                        : 'min-w-[154px] snap-start'
                    } ${
                      isActive ? 'border-sky-300/90 bg-white/18 shadow-[0_0_34px_rgba(125,211,252,0.2)]' : 'border-white/10 bg-white/10'
                    }`}
                  >
                    {placeCardCover ? (
                      <img
                        src={mediaService.getThumbnailUrl(placeCardCover)}
                        alt={placeCardCover.alt ?? `${groupPlace.nameEn ?? groupPlace.name} cover`}
                        className={`w-full object-cover ${usesGridPreview ? 'h-[52px]' : 'h-24'}`}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div
                        className={`${usesGridPreview ? 'h-[52px]' : 'h-24'} bg-[radial-gradient(circle_at_24%_20%,rgba(255,255,255,0.92),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.24),rgba(15,23,42,0.28)),linear-gradient(120deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[length:auto,auto,22px_22px]`}
                        style={{ backgroundColor: group?.accent ?? '#38bdf8' }}
                      />
                    )}
                    <div className="p-3">
                      <div className="memory-city-card-heading">
                        <h4 className="memory-city-card-title text-sm font-semibold text-white">{groupPlace.name}</h4>
                        <p className="memory-city-card-index text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                          {String(index + 1).padStart(2, '0')}
                        </p>
                      </div>
                      <p className="memory-city-card-subtitle text-xs text-slate-300">{groupPlace.nameEn}</p>
                      <p className="memory-city-card-date mt-2 flex items-center gap-1.5 text-xs leading-5 text-slate-300">
                        <span className="inline-block size-2 shrink-0 rounded-full" style={statusDotStyle(groupPlace.status, group?.accent ?? '#38bdf8')} aria-hidden="true" />
                        {placeStatusLabels[groupPlace.status]}
                        {groupPlace.status === 'visited' ? ` · ${dateRangeForPlace(groupPlace.id)}` : ''}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        <div className="flex shrink-0 items-center gap-2 text-xs font-medium text-slate-500">
          <Compass className="size-4" />
          Focus: {isOverview ? 'World overview' : isPlaceMode ? place.nameEn : group.nameEn}
        </div>
      </div>
    </aside>
  )
}

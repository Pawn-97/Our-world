import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, MapPin, Plus, RotateCcw, SlidersHorizontal } from 'lucide-react'
import type { CountryGroup } from '../domain/viewModel'
import { placeStatusLabels } from '../domain/types'
import type { CountryGroupId, PlaceId, PlaceStatus } from '../domain/types'
import { statusDotStyle } from './placeStatusStyle'

type StatusFilter = PlaceStatus | 'all'

const statusFilterOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'visited', label: placeStatusLabels.visited },
  { value: 'planned', label: placeStatusLabels.planned },
  { value: 'wishlist', label: placeStatusLabels.wishlist },
]

type CountrySelectorProps = {
  countryGroups: CountryGroup[]
  selectedCountryGroupId?: CountryGroupId
  selectedPlaceId?: PlaceId
  globeDistance: number
  /**
   * Narrow-layout mode: tapping a country card only expands/collapses its
   * place list (no flyTo, no panel collapse); tapping a place item still
   * selects and flies. Desktop behavior is unchanged.
   */
  countryExpandOnly?: boolean
  /** Local editor (dev-only): shows the "新增地点" entry when edit mode is on. */
  editEnabled?: boolean
  imageryBrightness: number
  imageryContrast: number
  imagerySaturation: number
  onBrightnessChange: (value: number) => void
  onContrastChange: (value: number) => void
  onCreatePlace?: () => void
  onHoverCountryGroup: (countryGroupId?: CountryGroupId) => void
  onResetImageryTuning: () => void
  onSaturationChange: (value: number) => void
  onSelectCountryGroup: (countryGroupId: CountryGroupId) => void
  onSelectPlace: (placeId: PlaceId) => void
  onDistanceChange: (distance: number) => void
  onResetView: () => void
}

const scaleLabelForDistance = (distance: number) => {
  if (distance < 1.15) return 'Street'
  if (distance < 1.68) return 'City'
  if (distance < 2.55) return 'Country'
  return 'World'
}

const debugGlobeScaleChange = (value: number) => {
  if (!import.meta.env.DEV) return

  console.debug('[globe-scale-change]', JSON.stringify({
    value,
    label: scaleLabelForDistance(value),
    time: Date.now(),
  }))
}

// Browse-only country/place navigation (Milestone 2): the old record-editing
// controls (add country / add record / reorder / hide) were removed with the
// travel-map data model; content is now edited in content/*.json.
export function CountrySelector({
  countryGroups,
  selectedCountryGroupId,
  selectedPlaceId,
  globeDistance,
  countryExpandOnly = false,
  editEnabled = false,
  imageryBrightness,
  imageryContrast,
  imagerySaturation,
  onBrightnessChange,
  onContrastChange,
  onCreatePlace,
  onHoverCountryGroup,
  onResetImageryTuning,
  onSaturationChange,
  onSelectCountryGroup,
  onSelectPlace,
  onDistanceChange,
  onResetView,
}: CountrySelectorProps) {
  const committedDistanceRef = useRef(globeDistance)
  const hasDraftDistanceChangeRef = useRef(false)
  const [isImageTuningOpen, setIsImageTuningOpen] = useState(false)
  const [isGlobeScaleOpen, setIsGlobeScaleOpen] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  // Narrow-layout local expansion: which country group shows its place list.
  // Independent from the globe selection so browsing the list never flies
  // the camera or collapses the panel.
  const [expandedGroupId, setExpandedGroupId] = useState<CountryGroupId | undefined>()

  // The status filter narrows the place list across all country groups;
  // groups with no matching places drop out while a filter is active.
  const visibleGroups = useMemo(
    () => countryGroups
      .map((group) => ({
        ...group,
        places: statusFilter === 'all'
          ? group.places
          : group.places.filter((place) => place.status === statusFilter),
      }))
      .filter((group) => statusFilter === 'all' || group.places.length > 0),
    [countryGroups, statusFilter],
  )

  useEffect(() => {
    committedDistanceRef.current = globeDistance
    hasDraftDistanceChangeRef.current = false
  }, [globeDistance])

  const commitGlobeDistance = (distance: number) => {
    const hasChanged = Math.abs(distance - committedDistanceRef.current) > 0.001

    if (!hasDraftDistanceChangeRef.current && !hasChanged) return

    hasDraftDistanceChangeRef.current = false
    committedDistanceRef.current = distance
    onDistanceChange(distance)
  }

  return (
    <aside className="atlas-left-panel glass-panel pointer-events-auto z-30 flex w-full max-w-[340px] flex-col p-4 text-left">
      <div className="atlas-country-panel-heading mb-4 flex items-end justify-between gap-3">
        <div className="atlas-panel-body">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white">
            Places
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-normal text-slate-950">
            我们的地点
          </h2>
        </div>
      </div>

      <div
        className="atlas-panel-body mb-3 flex shrink-0 flex-wrap gap-1.5"
        role="group"
        aria-label="按状态筛选地点"
      >
        {statusFilterOptions.map((option) => {
          const isActive = option.value === statusFilter
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => setStatusFilter(option.value)}
              className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition ${
                isActive
                  ? 'border-slate-950 bg-slate-950 text-white'
                  : 'border-white/70 bg-white/55 text-slate-600 hover:bg-white/85'
              }`}
            >
              {option.value !== 'all' ? (
                <span
                  className="inline-block size-2 shrink-0 rounded-full"
                  style={statusDotStyle(option.value, '#0ea5e9')}
                  aria-hidden="true"
                />
              ) : null}
              {option.label}
            </button>
          )
        })}
      </div>

      {editEnabled && onCreatePlace ? (
        <button
          type="button"
          onClick={onCreatePlace}
          className="atlas-panel-body mb-3 flex h-9 w-full shrink-0 items-center justify-center gap-2 rounded-full border border-dashed border-slate-400/80 bg-white/55 text-xs font-semibold text-slate-600 transition hover:bg-white/85 hover:text-slate-950"
        >
          <Plus className="size-4" />
          新增地点
        </button>
      ) : null}

      <div className="atlas-country-list atlas-panel-body selector-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto">
        {visibleGroups.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-slate-500">
            当前筛选下没有地点。
          </p>
        ) : null}
        {visibleGroups.map((group) => {
          const isSelected = group.id === selectedCountryGroupId
          const isOpen = countryExpandOnly ? group.id === expandedGroupId : isSelected

          return (
            <div
              key={group.id}
              data-flip-id={group.id}
              className="country-disclosure"
            >
              <button
                type="button"
                aria-expanded={isOpen}
                data-selected={isSelected}
                onClick={() => {
                  if (countryExpandOnly) {
                    setExpandedGroupId((current) => (current === group.id ? undefined : group.id))
                    return
                  }
                  onSelectCountryGroup(group.id)
                }}
                onPointerEnter={(event) => {
                  if (event.pointerType === 'mouse') onHoverCountryGroup(group.id)
                }}
                onPointerLeave={(event) => {
                  if (event.pointerType === 'mouse') onHoverCountryGroup(undefined)
                }}
                style={{ '--country-color': group.accent } as React.CSSProperties}
                className={`atlas-country-button group flex w-full items-center justify-between gap-3 rounded-full border px-3.5 py-2.5 text-left transition duration-300 ${
                  isSelected
                    ? 'border-slate-950 bg-slate-950 text-white shadow-[0_18px_40px_rgba(15,23,42,0.2)]'
                    : 'border-white/70 bg-white/55 text-slate-700 hover:-translate-y-0.5 hover:bg-white/85'
                }`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    className={`grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border shadow-sm ${
                      isSelected ? 'border-white/15 bg-white/12' : 'border-white/80 bg-white/75'
                    }`}
                    aria-hidden="true"
                  >
                    {group.countryCode ? (
                      <img
                        alt=""
                        className="h-full w-full object-cover"
                        src={`https://flagcdn.com/w80/${group.countryCode}.png`}
                      />
                    ) : (
                      <span className="text-base">{group.flag ?? ''}</span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold tracking-normal">{group.name}</span>
                    <span className={isSelected ? 'block truncate text-xs text-slate-300' : 'block truncate text-xs text-slate-400'}>
                      {group.nameEn}
                    </span>
                  </span>
                </span>
                <span
                  className="size-2.5 rounded-full shadow-[0_0_18px_var(--country-color)]"
                  style={{ backgroundColor: group.accent }}
                  aria-hidden="true"
                />
              </button>

              <div
                className="country-city-disclosure"
                data-open={isOpen}
                aria-hidden={!isOpen}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="relative ml-4 mt-2 space-y-1.5 border-l border-dashed border-slate-300/80 pb-1 pl-4 pr-1">
                    <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      <MapPin className="size-3 text-sky-600" />
                      Places · {group.places.length}
                    </div>

                    {group.places.map((place, index) => {
                      const isPlaceSelected = place.id === selectedPlaceId

                      return (
                        <div
                          key={place.id}
                          className="country-city-item relative"
                          style={{ '--city-index': index } as React.CSSProperties}
                        >
                          <div className="relative">
                            <span
                              className="absolute -left-[20px] top-1/2 size-2 -translate-y-1/2 rounded-full shadow-sm"
                              style={statusDotStyle(place.status, group.accent)}
                              aria-hidden="true"
                            />
                            <button
                              type="button"
                              onClick={() => onSelectPlace(place.id)}
                              data-selected={isPlaceSelected}
                              className={`atlas-city-button flex w-full items-center justify-between gap-2 rounded-full border px-3 py-2 text-left text-xs font-semibold transition duration-200 ${
                                isPlaceSelected
                                  ? 'border-sky-400 bg-sky-500 text-white shadow-[0_10px_26px_rgba(14,165,233,0.3)]'
                                  : 'border-white/75 bg-white/64 text-slate-600 hover:border-sky-200 hover:bg-white/90 hover:text-slate-950'
                              }`}
                            >
                              <span className="min-w-0 truncate">
                                {place.name}{' '}
                                <span className={`atlas-city-name-en ${isPlaceSelected ? 'text-sky-100' : 'font-medium text-slate-400'}`}>
                                  {place.nameEn}
                                </span>
                              </span>
                              <span className={`shrink-0 text-[10px] font-medium ${isPlaceSelected ? 'text-sky-100' : 'text-slate-400'}`}>
                                {placeStatusLabels[place.status]}
                              </span>
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="atlas-image-tuning atlas-panel-body mt-3 shrink-0 border-t">
        <div className={`atlas-scale-heading flex items-center justify-between gap-3 ${isImageTuningOpen ? 'mb-3' : ''}`}>
          <button
            aria-controls="atlas-image-tuning-controls"
            aria-expanded={isImageTuningOpen}
            className="atlas-accordion-trigger flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
            onClick={() => setIsImageTuningOpen((isOpen) => !isOpen)}
            type="button"
          >
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              <SlidersHorizontal className="size-4 text-slate-500" />
              Map Tuning
            </span>
            <ChevronDown className={`atlas-accordion-chevron size-4 shrink-0 ${isImageTuningOpen ? '' : 'rotate-180'}`} />
          </button>
          {isImageTuningOpen ? (
            <button
              aria-label="Reset Earth image tuning"
              className="atlas-scale-reset grid size-9 shrink-0 place-items-center rounded-lg border"
              onClick={onResetImageryTuning}
              title="Reset Earth image tuning"
              type="button"
            >
              <RotateCcw className="size-4" />
            </button>
          ) : (
            <span aria-hidden="true" className="size-9 shrink-0" />
          )}
        </div>

        {isImageTuningOpen ? (
          <div className="atlas-accordion-content" id="atlas-image-tuning-controls">
            <label className="atlas-image-control grid grid-cols-[68px_1fr_34px] items-center gap-2">
              <span>Saturation</span>
              <input
                aria-label="Earth imagery saturation"
                className="atlas-image-slider atlas-slider w-full"
                max="1.5"
                min="0.5"
                step="0.01"
                type="range"
                value={imagerySaturation}
                onChange={(event) => onSaturationChange(Number(event.currentTarget.value))}
              />
              <output>{imagerySaturation.toFixed(2)}</output>
            </label>

            <label className="atlas-image-control grid grid-cols-[68px_1fr_34px] items-center gap-2">
              <span>Contrast</span>
              <input
                aria-label="Earth imagery contrast"
                className="atlas-image-slider atlas-slider w-full"
                max="1.4"
                min="0.7"
                step="0.01"
                type="range"
                value={imageryContrast}
                onChange={(event) => onContrastChange(Number(event.currentTarget.value))}
              />
              <output>{imageryContrast.toFixed(2)}</output>
            </label>

            <label className="atlas-image-control grid grid-cols-[68px_1fr_34px] items-center gap-2">
              <span>Brightness</span>
              <input
                aria-label="Earth imagery brightness"
                className="atlas-image-slider atlas-slider w-full"
                max="1.4"
                min="0.4"
                step="0.01"
                type="range"
                value={imageryBrightness}
                onChange={(event) => onBrightnessChange(Number(event.currentTarget.value))}
              />
              <output>{imageryBrightness.toFixed(2)}</output>
            </label>
          </div>
        ) : null}
      </div>

      <div className="atlas-scale-panel atlas-panel-body mt-3 shrink-0 rounded-[22px] border border-white/70 bg-white/54 p-3.5">
        <div className={`atlas-scale-heading flex items-center justify-between gap-3 ${isGlobeScaleOpen ? 'mb-3' : ''}`}>
          <button
            aria-controls="atlas-globe-scale-controls"
            aria-expanded={isGlobeScaleOpen}
            className="atlas-accordion-trigger flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
            onClick={() => setIsGlobeScaleOpen((isOpen) => !isOpen)}
            type="button"
          >
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              <SlidersHorizontal className="size-4 text-slate-500" />
              Globe Scale
            </span>
            <ChevronDown className={`atlas-accordion-chevron size-4 shrink-0 ${isGlobeScaleOpen ? '' : 'rotate-180'}`} />
          </button>
          {isGlobeScaleOpen ? (
            <button
              type="button"
              aria-label="Reset globe to overview"
              title="Reset globe to overview"
              onClick={onResetView}
              className="atlas-scale-reset grid size-9 shrink-0 place-items-center rounded-lg border"
            >
              <RotateCcw className="size-4" />
            </button>
          ) : (
            <span aria-hidden="true" className="size-9 shrink-0" />
          )}
        </div>
        {isGlobeScaleOpen ? (
          <div className="atlas-accordion-content" id="atlas-globe-scale-controls">
            <input
              aria-label="Globe scale"
              className="atlas-slider w-full"
              defaultValue={globeDistance}
              key={globeDistance}
              max="3.25"
              min="1"
              step="0.05"
              type="range"
              onInput={(event) => {
                const nextDistance = Number(event.currentTarget.value)
                hasDraftDistanceChangeRef.current =
                  Math.abs(nextDistance - committedDistanceRef.current) > 0.001
                debugGlobeScaleChange(nextDistance)
              }}
              onKeyUp={(event) => commitGlobeDistance(Number(event.currentTarget.value))}
              onBlur={(event) => commitGlobeDistance(Number(event.currentTarget.value))}
              onPointerCancel={(event) => commitGlobeDistance(Number(event.currentTarget.value))}
              onPointerUp={(event) => commitGlobeDistance(Number(event.currentTarget.value))}
            />
            <div className="mt-1 flex justify-between text-[11px] font-medium text-slate-400">
              <span>Street</span>
              <span>City</span>
              <span>Country</span>
              <span>World</span>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  )
}

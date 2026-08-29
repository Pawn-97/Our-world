import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, RotateCcw } from 'lucide-react'
import { useWorldContent } from './app/useWorldContent'
import type { WorldContent } from './app/useWorldContent'
import { AtlasHeader } from './components/AtlasHeader'
import { CesiumAtlasGlobe } from './components/CesiumAtlasGlobe'
import type { GlobePlace, GlobeRoute } from './components/CesiumAtlasGlobe'
import { CountrySelector } from './components/CountrySelector'
import { MapSourceSwitcher } from './components/MapSourceSwitcher'
import { InfoCard } from './components/InfoCard'
import { PlacePreviewSheet } from './components/PlacePreviewSheet'
import { PlaceDetailOverlay } from './components/PlaceDetailOverlay'
import { PlacePhotoGalleryModal } from './components/PlacePhotoGalleryModal'
import type { PlacePhotoGalleryRequest } from './components/PlacePhotoGalleryModal'
import { getInitialMapSource, rememberMapSource } from './data/mapSources'
import type { MapSourceId } from './data/mapSources'
import { countryGroupIdForPlace } from './domain/viewModel'
import type { CountryGroupId, PlaceId, SelectionMode } from './domain/types'
import { detectGlobeQualityMode } from './globeQuality'
import type { GlobeQualityMode } from './globeQuality'

type ThemeMode = 'day' | 'night'

const overviewDistance = 3.25
const countryDistance = 1.95
const cityDistance = 1.38
const streetDistance = 1.08
const sidebarMediaQuery = '(min-width: 1100px)'
const panelIdleHideDelayMs = 4_000

type CameraScale = 'street' | 'city' | 'country' | 'world'
type ImageryTuning = {
  brightness: number
  contrast: number
  saturation: number
}

const imageryTuningDefaults: Record<ThemeMode, ImageryTuning> = {
  day: { brightness: 1, contrast: 1, saturation: 1 },
  night: { brightness: 0.68, contrast: 1.08, saturation: 0.86 },
}

const cameraScaleForDistance = (distance: number): CameraScale => {
  if (distance < 1.15) return 'street'
  if (distance < 1.68) return 'city'
  if (distance < 2.55) return 'country'
  return 'world'
}

function WorldApp({ content }: { content: WorldContent }) {
  const [selectedCountryGroupId, setSelectedCountryGroupId] = useState<CountryGroupId | undefined>()
  const [selectedPlaceId, setSelectedPlaceId] = useState<PlaceId | undefined>()
  const [hoveredCountryGroupId, setHoveredCountryGroupId] = useState<CountryGroupId | undefined>()
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('overview')
  const [globeDistance, setGlobeDistance] = useState(overviewDistance)
  const [globeResetVersion, setGlobeResetVersion] = useState(0)
  const [imageryTuningByTheme, setImageryTuningByTheme] = useState(imageryTuningDefaults)
  const [mapSource, setMapSource] = useState<MapSourceId>(getInitialMapSource)
  const [placePhotoGallery, setPlacePhotoGallery] = useState<PlacePhotoGalleryRequest>()
  const [placeDetailOpen, setPlaceDetailOpen] = useState(false)
  const [sidebarsOpen, setSidebarsOpen] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia(sidebarMediaQuery).matches,
  )
  const [isNarrowLayout, setIsNarrowLayout] = useState(() =>
    typeof window === 'undefined' ? false : !window.matchMedia(sidebarMediaQuery).matches,
  )
  const [panelsIdleHidden, setPanelsIdleHidden] = useState(false)
  const [qualityMode] = useState<GlobeQualityMode>(detectGlobeQualityMode)
  const panelHoverRef = useRef(false)
  const panelFocusRef = useRef(false)
  const panelIdleTimerRef = useRef<number | undefined>(undefined)
  const activeTheme: ThemeMode = 'night'
  const imageryTuning = {
    ...imageryTuningDefaults[activeTheme],
    ...imageryTuningByTheme[activeTheme],
  }
  // Idle auto-hide only applies to the wide desktop layout; narrow screens
  // keep their default-hidden overlay panels.
  const panelsVisible = sidebarsOpen && !panelsIdleHidden

  const globePlaces = useMemo<GlobePlace[]>(
    () => content.places.map((place) => ({
      id: place.id,
      name: place.name,
      nameEn: place.nameEn,
      lat: place.latitude,
      lng: place.longitude,
      status: place.status,
      countryGroupId: countryGroupIdForPlace(place),
      visitCount: content.visitCountByPlaceId[place.id] ?? 0,
    })),
    [content],
  )

  const globeRoutes = useMemo<GlobeRoute[]>(
    () => content.routes.flatMap((route) => {
      const from = content.placeById[route.fromPlaceId]
      const to = content.placeById[route.toPlaceId]
      if (!from || !to) return []
      return [{
        ...route,
        fromLat: from.latitude,
        fromLng: from.longitude,
        toLat: to.latitude,
        toLng: to.longitude,
      }]
    }),
    [content],
  )

  const updateImageryTuning = (property: keyof ImageryTuning, value: number) => {
    setImageryTuningByTheme((current) => ({
      ...current,
      [activeTheme]: {
        ...current[activeTheme],
        [property]: value,
      },
    }))
  }

  const resetImageryTuning = () => {
    setImageryTuningByTheme((current) => ({
      ...current,
      [activeTheme]: { ...imageryTuningDefaults[activeTheme] },
    }))
  }

  useEffect(() => {
    document.documentElement.lang = 'zh-CN'
    const mediaQuery = window.matchMedia(sidebarMediaQuery)
    const syncLayout = (event: MediaQueryListEvent) => {
      setSidebarsOpen(event.matches)
      setIsNarrowLayout(!event.matches)
    }

    mediaQuery.addEventListener('change', syncLayout)
    return () => mediaQuery.removeEventListener('change', syncLayout)
  }, [])

  // Desktop idle auto-hide: after ~4s without pointer/keyboard activity or
  // selection changes, both side panels fade out for immersion. Any activity
  // brings them back. Never hides while a panel is hovered or focused.
  const selectionKey = `${selectionMode}:${selectedCountryGroupId ?? ''}:${selectedPlaceId ?? ''}`
  const [lastSelectionKey, setLastSelectionKey] = useState(selectionKey)
  if (selectionKey !== lastSelectionKey) {
    // Render-time state adjustment: a selection change always wakes panels.
    setLastSelectionKey(selectionKey)
    setPanelsIdleHidden(false)
  }

  useEffect(() => {
    if (isNarrowLayout || !sidebarsOpen) return undefined

    const scheduleIdleHide = () => {
      window.clearTimeout(panelIdleTimerRef.current)
      panelIdleTimerRef.current = window.setTimeout(() => {
        if (!panelHoverRef.current && !panelFocusRef.current) setPanelsIdleHidden(true)
      }, panelIdleHideDelayMs)
    }
    const handleActivity = () => {
      setPanelsIdleHidden(false)
      scheduleIdleHide()
    }

    scheduleIdleHide()
    window.addEventListener('pointermove', handleActivity, { passive: true })
    window.addEventListener('pointerdown', handleActivity, { passive: true })
    window.addEventListener('keydown', handleActivity)
    return () => {
      window.clearTimeout(panelIdleTimerRef.current)
      window.removeEventListener('pointermove', handleActivity)
      window.removeEventListener('pointerdown', handleActivity)
      window.removeEventListener('keydown', handleActivity)
    }
  }, [isNarrowLayout, sidebarsOpen, selectedCountryGroupId, selectedPlaceId, selectionMode])

  const resetOverview = () => {
    setSelectedCountryGroupId(undefined)
    setSelectedPlaceId(undefined)
    setPlaceDetailOpen(false)
    setSelectionMode('overview')
    setGlobeDistance(overviewDistance)
    setGlobeResetVersion((version) => version + 1)
  }

  const selectCountryGroup = (countryGroupId: CountryGroupId) => {
    if (selectedCountryGroupId === countryGroupId && selectionMode !== 'overview') {
      resetOverview()
      return
    }

    setSelectedCountryGroupId(countryGroupId)
    setSelectedPlaceId(undefined)
    setPlaceDetailOpen(false)
    setSelectionMode('country')
    setGlobeDistance(countryDistance)
    if (isNarrowLayout) setSidebarsOpen(false)
  }

  const selectPlace = (placeId: PlaceId) => {
    if (selectedPlaceId === placeId) {
      // Second activation on an already-selected place drills into the
      // street/district level; a third activation toggles the selection off.
      if (globeDistance > streetDistance + 0.001) {
        setSelectionMode('place')
        setGlobeDistance(streetDistance)
        if (isNarrowLayout) setSidebarsOpen(false)
        return
      }
      setSelectedPlaceId(undefined)
      setPlaceDetailOpen(false)
      setSelectionMode(selectedCountryGroupId ? 'country' : 'overview')
      setGlobeDistance(selectedCountryGroupId ? countryDistance : overviewDistance)
      return
    }

    const place = content.placeById[placeId]
    if (place) setSelectedCountryGroupId(countryGroupIdForPlace(place))
    setSelectedPlaceId(placeId)
    setPlaceDetailOpen(false)
    setSelectionMode('place')
    setGlobeDistance(cityDistance)
    if (isNarrowLayout) setSidebarsOpen(false)
  }

  const closePlacePreview = () => {
    setSelectedPlaceId(undefined)
    setSelectionMode(selectedCountryGroupId ? 'country' : 'overview')
    setGlobeDistance(selectedCountryGroupId ? countryDistance : overviewDistance)
  }

  const openPlaceDetail = () => {
    if (selectedPlaceId) setPlaceDetailOpen(true)
  }

  const changeGlobeDistance = (distance: number) => {
    if (Math.abs(distance - globeDistance) <= 0.001) return

    const cameraScale = cameraScaleForDistance(distance)

    if (cameraScale === 'city' || cameraScale === 'street') {
      if (selectedPlaceId) {
        setSelectionMode('place')
      } else if (selectedCountryGroupId) {
        const firstGroupPlace = content.countryGroupById[selectedCountryGroupId]?.places[0]

        if (firstGroupPlace) {
          setSelectedPlaceId(firstGroupPlace.id)
          setSelectionMode('place')
        } else {
          setSelectionMode('country')
        }
      } else {
        setSelectionMode('overview')
      }
    } else if (cameraScale === 'country') {
      setSelectionMode(selectedCountryGroupId ? 'country' : 'overview')
    } else {
      setSelectionMode('overview')
    }

    setGlobeDistance(distance)
  }

  const selectedPlace = selectedPlaceId ? content.placeById[selectedPlaceId] : undefined
  const selectedGroup = selectedCountryGroupId
    ? content.countryGroupById[selectedCountryGroupId]
    : undefined

  // Mobile (sidebars collapsed below the 1100px breakpoint) shows a compact
  // bottom-sheet preview instead of the hidden desktop side panels.
  const mobilePreviewPlace = !sidebarsOpen && selectionMode === 'place' ? selectedPlace : undefined
  const detailPlace = placeDetailOpen ? selectedPlace : undefined

  return (
    <main className="theme-night relative h-[100dvh] overflow-hidden bg-[#010409] text-slate-950">
      <div className="app-background fixed inset-0 -z-10" />
      <div className="app-grid fixed inset-0 -z-10" />
      <div className="star-field fixed inset-0 -z-10" />
      <AtlasHeader />
      <section
        className="atlas-experience cesium-lab-page relative h-[100dvh] w-screen overflow-hidden"
        data-page="map"
        data-sidebars-open={panelsVisible}
      >
          <div className="absolute inset-0 z-0">
            <CesiumAtlasGlobe
              places={globePlaces}
              countryGroups={content.countryGroups}
              routes={globeRoutes}
              overviewTarget={content.overviewTarget}
              hoveredCountryGroupId={hoveredCountryGroupId}
              imageryBrightness={imageryTuning.brightness}
              imageryContrast={imageryTuning.contrast}
              imagerySaturation={imageryTuning.saturation}
              mapSource={mapSource}
              selectedCountryGroupId={selectedCountryGroupId}
              selectedPlaceId={selectedPlaceId}
              selectionMode={selectionMode}
              globeScale={globeDistance}
              resetVersion={globeResetVersion}
              isNight={activeTheme === 'night'}
              showMapContent={!placeDetailOpen}
              qualityMode={qualityMode}
              onSelectPlace={selectPlace}
            />
          </div>

          {isNarrowLayout && sidebarsOpen ? (
            <button
              type="button"
              aria-label="关闭面板"
              title="关闭面板"
              className="fixed inset-0 z-10 cursor-default bg-slate-950/45 backdrop-blur-[2px]"
              onClick={() => setSidebarsOpen(false)}
            />
          ) : null}

          <div
            className="pointer-events-none absolute inset-0 z-20"
            onPointerEnter={() => {
              panelHoverRef.current = true
              setPanelsIdleHidden(false)
            }}
            onPointerLeave={() => {
              panelHoverRef.current = false
            }}
            onFocusCapture={() => {
              panelFocusRef.current = true
              setPanelsIdleHidden(false)
            }}
            onBlurCapture={() => {
              panelFocusRef.current = false
            }}
          >
            <div
              className="atlas-overlay-frame absolute bottom-0"
              data-page="map"
              data-sidebars-open={panelsVisible}
            >
              <CountrySelector
                countryGroups={content.countryGroups}
                selectedCountryGroupId={selectedCountryGroupId}
                selectedPlaceId={selectedPlaceId}
                globeDistance={globeDistance}
                countryExpandOnly={isNarrowLayout}
                imageryBrightness={imageryTuning.brightness}
                imageryContrast={imageryTuning.contrast}
                imagerySaturation={imageryTuning.saturation}
                onBrightnessChange={(value) => updateImageryTuning('brightness', value)}
                onContrastChange={(value) => updateImageryTuning('contrast', value)}
                onHoverCountryGroup={setHoveredCountryGroupId}
                onResetImageryTuning={resetImageryTuning}
                onSaturationChange={(value) => updateImageryTuning('saturation', value)}
                onSelectCountryGroup={selectCountryGroup}
                onSelectPlace={selectPlace}
                onDistanceChange={changeGlobeDistance}
                onResetView={resetOverview}
              />

              <div className="atlas-right-stack">
                <InfoCard
                  key={`info-${selectionMode}-${selectedCountryGroupId ?? 'none'}-${selectedPlaceId ?? 'none'}`}
                  mode={selectionMode}
                  worldName={content.world.name}
                  group={selectedGroup}
                  place={selectedPlace}
                  photos={selectedPlace ? content.mediaByPlaceId[selectedPlace.id] ?? [] : []}
                  coverForPlace={(placeId) => content.coverByPlaceId[placeId]}
                  hiddenPhotoIds={selectedPlace ? content.hiddenMediaIdsByPlaceId[selectedPlace.id] ?? [] : []}
                  dateRangeForPlace={(placeId) => content.dateRangeByPlaceId[placeId] ?? ''}
                  onSelectPlace={selectPlace}
                  onOpenPhotos={setPlacePhotoGallery}
                  onOpenPlaceDetail={openPlaceDetail}
                />
              </div>

            </div>
          </div>

          <div className="atlas-map-controls">
            <button
              type="button"
              className="atlas-dock-button pointer-events-auto"
              aria-label="重置到全球视图"
              title="重置到全球视图"
              onClick={resetOverview}
            >
              <RotateCcw />
            </button>
            <button
              type="button"
              className="atlas-dock-button atlas-sidebars-toggle pointer-events-auto"
              aria-pressed={panelsVisible}
              aria-label={panelsVisible ? 'Hide both sidebars' : 'Show both sidebars'}
              title={panelsVisible ? '隐藏侧边栏' : '显示侧边栏'}
              onClick={() => {
                setPanelsIdleHidden(false)
                setSidebarsOpen((open) => !open)
              }}
            >
              <span className="atlas-sidebars-toggle-icons" aria-hidden="true">
                {panelsVisible ? (
                  <>
                    <PanelLeftClose />
                    <PanelRightClose />
                  </>
                ) : (
                  <>
                    <PanelLeftOpen />
                    <PanelRightOpen />
                  </>
                )}
              </span>
            </button>
            <MapSourceSwitcher
              value={mapSource}
              onChange={(source) => {
                setMapSource(source)
                rememberMapSource(source)
              }}
            />
          </div>
      </section>

      {mobilePreviewPlace ? (
        <PlacePreviewSheet
          place={mobilePreviewPlace}
          group={selectedGroup}
          cover={content.coverByPlaceId[mobilePreviewPlace.id]}
          visitCount={content.visitCountByPlaceId[mobilePreviewPlace.id] ?? 0}
          lastVisitDateLabel={content.latestVisitDateByPlaceId[mobilePreviewPlace.id]}
          onClose={closePlacePreview}
          onOpenDetail={openPlaceDetail}
        />
      ) : null}

      {detailPlace ? (
        <PlaceDetailOverlay
          place={detailPlace}
          group={selectedGroup}
          visits={content.visitsByPlaceId[detailPlace.id] ?? []}
          memoriesByVisitId={content.memoriesByVisitId}
          mediaById={content.mediaById}
          photos={content.mediaByPlaceId[detailPlace.id] ?? []}
          cover={content.coverByPlaceId[detailPlace.id]}
          dateRangeLabel={content.dateRangeByPlaceId[detailPlace.id] ?? ''}
          onClose={() => setPlaceDetailOpen(false)}
          onOpenPhotos={setPlacePhotoGallery}
        />
      ) : null}

      {placePhotoGallery ? (
        <PlacePhotoGalleryModal
          {...placePhotoGallery}
          onClose={() => setPlacePhotoGallery(undefined)}
        />
      ) : null}
    </main>
  )
}

function App() {
  const state = useWorldContent()

  if (state.status === 'loading') {
    return (
      <main className="flex h-[100dvh] items-center justify-center bg-[#010409] text-slate-200">
        <p className="flex items-center gap-3 text-sm font-medium text-slate-400">
          <Loader2 className="size-4 animate-spin" />
          正在加载 Our World…
        </p>
      </main>
    )
  }

  if (state.status === 'error') {
    return (
      <main className="flex h-[100dvh] items-center justify-center bg-[#010409] px-6 text-center">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">内容加载失败</h1>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">{state.error}</p>
          <p className="mt-4 text-xs text-slate-500">请先运行 npm run validate 检查 content/ 内容文件。</p>
        </div>
      </main>
    )
  }

  return <WorldApp content={state.content} />
}

export default App

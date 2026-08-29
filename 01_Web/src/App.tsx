import { useEffect, useRef, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, RotateCcw } from 'lucide-react'
import { AtlasHeader } from './components/AtlasHeader'
import { CesiumAtlasGlobe } from './components/CesiumAtlasGlobe'
import { CountrySelector } from './components/CountrySelector'
import { MapSourceSwitcher } from './components/MapSourceSwitcher'
import { InfoCard } from './components/InfoCard'
import { PlacePreviewSheet } from './components/PlacePreviewSheet'
import { PlaceDetailOverlay } from './components/PlaceDetailOverlay'
import { CityPhotoGalleryModal } from './components/CityPhotoGalleryModal'
import type { CityPhotoGalleryRequest } from './components/CityPhotoGalleryModal'
import { getInitialMapSource, rememberMapSource } from './data/mapSources'
import type { MapSourceId } from './data/mapSources'
import { cityById, countryById, getCitiesForCountry } from './data/travelAtlas'
import { detectGlobeQualityMode } from './globeQuality'
import type { GlobeQualityMode } from './globeQuality'
import type { CityId, CountryId, SelectionMode } from './types/travel'

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

function App() {
  const [selectedCountryId, setSelectedCountryId] = useState<CountryId | undefined>()
  const [selectedCityId, setSelectedCityId] = useState<CityId | undefined>()
  const [hoveredCountryId, setHoveredCountryId] = useState<CountryId | undefined>()
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('overview')
  const [globeDistance, setGlobeDistance] = useState(overviewDistance)
  const [globeResetVersion, setGlobeResetVersion] = useState(0)
  const [imageryTuningByTheme, setImageryTuningByTheme] = useState(imageryTuningDefaults)
  const [mapSource, setMapSource] = useState<MapSourceId>(getInitialMapSource)
  const [cityPhotoGallery, setCityPhotoGallery] = useState<CityPhotoGalleryRequest>()
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
  const selectionKey = `${selectionMode}:${selectedCountryId ?? ''}:${selectedCityId ?? ''}`
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
  }, [isNarrowLayout, sidebarsOpen, selectedCountryId, selectedCityId, selectionMode])

  const resetOverview = () => {
    setSelectedCountryId(undefined)
    setSelectedCityId(undefined)
    setPlaceDetailOpen(false)
    setSelectionMode('overview')
    setGlobeDistance(overviewDistance)
    setGlobeResetVersion((version) => version + 1)
  }

  const selectCountry = (countryId: CountryId) => {
    if (selectedCountryId === countryId && selectionMode !== 'overview') {
      resetOverview()
      return
    }

    setSelectedCountryId(countryId)
    setSelectedCityId(undefined)
    setPlaceDetailOpen(false)
    setSelectionMode('country')
    setGlobeDistance(countryDistance)
    if (isNarrowLayout) setSidebarsOpen(false)
  }

  const selectCity = (cityId: CityId) => {
    if (selectedCityId === cityId) {
      // Second activation on an already-selected place drills into the
      // street/district level; a third activation toggles the selection off.
      if (globeDistance > streetDistance + 0.001) {
        setSelectionMode('city')
        setGlobeDistance(streetDistance)
        if (isNarrowLayout) setSidebarsOpen(false)
        return
      }
      setSelectedCityId(undefined)
      setPlaceDetailOpen(false)
      setSelectionMode('country')
      setGlobeDistance(countryDistance)
      return
    }

    const city = cityById[cityId]
    if (city.countryId) setSelectedCountryId(city.countryId)
    setSelectedCityId(cityId)
    setPlaceDetailOpen(false)
    setSelectionMode('city')
    setGlobeDistance(cityDistance)
    if (isNarrowLayout) setSidebarsOpen(false)
  }

  const closePlacePreview = () => {
    setSelectedCityId(undefined)
    setSelectionMode(selectedCountryId ? 'country' : 'overview')
    setGlobeDistance(selectedCountryId ? countryDistance : overviewDistance)
  }

  const openPlaceDetail = () => {
    if (selectedCityId) setPlaceDetailOpen(true)
  }

  const changeGlobeDistance = (distance: number) => {
    if (Math.abs(distance - globeDistance) <= 0.001) return

    const cameraScale = cameraScaleForDistance(distance)

    if (cameraScale === 'city' || cameraScale === 'street') {
      if (selectedCityId) {
        setSelectionMode('city')
      } else if (selectedCountryId) {
        const firstCountryCity = getCitiesForCountry(selectedCountryId)[0]

        if (firstCountryCity) {
          setSelectedCityId(firstCountryCity.id)
          setSelectionMode('city')
        } else {
          setSelectionMode('country')
        }
      } else {
        setSelectionMode('overview')
      }
    } else if (cameraScale === 'country') {
      setSelectionMode(selectedCountryId ? 'country' : 'overview')
    } else {
      setSelectionMode('overview')
    }

    setGlobeDistance(distance)
  }

  // Mobile (sidebars collapsed below the 1100px breakpoint) shows a compact
  // bottom-sheet preview instead of the hidden desktop side panels.
  const mobilePlacePreview = !sidebarsOpen && selectionMode === 'city' && selectedCityId
    ? cityById[selectedCityId]
    : undefined
  const detailCity = placeDetailOpen && selectedCityId ? cityById[selectedCityId] : undefined

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
              hoveredCountryId={hoveredCountryId}
              imageryBrightness={imageryTuning.brightness}
              imageryContrast={imageryTuning.contrast}
              imagerySaturation={imageryTuning.saturation}
              mapSource={mapSource}
              selectedCountryId={selectedCountryId}
              selectedCityId={selectedCityId}
              selectionMode={selectionMode}
              globeScale={globeDistance}
              resetVersion={globeResetVersion}
              isNight={activeTheme === 'night'}
              showMapContent={!placeDetailOpen}
              qualityMode={qualityMode}
              onSelectCity={selectCity}
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
                selectedCountryId={selectedCountryId}
                selectedCityId={selectedCityId}
                globeDistance={globeDistance}
                imageryBrightness={imageryTuning.brightness}
                imageryContrast={imageryTuning.contrast}
                imagerySaturation={imageryTuning.saturation}
                onBrightnessChange={(value) => updateImageryTuning('brightness', value)}
                onContrastChange={(value) => updateImageryTuning('contrast', value)}
                onHoverCountry={setHoveredCountryId}
                onResetImageryTuning={resetImageryTuning}
                onSaturationChange={(value) => updateImageryTuning('saturation', value)}
                onSelectCountry={selectCountry}
                onSelectCity={selectCity}
                onDistanceChange={changeGlobeDistance}
                onResetView={resetOverview}
              />

              <div className="atlas-right-stack">
                <InfoCard
                  key={`info-${selectionMode}-${selectedCountryId ?? 'none'}-${selectedCityId ?? 'none'}`}
                  mode={selectionMode}
                  selectedCountryId={selectedCountryId}
                  selectedCityId={selectedCityId}
                  onSelectCity={selectCity}
                  onOpenCityPhotos={setCityPhotoGallery}
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

      {mobilePlacePreview ? (
        <PlacePreviewSheet
          city={mobilePlacePreview}
          country={mobilePlacePreview.countryId ? countryById[mobilePlacePreview.countryId] : undefined}
          onClose={closePlacePreview}
          onOpenDetail={openPlaceDetail}
        />
      ) : null}

      {detailCity ? (
        <PlaceDetailOverlay
          city={detailCity}
          country={detailCity.countryId ? countryById[detailCity.countryId] : undefined}
          onClose={() => setPlaceDetailOpen(false)}
          onOpenPhotos={setCityPhotoGallery}
        />
      ) : null}

      {cityPhotoGallery ? (
        <CityPhotoGalleryModal
          {...cityPhotoGallery}
          onClose={() => setCityPhotoGallery(undefined)}
        />
      ) : null}
    </main>
  )
}

export default App

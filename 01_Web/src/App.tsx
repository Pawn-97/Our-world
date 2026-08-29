import { useEffect, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { AtlasHeader } from './components/AtlasHeader'
import { CesiumAtlasGlobe } from './components/CesiumAtlasGlobe'
import { CountrySelector } from './components/CountrySelector'
import { MapSourceSwitcher } from './components/MapSourceSwitcher'
import { MouseControlGuide } from './components/MouseControlGuide'
import { InfoCard } from './components/InfoCard'
import { PlacePreviewSheet } from './components/PlacePreviewSheet'
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
const sidebarMediaQuery = '(min-width: 1100px)'

type CameraScale = 'city' | 'country' | 'world'
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
  const [sidebarsOpen, setSidebarsOpen] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia(sidebarMediaQuery).matches,
  )
  const [qualityMode] = useState<GlobeQualityMode>(detectGlobeQualityMode)
  const activeTheme: ThemeMode = 'night'
  const imageryTuning = {
    ...imageryTuningDefaults[activeTheme],
    ...imageryTuningByTheme[activeTheme],
  }

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
    const syncSidebarVisibility = (event: MediaQueryListEvent) => setSidebarsOpen(event.matches)

    mediaQuery.addEventListener('change', syncSidebarVisibility)
    return () => mediaQuery.removeEventListener('change', syncSidebarVisibility)
  }, [])

  const resetOverview = () => {
    setSelectedCountryId(undefined)
    setSelectedCityId(undefined)
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
    setSelectionMode('country')
    setGlobeDistance(countryDistance)
  }

  const selectCity = (cityId: CityId) => {
    if (selectedCityId === cityId) {
      setSelectedCityId(undefined)
      setSelectionMode('country')
      setGlobeDistance(countryDistance)
      return
    }

    const city = cityById[cityId]
    if (city.countryId) setSelectedCountryId(city.countryId)
    setSelectedCityId(cityId)
    setSelectionMode('city')
    setGlobeDistance(cityDistance)
  }

  const closePlacePreview = () => {
    setSelectedCityId(undefined)
    setSelectionMode(selectedCountryId ? 'country' : 'overview')
    setGlobeDistance(selectedCountryId ? countryDistance : overviewDistance)
  }

  const changeGlobeDistance = (distance: number) => {
    if (Math.abs(distance - globeDistance) <= 0.001) return

    const cameraScale = cameraScaleForDistance(distance)

    if (cameraScale === 'city') {
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

  return (
    <main className="theme-night relative h-[100dvh] overflow-hidden bg-[#010409] text-slate-950">
      <div className="app-background fixed inset-0 -z-10" />
      <div className="app-grid fixed inset-0 -z-10" />
      <div className="star-field fixed inset-0 -z-10" />
      <AtlasHeader />
      <section
        className="atlas-experience cesium-lab-page relative h-[100dvh] w-screen overflow-hidden"
        data-page="map"
        data-sidebars-open={sidebarsOpen}
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
              qualityMode={qualityMode}
              onSelectCity={selectCity}
            />
          </div>

          <div className="pointer-events-none absolute inset-0 z-20">
            <div
              className="atlas-overlay-frame absolute bottom-0"
              data-page="map"
              data-sidebars-open={sidebarsOpen}
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
                />

                <MouseControlGuide language="zh" />
              </div>

            </div>
          </div>

          <div className="atlas-map-controls">
            <button
              type="button"
              className="atlas-dock-button atlas-sidebars-toggle pointer-events-auto"
              aria-pressed={sidebarsOpen}
              aria-label={sidebarsOpen ? 'Hide both sidebars' : 'Show both sidebars'}
              title={sidebarsOpen ? '隐藏侧边栏' : '显示侧边栏'}
              onClick={() => setSidebarsOpen((open) => !open)}
            >
              <span className="atlas-sidebars-toggle-icons" aria-hidden="true">
                {sidebarsOpen ? (
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

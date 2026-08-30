import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArcType,
  BoundingSphere,
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  EllipsoidGeodesic,
  HeadingPitchRange,
  LabelStyle,
  Math as CesiumMath,
  PolylineOutlineMaterialProperty,
  SceneTransforms,
  Viewer as CesiumViewer,
} from 'cesium'
import {
  Entity,
  Globe as CesiumGlobe,
  ImageryLayer,
  Scene,
  ScreenSpaceCameraController,
  SkyAtmosphere,
  Viewer,
} from 'resium'
import type { CesiumComponentRef } from 'resium'
import { createMapSourceLayers } from '../data/mapSources'
import type { MapSourceId } from '../data/mapSources'
import type { PlaceRoute } from '../domain/viewModel'
import { placeStatusLabels } from '../domain/types'
import type {
  CountryGroupId,
  OverviewTarget,
  PlaceId,
  PlaceStatus,
  SelectionMode,
} from '../domain/types'
import type { GlobeQualityMode } from '../globeQuality'
import {
  bloomSettingsForQuality,
  markerBreathing,
  markerHaloSizeFor,
} from './globeAtmosphere'
import 'cesium/Build/Cesium/Widgets/widgets.css'

const maxCesiumDevicePixelRatio = 2

// View-model props: the globe renders product-level data only (ARCHITECTURE.md
// §6.6). All content arrives via repositories through App/useWorldContent.
export type GlobePlace = {
  id: PlaceId
  name: string
  nameEn?: string
  lat: number
  lng: number
  status: PlaceStatus
  countryGroupId: CountryGroupId
  visitCount: number
}

export type GlobeCountryGroup = {
  id: CountryGroupId
  name: string
  nameEn?: string
  centerLat: number
  centerLng: number
  accent: string
}

export type GlobeRoute = PlaceRoute & {
  fromLat: number
  fromLng: number
  toLat: number
  toLng: number
}

type CesiumAtlasGlobeProps = {
  places: GlobePlace[]
  countryGroups: GlobeCountryGroup[]
  routes: GlobeRoute[]
  overviewTarget: OverviewTarget
  hoveredCountryGroupId?: CountryGroupId
  imageryBrightness: number
  imageryContrast: number
  imagerySaturation: number
  mapSource: MapSourceId
  selectedCountryGroupId?: CountryGroupId
  selectedPlaceId?: PlaceId
  selectionMode: SelectionMode
  globeScale: number
  resetVersion: number
  isNight: boolean
  showMapContent?: boolean
  qualityMode?: GlobeQualityMode
  onSelectPlace: (placeId: PlaceId) => void
}

const cityMarkerHeight = 600

const cityPosition = (lng: number, lat: number) =>
  Cartesian3.fromDegrees(lng, lat, cityMarkerHeight)

const cityMarkerHaloImageCache = new Map<string, string>()

// Soft accent halo behind every place marker (UX-3/4): a radial glow plus a
// faint ring — the crisp core stays a point primitive on top, so the
// three-state color semantics (visited/planned/wishlist) are untouched.
const cityMarkerHaloImage = (accent: string) => {
  const cachedImage = cityMarkerHaloImageCache.get(accent)
  if (cachedImage) return cachedImage

  const image = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <defs>
        <radialGradient id="marker-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${accent}" stop-opacity="0.5"/>
          <stop offset="34%" stop-color="${accent}" stop-opacity="0.28"/>
          <stop offset="72%" stop-color="${accent}" stop-opacity="0.08"/>
          <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="31" fill="url(#marker-halo)"/>
      <circle cx="32" cy="32" r="15" fill="none" stroke="${accent}" stroke-opacity="0.5" stroke-width="1.6"/>
    </svg>
  `)}`

  cityMarkerHaloImageCache.set(accent, image)
  return image
}

// Selected markers breathe in high quality mode; reduced quality (mobile)
// keeps a static halo so nothing re-evaluates per frame.
const breathingHaloSize = (baseSize: number) =>
  new CallbackProperty(
    () => baseSize * (1 + markerBreathing.amplitude * Math.sin((performance.now() / markerBreathing.periodMs) * 2 * Math.PI)),
    false,
  )

// Status visual language (MVP §3A): visited = solid accent dot, planned =
// hollow accent ring, wishlist = muted desaturated dot. The same language is
// used by list dots and previews.
const markerPointForStatus = (
  status: PlaceStatus,
  accent: string,
  isMuted: boolean,
  isSelected: boolean,
) => {
  const accentColor = Color.fromCssColorString(accent)

  if (status === 'planned') {
    return {
      color: accentColor.withAlpha(isSelected ? 0.4 : isMuted ? 0.06 : 0.16),
      outlineColor: accentColor.withAlpha(isMuted ? 0.3 : 0.95),
      outlineWidth: isSelected ? 3 : 2.5,
    }
  }

  if (status === 'wishlist') {
    return {
      color: Color.fromCssColorString('#94a3b8').withAlpha(isMuted ? 0.2 : 0.55),
      outlineColor: Color.WHITE.withAlpha(isMuted ? 0.25 : 0.5),
      outlineWidth: 1.5,
    }
  }

  return {
    color: accentColor.withAlpha(isMuted ? 0.28 : 1),
    outlineColor: Color.WHITE.withAlpha(isMuted ? 0.36 : 0.94),
    outlineWidth: isSelected ? 3 : 2,
  }
}

type CameraScale = 'world' | 'country' | 'city' | 'street'

const maximumZoomDistance = 22_000_000

// M1.5 retune: city is now a true city-scale view (~60 km) and street is a
// district drill-in (~3 km); country tightened to ~1 300 km; world unchanged.
const cameraScaleStates: Record<
  CameraScale,
  { rangeOrHeight: number; pitch: number; duration: number }
> = {
  world: { rangeOrHeight: maximumZoomDistance, pitch: -90, duration: 1.2 },
  country: { rangeOrHeight: 1_300_000, pitch: -62, duration: 1.3 },
  city: { rangeOrHeight: 60_000, pitch: -50, duration: 1.35 },
  street: { rangeOrHeight: 3_000, pitch: -55, duration: 1.2 },
}

// Label declutter (M7): beyond this camera height place markers collapse to
// bare dots so dense clusters (East China, Malaysia) don't overlap at world
// scale. The show/hide pair adds ~10% hysteresis so inertia zoom doesn't
// flicker labels at the boundary. Selected or group-hovered places always
// keep their label regardless of height.
const labelHideCameraHeight = 6_000_000
const labelShowCameraHeight = 5_400_000

// Screen-space label declutter (UX follow-up): the pure camera-height rule
// above is not enough at country scale, where close city pairs (Suzhou /
// Shanghai, Kyoto / Osaka) still overlap. When labels are on, projected
// label positions closer than these thresholds collide and only the
// highest-priority one (selected > hovered group > selected group > rest)
// keeps its label.
const labelCollisionThresholdX = 110
const labelCollisionThresholdY = 34

const cameraScaleForGlobeScale = (scale: number): CameraScale => {
  if (scale < 1.15) return 'street'
  if (scale < 1.68) return 'city'
  if (scale < 2.55) return 'country'
  return 'world'
}

const createRoutePositions = (
  startLng: number,
  startLat: number,
  endLng: number,
  endLat: number,
  routeType: string,
) => {
  const start = Cartographic.fromDegrees(startLng, startLat)
  const end = Cartographic.fromDegrees(endLng, endLat)
  const geodesic = new EllipsoidGeodesic(start, end)
  const routeHeight =
    routeType === 'flight' ? 24_000 : routeType === 'ferry' ? 8_000 : 6_000
  const segmentCount = Math.min(
    96,
    Math.max(32, Math.ceil(geodesic.surfaceDistance / 150_000)),
  )

  return Array.from({ length: segmentCount + 1 }, (_, index) => {
    if (index === 0) return cityPosition(startLng, startLat)
    if (index === segmentCount) return cityPosition(endLng, endLat)

    const fraction = index / segmentCount
    const point = geodesic.interpolateUsingFraction(fraction)
    const height = cityMarkerHeight + Math.sin(Math.PI * fraction) * (routeHeight - cityMarkerHeight)
    return Cartesian3.fromRadians(point.longitude, point.latitude, height)
  })
}

const isPositionFacingCamera = (
  position: Cartesian3,
  cameraPosition: Cartesian3,
) => {
  const surfaceNormal = Cartesian3.normalize(position, new Cartesian3())
  const cameraVector = Cartesian3.subtract(cameraPosition, position, new Cartesian3())

  return Cartesian3.dot(surfaceNormal, cameraVector) > -80_000
}

const setsMatch = <T,>(left: Set<T> | null, right: Set<T>) =>
  left !== null &&
  left.size === right.size &&
  [...right].every((item) => left.has(item))

const configureViewer = (viewer: CesiumViewer, qualityMode: GlobeQualityMode = 'high') => {
  const devicePixelRatio = Math.max(1, window.devicePixelRatio || 1)
  const baseResolutionScale = Math.min(
    1,
    maxCesiumDevicePixelRatio / devicePixelRatio,
  )
  // Reduced quality (mobile / coarse pointer): render at ~2/3 of the normal cap.
  viewer.resolutionScale = qualityMode === 'reduced'
    ? baseResolutionScale * 0.66
    : baseResolutionScale
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 120
  viewer.scene.screenSpaceCameraController.maximumZoomDistance = maximumZoomDistance
  viewer.scene.globe.depthTestAgainstTerrain = true
  viewer.scene.minimumDisableDepthTestDistance = 0
  viewer.camera.percentageChanged = 0.01

  // UX-3/4 atmosphere: pure-black space with a restrained blue limb glow.
  // The default skyBox starfield is disabled via the Viewer's skyBox={false}
  // prop; the sun/moon billboards have no constructor switch, so hide them
  // here. SkyAtmosphere is an independent scene primitive — the limb glow
  // is unaffected. Bloom runs only in high quality mode (mobile/reduced
  // keeps it off to protect frame rate).
  if (viewer.scene.sun) viewer.scene.sun.show = false
  if (viewer.scene.moon) viewer.scene.moon.show = false
  const bloomSettings = bloomSettingsForQuality(qualityMode)
  const bloom = viewer.scene.postProcessStages.bloom
  bloom.enabled = bloomSettings.enabled
  bloom.uniforms.contrast = bloomSettings.contrast
  bloom.uniforms.brightness = bloomSettings.brightness
  bloom.uniforms.delta = bloomSettings.delta
  bloom.uniforms.sigma = bloomSettings.sigma
  bloom.uniforms.stepSize = bloomSettings.stepSize

  viewer.forceResize()
}

const debugCameraFocus = (
  source: string,
  details: Record<string, unknown>,
) => {
  if (!import.meta.env.DEV) return

  console.debug('[camera-focus]', JSON.stringify({
    source,
    time: Date.now(),
    ...details,
  }))
}

const debugCesiumGlobeScaleProp = (details: Record<string, unknown>) => {
  if (!import.meta.env.DEV) return

  console.debug('[cesium-globe-scale-prop]', JSON.stringify({
    time: Date.now(),
    ...details,
  }))
}

const debugCameraState = (details: Record<string, unknown>) => {
  if (!import.meta.env.DEV) return

  console.debug('[camera-state]', JSON.stringify({
    time: Date.now(),
    ...details,
  }))
}

const debugCameraCommand = (
  commandNumber: number,
  details: Record<string, unknown>,
) => {
  if (!import.meta.env.DEV) return

  console.debug('[camera-command]', JSON.stringify({
    commandNumber,
    time: Date.now(),
    ...details,
  }))
}

type CameraFocus =
  | { type: 'city'; id?: PlaceId; lat: number; lng: number }
  | { type: 'country'; id?: CountryGroupId; lat: number; lng: number }
  | { type: 'overview'; id: 'overview'; lat: number; lng: number }

type CameraCommandSource =
  | 'city'
  | 'country'
  | 'overview'

type CameraCommandRequest = {
  details: Record<string, unknown>
  reason: string
  run: (viewer: CesiumViewer) => void
  source: CameraCommandSource
}

type ExecuteCameraCommand = (request: CameraCommandRequest) => boolean

export function CesiumAtlasGlobe({
  places,
  countryGroups,
  routes,
  overviewTarget,
  hoveredCountryGroupId,
  imageryBrightness,
  imageryContrast,
  imagerySaturation,
  mapSource,
  selectedCountryGroupId,
  selectedPlaceId,
  selectionMode,
  globeScale,
  resetVersion,
  isNight,
  showMapContent = true,
  qualityMode = 'high',
  onSelectPlace,
}: CesiumAtlasGlobeProps) {
  const viewerRef = useRef<CesiumComponentRef<CesiumViewer>>(null)
  const globeShellRef = useRef<HTMLDivElement>(null)
  const lastCameraFocusKeyRef = useRef<string | undefined>(undefined)
  const cameraCommandCountRef = useRef(0)
  const [viewerReadyVersion, setViewerReadyVersion] = useState(0)
  const updateVisibleHemisphereRef = useRef<() => void>(() => undefined)
  const [focusOffset, setFocusOffset] = useState({ x: 0, y: 0 })
  const [visiblePlaceIds, setVisiblePlaceIds] = useState<Set<PlaceId> | null>(null)
  const [visibleRouteIds, setVisibleRouteIds] = useState<Set<string> | null>(null)
  // Far camera heights hide place labels (dots only); updated by the same
  // camera listeners that drive hemisphere culling. The ref mirrors the
  // state so the culling closure (which outlives individual renders) always
  // reads the current value.
  const [labelsHiddenByHeight, setLabelsHiddenByHeight] = useState(true)
  const labelsHiddenByHeightRef = useRef(true)
  // Screen-space collision declutter: ids whose labels are suppressed
  // because a higher-priority label sits within the collision threshold.
  const [labelCollisionHiddenIds, setLabelCollisionHiddenIds] = useState<Set<PlaceId> | null>(null)
  // Selection snapshot for the culling effect below — its dependency list is
  // intentionally limited to geometry inputs, so it reads selection through
  // this ref instead of closing over stale values.
  const labelSelectionRef = useRef({
    selectedPlaceId,
    hoveredCountryGroupId,
    selectedCountryGroupId,
  })
  useEffect(() => {
    labelSelectionRef.current = {
      selectedPlaceId,
      hoveredCountryGroupId,
      selectedCountryGroupId,
    }
  }, [selectedPlaceId, hoveredCountryGroupId, selectedCountryGroupId])
  const countryGroupById = useMemo(
    () => new Map(countryGroups.map((group) => [group.id, group])),
    [countryGroups],
  )
  const selectedCountryGroup = useMemo(
    () => (selectedCountryGroupId ? countryGroupById.get(selectedCountryGroupId) : undefined),
    [countryGroupById, selectedCountryGroupId],
  )
  const selectedPlace = useMemo(
    () => places.find((place) => place.id === selectedPlaceId),
    [places, selectedPlaceId],
  )
  const selectedAccent = selectedCountryGroup?.accent ?? '#38bdf8'
  const mapSourceLayers = useMemo(() => createMapSourceLayers(mapSource), [mapSource])

  const captureViewer = useCallback(
    (component: CesiumComponentRef<CesiumViewer> | null) => {
      if (viewerRef.current === component) return
      viewerRef.current = component
      setViewerReadyVersion((current) => current + 1)
    },
    [],
  )

  // Every viewer access goes through this guard: Cesium getters (viewer.scene,
  // viewer.camera, …) throw once the widget is destroyed, which can happen
  // while async callbacks (flyTo completion, render listeners, effect
  // re-runs during a remount) still hold a stale reference. The try/catch
  // also covers resium's cesiumElement getter itself misbehaving during
  // teardown.
  const liveViewer = useCallback((): CesiumViewer | undefined => {
    try {
      const viewer = viewerRef.current?.cesiumElement
      return viewer && !viewer.isDestroyed() ? viewer : undefined
    } catch {
      return undefined
    }
  }, [])

  // Sparse datasets (e.g. the 3-place spike) keep every marker labeled
  // (subject to the camera-height declutter above) and slightly larger so
  // places read clearly at country scale and below.
  const sparseMarkerSet = places.length <= 12
  // Coarse pointers (reduced quality mode) need bigger tap targets.
  const markerSizeBoost = qualityMode === 'reduced' ? 8 : 0

  // Route geometry is a rendering concern: visit-derived route pairs arrive
  // as props (see domain/viewModel.ts deriveRoutes) and get their arc
  // positions computed here with Cesium geodesics.
  const mappedRoutes = useMemo(
    () =>
      routes.map((route) => ({
        ...route,
        positions: createRoutePositions(
          route.fromLng,
          route.fromLat,
          route.toLng,
          route.toLat,
          route.type,
        ),
      })),
    [routes],
  )
  const activePlaceRouteIds = useMemo(
    () =>
      new Set(
        mappedRoutes
          .filter(
            (route) =>
              selectedPlaceId &&
              route.fromCountryGroupId === selectedCountryGroupId &&
              route.toCountryGroupId === selectedCountryGroupId &&
              (route.fromPlaceId === selectedPlaceId ||
                route.toPlaceId === selectedPlaceId),
          )
          .map((route) => route.id),
      ),
    [mappedRoutes, selectedPlaceId, selectedCountryGroupId],
  )
  const activeRoutePairs = mappedRoutes
    .filter((route) => activePlaceRouteIds.has(route.id))
    .map((route) => `${route.fromPlaceId}->${route.toPlaceId}`)
    .join('|')
  const cameraFocus = useMemo<CameraFocus>(() => {
    if (selectionMode === 'place' && selectedPlace) {
      return { type: 'city', id: selectedPlace.id, lat: selectedPlace.lat, lng: selectedPlace.lng }
    }

    if (selectionMode === 'country' && selectedCountryGroup) {
      return {
        type: 'country',
        id: selectedCountryGroup.id,
        lat: selectedCountryGroup.centerLat,
        lng: selectedCountryGroup.centerLng,
      }
    }

    return { type: 'overview', id: 'overview', lat: overviewTarget.lat, lng: overviewTarget.lng }
  }, [
    selectedPlace,
    selectedCountryGroup,
    selectionMode,
    overviewTarget,
  ])
  const cameraScale = useMemo<CameraScale>(
    () => cameraScaleForGlobeScale(globeScale),
    [globeScale],
  )
  const cameraFocusKey = useMemo(() => {
    if (cameraFocus.type === 'city') {
      return `city:${selectedPlaceId}:${cameraScale}`
    }
    if (cameraFocus.type === 'country') {
      return `country:${selectedCountryGroupId}:${cameraScale}`
    }
    return `overview:${cameraScale}:${resetVersion}`
  }, [cameraFocus, cameraScale, resetVersion, selectedPlaceId, selectedCountryGroupId])
  const cameraRuntimeRef = useRef({
    cameraFocus,
    cameraScale,
    globeScale,
    selectedPlaceId,
    selectedCountryGroupId,
  })

  useEffect(() => {
    cameraRuntimeRef.current = {
      cameraFocus,
      cameraScale,
      globeScale,
      selectedPlaceId,
      selectedCountryGroupId,
    }
  }, [
    cameraFocus,
    cameraScale,
    globeScale,
    selectedPlaceId,
    selectedCountryGroupId,
  ])

  useEffect(() => {
    debugCesiumGlobeScaleProp({
      globeScale,
      selectedCountryGroupId,
      selectedPlaceId,
    })
  }, [
    globeScale,
    selectedPlaceId,
    selectedCountryGroupId,
  ])

  const executeCameraCommand = useCallback<ExecuteCameraCommand>((request) => {
    const viewer = liveViewer()
    if (!viewer) return false

    const cameraCommandNumber = cameraCommandCountRef.current + 1
    cameraCommandCountRef.current = cameraCommandNumber
    debugCameraCommand(cameraCommandNumber, {
      source: request.source,
      reason: request.reason,
      ...request.details,
    })
    viewer.camera.cancelFlight()
    request.run(viewer)
    return true
  }, [liveViewer])

  useEffect(() => {
    const viewer = liveViewer()
    if (!viewer) return

    configureViewer(viewer, qualityMode)

    // DEV-only debug handle: browser QA scripts drive the camera directly
    // (e.g. viewer.camera.setView for label-collision verification). The
    // import.meta.env.DEV guard is statically replaced, so production
    // bundles contain neither the assignment nor the string.
    if (import.meta.env.DEV) {
      ;(window as unknown as { __ourWorldViewer?: CesiumViewer }).__ourWorldViewer = viewer
    }
  }, [qualityMode, viewerReadyVersion, liveViewer])

  useEffect(() => {
    if (cameraScale !== 'world') return undefined

    const viewer = liveViewer()
    if (!viewer) return undefined

    const lockedPosition = new Cartesian3()
    const positionDirection = new Cartesian3()
    const lockedDirection = new Cartesian3()
    const lockedUp = new Cartesian3()
    const upProjection = new Cartesian3()

    const normalizeLockedUp = () => {
      const upDotDirection = Cartesian3.dot(viewer.camera.upWC, lockedDirection)
      Cartesian3.multiplyByScalar(lockedDirection, upDotDirection, upProjection)
      Cartesian3.subtract(viewer.camera.upWC, upProjection, lockedUp)

      if (Cartesian3.magnitudeSquared(lockedUp) < 1e-8) {
        const zDotDirection = Cartesian3.dot(Cartesian3.UNIT_Z, lockedDirection)
        Cartesian3.multiplyByScalar(lockedDirection, zDotDirection, upProjection)
        Cartesian3.subtract(Cartesian3.UNIT_Z, upProjection, lockedUp)
      }

      if (Cartesian3.magnitudeSquared(lockedUp) < 1e-8) {
        Cartesian3.clone(Cartesian3.UNIT_Y, lockedUp)
      }

      Cartesian3.normalize(lockedUp, lockedUp)
    }

    const lockWorldCenter = () => {
      if (viewer.isDestroyed()) return

      Cartesian3.clone(viewer.camera.positionWC, lockedPosition)
      Cartesian3.normalize(viewer.camera.positionWC, positionDirection)
      Cartesian3.negate(positionDirection, lockedDirection)
      const directionDrift = 1 - Cartesian3.dot(
        viewer.camera.directionWC,
        lockedDirection,
      )

      if (directionDrift < 1e-12) return

      normalizeLockedUp()

      viewer.camera.setView({
        destination: lockedPosition,
        orientation: {
          direction: lockedDirection,
          up: lockedUp,
        },
      })
    }

    viewer.scene.preRender.addEventListener(lockWorldCenter)

    return () => {
      if (!viewer.isDestroyed()) {
        viewer.scene.preRender.removeEventListener(lockWorldCenter)
      }
    }
  }, [cameraScale, viewerReadyVersion, liveViewer])

  useEffect(() => {
    const viewer = liveViewer()
    if (!viewer) return

    const updateVisibleHemisphere = () => {
      // The widget may be destroyed while listeners are still attached
      // (remount / quality-mode re-init); Cesium getters throw after
      // destroy, so bail out first.
      if (viewer.isDestroyed()) return
      const cameraPosition = viewer.camera.positionWC
      const cameraHeight = viewer.camera.positionCartographic.height
      const nextLabelsHidden = labelsHiddenByHeightRef.current
        ? cameraHeight > labelShowCameraHeight
        : cameraHeight > labelHideCameraHeight
      labelsHiddenByHeightRef.current = nextLabelsHidden
      setLabelsHiddenByHeight(nextLabelsHidden)
      const nextPlaceIds = new Set(
        places
          .filter((place) =>
            isPositionFacingCamera(
              cityPosition(place.lng, place.lat),
              cameraPosition,
            ),
          )
          .map((place) => place.id),
      )
      const nextRouteIds = new Set(
        mappedRoutes
          .filter((route) =>
            route.positions.some((position) =>
              isPositionFacingCamera(position, cameraPosition),
            ),
          )
          .map((route) => route.id),
      )

      // Screen-space label declutter: among the places whose label would
      // render (same eligibility as the label `show` condition below), keep
      // labels greedy by priority and suppress any that land within the
      // collision threshold of an already-kept label.
      const nextCollisionHiddenIds = new Set<PlaceId>()
      if (!nextLabelsHidden) {
        const selection = labelSelectionRef.current
        const labelPriority = (place: (typeof places)[number]) =>
          place.id === selection.selectedPlaceId
            ? 0
            : selection.hoveredCountryGroupId !== undefined &&
                place.countryGroupId === selection.hoveredCountryGroupId
              ? 1
              : selection.selectedCountryGroupId !== undefined &&
                  place.countryGroupId === selection.selectedCountryGroupId
                ? 2
                : 3
        const labelCandidates = places
          .filter(
            (place) =>
              nextPlaceIds.has(place.id) &&
              (sparseMarkerSet ||
                place.id === selection.selectedPlaceId ||
                (selection.hoveredCountryGroupId !== undefined &&
                  place.countryGroupId === selection.hoveredCountryGroupId) ||
                (selection.selectedCountryGroupId !== undefined &&
                  place.countryGroupId === selection.selectedCountryGroupId)),
          )
          // Stable sort: equal priorities keep the original place order.
          .sort((left, right) => labelPriority(left) - labelPriority(right))
        const keptLabels: Array<{ x: number; y: number }> = []

        for (const place of labelCandidates) {
          const screenPosition = SceneTransforms.worldToWindowCoordinates(
            viewer.scene,
            cityPosition(place.lng, place.lat),
          )
          if (!screenPosition) continue

          const collides = keptLabels.some(
            (kept) =>
              Math.abs(kept.x - screenPosition.x) < labelCollisionThresholdX &&
              Math.abs(kept.y - screenPosition.y) < labelCollisionThresholdY,
          )
          if (collides && labelPriority(place) >= 2) {
            // Selected / hovered-group labels always keep their label; only
            // group and background labels get suppressed.
            nextCollisionHiddenIds.add(place.id)
            continue
          }
          keptLabels.push({ x: screenPosition.x, y: screenPosition.y })
        }
      }

      setVisiblePlaceIds((current) => setsMatch(current, nextPlaceIds) ? current : nextPlaceIds)
      setVisibleRouteIds((current) => setsMatch(current, nextRouteIds) ? current : nextRouteIds)
      setLabelCollisionHiddenIds((current) =>
        setsMatch(current, nextCollisionHiddenIds) ? current : nextCollisionHiddenIds,
      )
    }

    updateVisibleHemisphereRef.current = updateVisibleHemisphere
    updateVisibleHemisphere()
    const updateAfterFirstRender = () => {
      if (viewer.isDestroyed()) return
      updateVisibleHemisphere()
      viewer.scene.postRender.removeEventListener(updateAfterFirstRender)
    }
    // Continuous camera motion (drags, inertia) only fires `changed` when the
    // delta exceeds percentageChanged; add a throttled preRender recompute so
    // back-side labels never linger mid-drag.
    let lastMotionCullAt = 0
    const cullDuringCameraMotion = () => {
      if (viewer.isDestroyed()) return
      const now = performance.now()
      if (now - lastMotionCullAt < 250) return
      lastMotionCullAt = now
      updateVisibleHemisphere()
    }
    viewer.scene.postRender.addEventListener(updateAfterFirstRender)
    viewer.scene.preRender.addEventListener(cullDuringCameraMotion)
    viewer.camera.changed.addEventListener(updateVisibleHemisphere)
    viewer.camera.moveEnd.addEventListener(updateVisibleHemisphere)

    return () => {
      if (!viewer.isDestroyed()) {
        viewer.scene.postRender.removeEventListener(updateAfterFirstRender)
        viewer.scene.preRender.removeEventListener(cullDuringCameraMotion)
        viewer.camera.changed.removeEventListener(updateVisibleHemisphere)
        viewer.camera.moveEnd.removeEventListener(updateVisibleHemisphere)
      }
      updateVisibleHemisphereRef.current = () => undefined
    }
  }, [places, mappedRoutes, sparseMarkerSet, viewerReadyVersion, liveViewer])

  // Selection changes alter label eligibility and priority (selected and
  // hovered-group labels always show), so re-run the declutter pass even
  // without camera motion.
  useEffect(() => {
    updateVisibleHemisphereRef.current()
  }, [selectedPlaceId, hoveredCountryGroupId, selectedCountryGroupId])

  useEffect(() => {
    const viewer = liveViewer()
    if (!viewer) return
    if (lastCameraFocusKeyRef.current === cameraFocusKey) return

    const {
      cameraFocus,
      cameraScale,
      globeScale,
      selectedPlaceId,
      selectedCountryGroupId,
    } = cameraRuntimeRef.current

    debugCameraState({
      userAction: cameraFocus.type,
      focusTargetType: cameraFocus.type,
      focusTargetId: cameraFocus.id,
      cameraScale,
      globeScale,
      selectedPlaceId,
      selectedCountryGroupId,
    })

    const cameraState = cameraScaleStates[cameraScale]
    const targetPosition = Cartesian3.fromDegrees(cameraFocus.lng, cameraFocus.lat, 600)
    debugCameraFocus(cameraFocus.type, {
      selectedPlaceId,
      selectedCountryGroupId,
      lat: cameraFocus.lat,
      lng: cameraFocus.lng,
      globeScale,
    })
    const updateFocusOffset = () => {
      // flyTo completion can fire after the widget was destroyed (remount
      // mid-flight); viewer.scene would throw, so bail out first.
      if (viewer.isDestroyed()) return

      const screenPosition = SceneTransforms.worldToWindowCoordinates(
        viewer.scene,
        targetPosition,
      )

      if (!screenPosition) return

      setFocusOffset({
        x: Math.round(screenPosition.x - viewer.canvas.clientWidth / 2),
        y: Math.round(screenPosition.y - viewer.canvas.clientHeight / 2),
      })
      updateVisibleHemisphereRef.current()
    }

    if (cameraScale === 'world') {
      const destination = Cartesian3.fromDegrees(
        cameraFocus.lng,
        cameraFocus.lat,
        cameraState.rangeOrHeight,
      )
      const direction = Cartesian3.normalize(
        Cartesian3.negate(destination, new Cartesian3()),
        new Cartesian3(),
      )
      const right = Cartesian3.normalize(
        Cartesian3.cross(direction, Cartesian3.UNIT_Z, new Cartesian3()),
        new Cartesian3(),
      )
      const up = Cartesian3.normalize(
        Cartesian3.cross(right, direction, new Cartesian3()),
        new Cartesian3(),
      )

      const commandAllowed = executeCameraCommand({
        source: cameraFocus.type,
        reason: 'cameraIntentKey changed',
        details: {
          scale: cameraScale,
          globeScale,
          focusType: cameraFocus.type,
          selectedPlaceId,
          selectedCountryGroupId,
          target: {
            lat: cameraFocus.lat,
            lng: cameraFocus.lng,
          },
          destination: 'cartesian-height',
          rangeOrHeight: cameraState.rangeOrHeight,
        },
        run: (currentViewer) => {
          currentViewer.camera.flyTo({
            destination,
            duration: cameraState.duration,
            orientation: {
              direction,
              up,
            },
            complete: updateFocusOffset,
          })
        },
      })
      if (commandAllowed) lastCameraFocusKeyRef.current = cameraFocusKey
      return
    }

    const commandAllowed = executeCameraCommand({
      source: cameraFocus.type,
      reason: 'cameraIntentKey changed',
      details: {
        scale: cameraScale,
        globeScale,
        focusType: cameraFocus.type,
        selectedPlaceId,
        selectedCountryGroupId,
        target: {
          lat: cameraFocus.lat,
          lng: cameraFocus.lng,
        },
        destination: 'bounding-sphere',
        rangeOrHeight: cameraState.rangeOrHeight,
      },
      run: (currentViewer) => {
        currentViewer.camera.flyToBoundingSphere(
          new BoundingSphere(
            targetPosition,
            cameraScale === 'country'
              ? 120_000
              : cameraScale === 'city'
                ? 6_000
                : 400,
          ),
          {
            duration: cameraState.duration,
            offset: new HeadingPitchRange(
              0,
              CesiumMath.toRadians(cameraState.pitch),
              cameraState.rangeOrHeight,
            ),
            complete: updateFocusOffset,
          },
        )
      },
    })
    if (commandAllowed) lastCameraFocusKeyRef.current = cameraFocusKey
  }, [
    cameraFocusKey,
    executeCameraCommand,
    liveViewer,
    viewerReadyVersion,
  ])

  return (
    <div
      ref={globeShellRef}
      className="cesium-atlas-shell absolute inset-0 h-full w-full bg-black"
      data-focus-offset-x={focusOffset.x}
      data-focus-offset-y={focusOffset.y}
      data-visible-place-count={visiblePlaceIds?.size ?? places.length}
      data-visible-route-count={visibleRouteIds?.size ?? mappedRoutes.length}
      data-active-route-pairs={activeRoutePairs}
      data-map-source={mapSource}
    >
      <Viewer
        ref={captureViewer}
        full
        animation={false}
        baseLayer={false}
        baseLayerPicker={false}
        fullscreenButton={false}
        geocoder={false}
        homeButton={false}
        infoBox={false}
        navigationHelpButton={false}
        scene3DOnly
        sceneModePicker={false}
        selectionIndicator={false}
        skyBox={false}
        timeline={false}
        useBrowserRecommendedResolution={false}
      >
        <ImageryLayer
          key={`${mapSource}-base`}
          imageryProvider={mapSourceLayers.base}
          brightness={imageryBrightness}
          contrast={imageryContrast}
          saturation={imagerySaturation}
          show={showMapContent}
        />
        {mapSourceLayers.labels ? (
          <ImageryLayer
            key={`${mapSource}-labels`}
            imageryProvider={mapSourceLayers.labels}
            brightness={imageryBrightness}
            contrast={imageryContrast}
            saturation={imagerySaturation}
            show={showMapContent}
          />
        ) : null}
        <Scene backgroundColor={Color.BLACK} />
        <CesiumGlobe
          baseColor={Color.fromCssColorString('#050b16')}
          show={showMapContent}
          vertexShadowDarkness={isNight ? 0.48 : 0.3}
        />
        <SkyAtmosphere show={showMapContent} />
        <ScreenSpaceCameraController
          enableInputs={showMapContent}
          enableLook={cameraScale !== 'world'}
          enableRotate
          enableTilt
          enableTranslate={cameraScale !== 'world'}
          enableZoom
          inertiaZoom={0.72}
        />
        {mappedRoutes.map((route) => {
          const isPlaceRoute = activePlaceRouteIds.has(route.id)
          const isCountryRoute =
            selectedCountryGroupId &&
            (route.fromCountryGroupId === selectedCountryGroupId || route.toCountryGroupId === selectedCountryGroupId)
          const isActive = selectedPlaceId ? isPlaceRoute : Boolean(isCountryRoute)
          const isMuted = selectionMode !== 'overview' && !isActive
          // Route arcs only render for the active selection: overview mode
          // stays clean (field testing read the always-on arcs as stray
          // connector lines between markers), country/place mode shows only
          // the routes attached to the current selection.
          const isVisible =
            (visibleRouteIds?.has(route.id) ?? true) &&
            selectionMode !== 'overview' &&
            isActive
          const routeColor = Color.fromCssColorString(
            isActive ? selectedAccent : '#bae6fd',
          ).withAlpha(
            isActive ? 0.94 : isMuted ? 0.1 : 0.42,
          )
          const routeOutlineColor = Color.fromCssColorString(
            isActive ? '#f8fafc' : '#38bdf8',
          ).withAlpha(
            isActive ? 0.58 : isMuted ? 0.04 : 0.22,
          )

          return (
            <Entity
              key={route.id}
              name={`${route.fromPlaceId} to ${route.toPlaceId}`}
              show={showMapContent && isVisible}
              polyline={{
                arcType: ArcType.NONE,
                clampToGround: false,
                material: new PolylineOutlineMaterialProperty({
                  color: routeColor,
                  outlineColor: routeOutlineColor,
                  outlineWidth: isActive ? 1.2 : 0.8,
                }),
                positions: route.positions,
                width: isActive ? 4 : isMuted ? 1 : 2,
              }}
            />
          )
        })}

        {places.map((place) => {
          const isSelected = place.id === selectedPlaceId
          const isHoveredGroupPlace =
            hoveredCountryGroupId !== undefined && place.countryGroupId === hoveredCountryGroupId
          const isGroupPlace =
            selectedCountryGroupId !== undefined && place.countryGroupId === selectedCountryGroupId
          const accent = countryGroupById.get(place.countryGroupId)?.accent ?? '#38bdf8'
          const isMuted =
            selectionMode !== 'overview' && !isSelected && !isGroupPlace
          const corePixelSize = (isGroupPlace ? 12 : sparseMarkerSet ? 11 : 7) + markerSizeBoost
          const markerPoint = markerPointForStatus(place.status, accent, isMuted, isSelected)
          const haloSize = markerHaloSizeFor(corePixelSize, isSelected) +
            (isHoveredGroupPlace && !isSelected ? 10 : 0)
          const breathing = isSelected && qualityMode === 'high'
          const haloAlpha = isMuted ? 0.1 : isHoveredGroupPlace || isSelected ? 0.9 : 0.55

          return (
            <Entity
              key={place.id}
              name={`${place.nameEn ?? place.name} · ${placeStatusLabels[place.status]} · ${place.visitCount} visits`}
              show={showMapContent && (visiblePlaceIds?.has(place.id) ?? true)}
              position={cityPosition(place.lng, place.lat)}
              onClick={() => onSelectPlace(place.id)}
              billboard={{
                color: Color.WHITE.withAlpha(haloAlpha),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                height: breathing ? breathingHaloSize(haloSize) : haloSize,
                image: cityMarkerHaloImage(accent),
                width: breathing ? breathingHaloSize(haloSize) : haloSize,
              }}
              point={{
                color: markerPoint.color,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                outlineColor: markerPoint.outlineColor,
                outlineWidth: markerPoint.outlineWidth,
                pixelSize: isSelected ? 18 + markerSizeBoost : corePixelSize,
              }}
              label={{
                backgroundColor: Color.fromCssColorString(
                  isSelected ? accent : '#0f172a',
                ).withAlpha(isSelected ? 0.9 : 0.72),
                fillColor: Color.WHITE,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                font: isSelected ? '700 15px Inter, sans-serif' : '600 13px Inter, sans-serif',
                outlineColor: Color.BLACK,
                outlineWidth: 2,
                pixelOffset: new Cartesian2(0, -28),
                show:
                  isSelected ||
                  isHoveredGroupPlace ||
                  (!labelsHiddenByHeight &&
                    !(labelCollisionHiddenIds?.has(place.id) ?? false) &&
                    (sparseMarkerSet || isGroupPlace)),
                showBackground: true,
                style: LabelStyle.FILL_AND_OUTLINE,
                text: place.nameEn ?? place.name,
              }}
              ellipse={isSelected ? {
                height: 300,
                material: Color.fromCssColorString(accent).withAlpha(0.14),
                outline: true,
                outlineColor: Color.fromCssColorString(accent).withAlpha(0.88),
                semiMajorAxis: 42_000,
                semiMinorAxis: 42_000,
              } : undefined}
            />
          )
        })}
      </Viewer>

      <div className="cesium-map-status pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-white/14 bg-slate-950/62 px-4 py-2 text-xs font-semibold text-slate-200 shadow-lg backdrop-blur-2xl">
        {places.length} places · {mappedRoutes.length} route segments
      </div>
    </div>
  )
}

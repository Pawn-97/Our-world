import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArcType,
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Cesium3DTileset,
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
  SkyBox as CesiumSkyBox,
  SkyAtmosphere,
  Sun as CesiumSun,
  Viewer,
} from 'resium'
import type { CesiumComponentRef } from 'resium'
import { cesiumIonConfigured, createMapSourceLayers } from '../data/mapSources'
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
import { CesiumConstellationSky } from './CesiumConstellationSky'
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

const cityHoverMarkerImageCache = new Map<string, string>()

const cityHoverMarkerImage = (accent: string, corePixelSize: number) => {
  const cacheKey = `${accent}:${corePixelSize}`
  const cachedImage = cityHoverMarkerImageCache.get(cacheKey)
  if (cachedImage) return cachedImage

  const markerPixelSize = 38
  const coreRadius = corePixelSize * 32 / markerPixelSize
  const outlineWidth = 2 * 64 / markerPixelSize
  const image = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <defs>
        <radialGradient id="city-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${accent}" stop-opacity="0.62"/>
          <stop offset="24%" stop-color="${accent}" stop-opacity="0.44"/>
          <stop offset="58%" stop-color="${accent}" stop-opacity="0.16"/>
          <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="31" fill="url(#city-glow)"/>
      <circle
        cx="32"
        cy="32"
        r="${coreRadius}"
        fill="${accent}"
        stroke="#ffffff"
        stroke-opacity="0.94"
        stroke-width="${outlineWidth}"
      />
    </svg>
  `)}`

  cityHoverMarkerImageCache.set(cacheKey, image)
  return image
}

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

  // Sparse datasets (e.g. the 3-place spike) keep every marker labeled and
  // slightly larger so places read clearly at world and country scale.
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
    const viewer = viewerRef.current?.cesiumElement
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
  }, [])

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement
    if (!viewer) return

    configureViewer(viewer, qualityMode)
  }, [qualityMode, viewerReadyVersion])

  // Cesium OSM Buildings (ion asset 96188) for city/street drill-in.
  // Loaded once the viewer is ready, in high quality mode, whenever a Cesium
  // ion token is configured — independent of the chosen imagery source, so a
  // persisted local/tianditu imagery choice cannot silently disable it.
  useEffect(() => {
    if (qualityMode !== 'high' || !cesiumIonConfigured) return undefined

    const viewer = viewerRef.current?.cesiumElement
    if (!viewer) return undefined

    let cancelled = false
    let tileset: Cesium3DTileset | undefined

    Cesium3DTileset.fromIonAssetId(96188)
      .then((loadedTileset) => {
        if (cancelled || viewer.isDestroyed()) {
          loadedTileset.destroy()
          return
        }
        tileset = loadedTileset
        viewer.scene.primitives.add(loadedTileset)
      })
      .catch((error: unknown) => {
        console.warn('[osm-buildings] failed to load ion asset 96188', error)
      })

    return () => {
      cancelled = true
      if (tileset && !viewer.isDestroyed()) {
        viewer.scene.primitives.remove(tileset)
        tileset = undefined
      }
    }
  }, [qualityMode, viewerReadyVersion])

  useEffect(() => {
    if (cameraScale !== 'world') return undefined

    const viewer = viewerRef.current?.cesiumElement
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
  }, [cameraScale, viewerReadyVersion])

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement
    if (!viewer) return

    const updateVisibleHemisphere = () => {
      const cameraPosition = viewer.camera.positionWC
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

      setVisiblePlaceIds((current) => setsMatch(current, nextPlaceIds) ? current : nextPlaceIds)
      setVisibleRouteIds((current) => setsMatch(current, nextRouteIds) ? current : nextRouteIds)
    }

    updateVisibleHemisphereRef.current = updateVisibleHemisphere
    updateVisibleHemisphere()
    const updateAfterFirstRender = () => {
      updateVisibleHemisphere()
      viewer.scene.postRender.removeEventListener(updateAfterFirstRender)
    }
    // Continuous camera motion (drags, inertia) only fires `changed` when the
    // delta exceeds percentageChanged; add a throttled preRender recompute so
    // back-side labels never linger mid-drag.
    let lastMotionCullAt = 0
    const cullDuringCameraMotion = () => {
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
      viewer.scene.postRender.removeEventListener(updateAfterFirstRender)
      viewer.scene.preRender.removeEventListener(cullDuringCameraMotion)
      viewer.camera.changed.removeEventListener(updateVisibleHemisphere)
      viewer.camera.moveEnd.removeEventListener(updateVisibleHemisphere)
      updateVisibleHemisphereRef.current = () => undefined
    }
  }, [places, mappedRoutes, viewerReadyVersion])

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement
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
    viewerReadyVersion,
  ])

  return (
    <div
      ref={globeShellRef}
      className={`cesium-atlas-shell absolute inset-0 h-full w-full ${isNight ? 'bg-[#020817]' : 'bg-sky-100'}`}
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
        <Scene backgroundColor={Color.fromCssColorString(isNight ? '#010409' : '#dbeafe')} />
        <CesiumGlobe
          baseColor={Color.fromCssColorString(isNight ? '#07111f' : '#cbd5e1')}
          dynamicAtmosphereLighting={isNight && qualityMode === 'high'}
          enableLighting={isNight && qualityMode === 'high'}
          show={showMapContent}
          vertexShadowDarkness={isNight ? 0.48 : 0.3}
        />
        <CesiumSkyBox show={!isNight} />
        <SkyAtmosphere show={showMapContent} />
        <CesiumSun show={!isNight} />
        <ScreenSpaceCameraController
          enableInputs={showMapContent}
          enableLook={cameraScale !== 'world'}
          enableRotate
          enableTilt
          enableTranslate={cameraScale !== 'world'}
          enableZoom
          inertiaZoom={0.72}
        />
        <CesiumConstellationSky
          occludeMoonWithEarth={showMapContent}
          overviewHeight={cameraScaleStates.world.rangeOrHeight}
          overviewLat={overviewTarget.lat}
          overviewLng={overviewTarget.lng}
          qualityMode={qualityMode}
          show={isNight}
        />

        {mappedRoutes.map((route) => {
          const isPlaceRoute = activePlaceRouteIds.has(route.id)
          const isCountryRoute =
            selectedCountryGroupId &&
            (route.fromCountryGroupId === selectedCountryGroupId || route.toCountryGroupId === selectedCountryGroupId)
          const isActive = selectedPlaceId ? isPlaceRoute : Boolean(isCountryRoute)
          const isMuted = selectionMode !== 'overview' && !isActive
          const isVisible =
            (visibleRouteIds?.has(route.id) ?? true) &&
            (selectionMode !== 'place' || isPlaceRoute)
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
          const showHoverGlow = isHoveredGroupPlace && !isSelected
          const markerPoint = markerPointForStatus(place.status, accent, isMuted, isSelected)

          return (
            <Entity
              key={place.id}
              name={`${place.nameEn ?? place.name} · ${placeStatusLabels[place.status]} · ${place.visitCount} visits`}
              show={showMapContent && (visiblePlaceIds?.has(place.id) ?? true)}
              position={cityPosition(place.lng, place.lat)}
              onClick={() => onSelectPlace(place.id)}
              billboard={showHoverGlow ? {
                color: Color.WHITE,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                height: 38,
                image: cityHoverMarkerImage(accent, corePixelSize),
                width: 38,
              } : undefined}
              point={showHoverGlow ? undefined : {
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
                show: sparseMarkerSet || isSelected || isGroupPlace,
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

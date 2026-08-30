import {
  Credit,
  TileMapServiceImageryProvider,
  UrlTemplateImageryProvider,
  WebMapTileServiceImageryProvider,
  buildModuleUrl,
} from 'cesium'
import type { ImageryProvider } from 'cesium'

export type MapSourceId = 'esri' | 'tianditu' | 'local'

export type MapSourceOption = {
  id: MapSourceId
  label: string
  description: string
  configured: boolean
}

type MapSourceLayers = {
  base: ImageryProvider | Promise<ImageryProvider>
  labels?: ImageryProvider
}

// Esri World Imagery direct REST tiles (UX-2): no token, no Cesium ion, no
// on-screen badge. Attribution rides in the Cesium credit line / lightbox.
// Host note: services.arcgisonline.com is unreachable from some networks
// (measured 2026-08-30: connection stall, HTTP 000); server.arcgisonline.com
// serves the identical official tileset and is reachable.
export const esriImageryUrlTemplate =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const esriImageryCredit = 'Esri, Maxar, Earthstar Geographics'

const tiandituToken = (import.meta.env.VITE_TIANDITU_TOKEN ?? '').trim()

const configuredDefault = (import.meta.env.VITE_MAP_SOURCE ?? 'auto').trim().toLowerCase()
const mapSourceStorageKey = 'our-world:map-source'
const tiandituSubdomains = ['0', '1', '2', '3', '4', '5', '6', '7']
const tiandituTileMatrixLabels = Array.from({ length: 18 }, (_, index) => String(index + 1))

export const mapSourceOptions: MapSourceOption[] = [
  {
    id: 'esri',
    label: 'Esri',
    description: '全球卫星影像（无需 Key）',
    configured: true,
  },
  {
    id: 'tianditu',
    label: '天地图',
    description: '国内影像与中文注记',
    configured: Boolean(tiandituToken),
  },
  {
    id: 'local',
    label: '本地低清',
    description: '无需网络与凭据',
    configured: true,
  },
]

const configuredMapSourceIds = new Set<MapSourceId>(
  mapSourceOptions.filter((option) => option.configured).map((option) => option.id),
)

const isConfiguredMapSource = (value: string | null): value is MapSourceId => (
  value !== null && configuredMapSourceIds.has(value as MapSourceId)
)

const automaticMapSource = (): MapSourceId => {
  // Esri needs no credential, so it is always the preferred online source.
  return 'esri'
}

export const getInitialMapSource = (): MapSourceId => {
  if (typeof window !== 'undefined') {
    try {
      const storedSource = window.localStorage.getItem(mapSourceStorageKey)
      // A legacy persisted id (e.g. the removed 'cesium' ion source) no longer
      // passes this check and falls through to the default.
      if (isConfiguredMapSource(storedSource)) return storedSource
    } catch {
      // Storage can be unavailable in privacy-focused browser modes.
    }
  }

  if (configuredDefault !== 'auto' && isConfiguredMapSource(configuredDefault)) {
    return configuredDefault as MapSourceId
  }

  return automaticMapSource()
}

export const rememberMapSource = (source: MapSourceId) => {
  if (!isConfiguredMapSource(source) || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(mapSourceStorageKey, source)
  } catch {
    // The selected source still works for this session when storage is blocked.
  }
}

const createLocalImagery = () => TileMapServiceImageryProvider.fromUrl(
  buildModuleUrl('Assets/Textures/NaturalEarthII'),
)

const createEsriImagery = () => new UrlTemplateImageryProvider({
  url: esriImageryUrlTemplate,
  credit: new Credit(esriImageryCredit),
  maximumLevel: 19,
})

const createTiandituImagery = (layer: 'img' | 'cia', includeCredit = false) => (
  new WebMapTileServiceImageryProvider({
    url: `https://t{s}.tianditu.gov.cn/${layer}_w/wmts?tk=${encodeURIComponent(tiandituToken)}`,
    layer,
    style: 'default',
    format: 'tiles',
    tileMatrixSetID: 'w',
    tileMatrixLabels: tiandituTileMatrixLabels,
    subdomains: tiandituSubdomains,
    maximumLevel: 17,
    enablePickFeatures: false,
    credit: includeCredit ? new Credit('天地图') : undefined,
  })
)

export const createMapSourceLayers = (source: MapSourceId): MapSourceLayers => {
  if (source === 'tianditu' && tiandituToken) {
    return {
      base: createTiandituImagery('img', true),
      labels: createTiandituImagery('cia'),
    }
  }

  if (source === 'esri') {
    return { base: createEsriImagery() }
  }

  return { base: createLocalImagery() }
}

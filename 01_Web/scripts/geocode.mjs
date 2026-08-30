// Geocoding for the local editor's search-first add-place flow (UX-1).
// Dev-server only: the Vite middleware calls searchGeocode server-side so
// the browser never talks to geocoding providers directly (controlled
// User-Agent, no CORS), and the production build contains none of this.
//
// Provider chain: Photon (photon.komoot.io) first — nominatim.org is
// unreachable on some networks — with Nominatim (OpenStreetMap) as the
// fallback. Both are normalized to the same result shape; the mapping
// functions are pure so vitest can cover field tolerance without network.

const PHOTON_SEARCH_URL = 'https://photon.komoot.io/api/'
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'OurWorld-LocalEditor/1.0 (local authoring tool; loopback dev server)'

const MIN_QUERY_LENGTH = 2
const MAX_QUERY_LENGTH = 120
const RESULT_LIMIT = 6
const DEFAULT_TIMEOUT_MS = 8000

const taggedError = (message, status) => {
  const error = new Error(message)
  error.status = status
  return error
}

const validateQuery = (query) => {
  const q = String(query ?? '').trim()
  if (q.length < MIN_QUERY_LENGTH) throw taggedError('请输入至少 2 个字符再搜索。', 400)
  if (q.length > MAX_QUERY_LENGTH) throw taggedError('搜索关键词过长。', 400)
  return q
}

// Shared fetch with hard timeout and an identifiable User-Agent. Errors are
// tagged for the middleware: 502 upstream/network failure, 504 timeout.
const fetchJsonWithTimeout = async (url, { fetchImpl, timeoutMs }) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) throw taggedError(`地理搜索服务返回 ${response.status}，请稍后重试。`, 502)
    return await response.json()
  } catch (error) {
    if (error?.name === 'AbortError') throw taggedError('地理搜索超时，请检查网络后重试。', 504)
    if (typeof error?.status === 'number') throw error
    throw taggedError('无法连接地理搜索服务，请检查网络后重试。', 502)
  } finally {
    clearTimeout(timer)
  }
}

// Common OSM type → Chinese label for the result list. Unknown types fall
// through to the raw english type so nothing is ever blank.
const TYPE_LABELS = {
  city: '城市',
  town: '城镇',
  village: '村庄',
  hamlet: '村落',
  island: '岛屿',
  islet: '岛屿',
  archipelago: '群岛',
  administrative: '行政区',
  country: '国家',
  state: '州/省',
  region: '地区',
  attraction: '景点',
  peak: '山峰',
  airport: '机场',
  station: '车站',
}

const firstSegment = (displayName) => String(displayName ?? '').split(',')[0]?.trim() ?? ''

const lastSegment = (displayName) => {
  const segments = String(displayName ?? '').split(',').map((segment) => segment.trim()).filter(Boolean)
  return segments.length > 0 ? segments[segments.length - 1] : ''
}

const asciiOnly = (value) => /^[\x20-\x7e]+$/.test(value)

const readLatLon = (latValue, lonValue) => {
  const lat = Number(latValue)
  const lon = Number(lonValue)
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return undefined
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return undefined
  return { lat, lon }
}

const normalizeCountryCode = (value) => {
  const code = String(value ?? '').trim().toLowerCase()
  return /^[a-z]{2}$/.test(code) ? code : undefined
}

/**
 * Trim one raw Nominatim jsonv2 item into the shape the editor UI consumes.
 * Tolerates missing namedetails/address; returns undefined for items without
 * usable coordinates or any kind of name.
 */
export const mapNominatimResult = (item) => {
  const position = readLatLon(item?.lat, item?.lon)
  if (!position) return undefined

  const displayName = String(item?.display_name ?? '').trim()
  const localName = String(item?.namedetails?.name ?? '').trim() || firstSegment(displayName)
  if (!localName) return undefined

  const explicitEn = String(item?.namedetails?.['name:en'] ?? '').trim()
  const fallbackEn = asciiOnly(localName) ? localName : ''
  const segmentEn = asciiOnly(firstSegment(displayName)) ? firstSegment(displayName) : ''

  const country = String(item?.address?.country ?? '').trim() || lastSegment(displayName)

  const rawType = String(item?.type ?? '').trim()
  const category = String(item?.category ?? '').trim()

  return {
    displayName,
    name: localName,
    nameEn: explicitEn || fallbackEn || segmentEn,
    country,
    countryCode: normalizeCountryCode(item?.address?.country_code),
    lat: position.lat,
    lon: position.lon,
    type: category && rawType ? `${category}/${rawType}` : rawType || category,
    typeLabel: TYPE_LABELS[rawType] ?? rawType ?? '地点',
  }
}

/** Map a raw Nominatim jsonv2 array; invalid entries are dropped. */
export const mapNominatimResults = (raw) =>
  (Array.isArray(raw) ? raw : [])
    .map(mapNominatimResult)
    .filter(Boolean)

/**
 * Trim one Photon GeoJSON feature into the same normalized shape. Photon
 * returns local-language names by default (good East Asia coverage) but no
 * english name, so nameEn stays empty — the editor UI tolerates that.
 * NOTE: GeoJSON coordinates are [lon, lat] — the order is flipped relative
 * to Nominatim's lat/lon fields.
 */
export const mapPhotonResult = (feature) => {
  const coordinates = feature?.geometry?.coordinates
  const position = readLatLon(coordinates?.[1], coordinates?.[0])
  if (!position) return undefined

  const properties = feature?.properties ?? {}
  const name = String(properties.name ?? '').trim()
  if (!name) return undefined

  const state = String(properties.state ?? '').trim()
  const country = String(properties.country ?? '').trim()
  const rawType = String(properties.osm_value ?? properties.type ?? '').trim()
  const category = String(properties.osm_key ?? '').trim()

  return {
    displayName: [name, state, country].filter(Boolean).join(', '),
    name,
    nameEn: '',
    country,
    countryCode: normalizeCountryCode(properties.countrycode),
    lat: position.lat,
    lon: position.lon,
    type: category && rawType ? `${category}/${rawType}` : rawType || category,
    typeLabel: TYPE_LABELS[rawType] ?? rawType ?? '地点',
  }
}

/** Map a raw Photon FeatureCollection; invalid entries are dropped. */
export const mapPhotonResults = (raw) =>
  (Array.isArray(raw?.features) ? raw.features : [])
    .map(mapPhotonResult)
    .filter(Boolean)

/** Photon search (primary provider). */
export const searchPhoton = async (query, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
  const q = validateQuery(query)
  const params = new URLSearchParams({ q, limit: String(RESULT_LIMIT) })
  const raw = await fetchJsonWithTimeout(`${PHOTON_SEARCH_URL}?${params.toString()}`, { fetchImpl, timeoutMs })
  return mapPhotonResults(raw)
}

/** Nominatim search (fallback provider). */
export const searchNominatim = async (query, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
  const q = validateQuery(query)
  const params = new URLSearchParams({
    format: 'jsonv2',
    'accept-language': 'zh,en',
    limit: String(RESULT_LIMIT),
    addressdetails: '1',
    namedetails: '1',
    q,
  })
  const raw = await fetchJsonWithTimeout(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, { fetchImpl, timeoutMs })
  return mapNominatimResults(raw)
}

/**
 * Provider chain used by the middleware: Photon first, Nominatim on any
 * Photon failure (timeout/network/5xx — an EMPTY result set is a legitimate
 * answer, not a failure, and never triggers the fallback). When both fail,
 * the Nominatim error's tagged status (502/504) propagates. The envelope
 * carries the winning provider for debugging.
 */
export const searchGeocode = async (query, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
  const q = validateQuery(query)
  try {
    return { provider: 'photon', results: await searchPhoton(q, { fetchImpl, timeoutMs }) }
  } catch {
    return { provider: 'nominatim', results: await searchNominatim(q, { fetchImpl, timeoutMs }) }
  }
}

// Nominatim (OpenStreetMap) geocoding for the local editor's search-first
// add-place flow (UX-1). Dev-server only: the Vite middleware calls
// searchNominatim server-side so the browser never talks to Nominatim
// directly (controlled User-Agent per usage policy, no CORS), and the
// production build contains none of this. mapNominatimResults is a pure
// function so vitest can cover the field-tolerance rules without network.

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

// Common Nominatim type → Chinese label for the result list. Unknown types
// fall through to the raw english type so nothing is ever blank.
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

const readLatLon = (item) => {
  const lat = Number(item?.lat)
  const lon = Number(item?.lon)
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return undefined
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return undefined
  return { lat, lon }
}

/**
 * Trim one raw Nominatim jsonv2 item into the shape the editor UI consumes.
 * Tolerates missing namedetails/address; returns undefined for items without
 * usable coordinates or any kind of name.
 */
export const mapNominatimResult = (item) => {
  const position = readLatLon(item)
  if (!position) return undefined

  const displayName = String(item?.display_name ?? '').trim()
  const localName = String(item?.namedetails?.name ?? '').trim() || firstSegment(displayName)
  if (!localName) return undefined

  const explicitEn = String(item?.namedetails?.['name:en'] ?? '').trim()
  const fallbackEn = asciiOnly(localName) ? localName : ''
  const segmentEn = asciiOnly(firstSegment(displayName)) ? firstSegment(displayName) : ''

  const country = String(item?.address?.country ?? '').trim() || lastSegment(displayName)
  const countryCode = String(item?.address?.country_code ?? '').trim().toLowerCase()

  const rawType = String(item?.type ?? '').trim()
  const category = String(item?.category ?? '').trim()

  return {
    displayName,
    name: localName,
    nameEn: explicitEn || fallbackEn || segmentEn,
    country,
    countryCode: /^[a-z]{2}$/.test(countryCode) ? countryCode : undefined,
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
 * Server-side Nominatim search with a hard timeout. Errors carry a `status`
 * the middleware turns into the HTTP response code (400 bad query, 502
 * upstream failure, 504 timeout).
 */
export const searchNominatim = async (query, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
  const q = String(query ?? '').trim()
  if (q.length < MIN_QUERY_LENGTH) throw taggedError('请输入至少 2 个字符再搜索。', 400)
  if (q.length > MAX_QUERY_LENGTH) throw taggedError('搜索关键词过长。', 400)

  const params = new URLSearchParams({
    format: 'jsonv2',
    'accept-language': 'zh,en',
    limit: String(RESULT_LIMIT),
    addressdetails: '1',
    namedetails: '1',
    q,
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) throw taggedError(`地理搜索服务返回 ${response.status}，请稍后重试。`, 502)
    return mapNominatimResults(await response.json())
  } catch (error) {
    if (error?.name === 'AbortError') throw taggedError('地理搜索超时，请检查网络后重试。', 504)
    if (typeof error?.status === 'number') throw error
    throw taggedError('无法连接地理搜索服务，请检查网络后重试。', 502)
  } finally {
    clearTimeout(timer)
  }
}

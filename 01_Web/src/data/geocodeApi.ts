// Dev-only geocode client for the search-first add-place flow (UX-1). This
// module is loaded through a DYNAMIC import inside an import.meta.env.DEV
// guard in the place editor sheet, so the production bundle never contains
// the endpoint string below (verified by scripts/check-dist.mjs). The dev
// middleware proxies to Nominatim server-side; the browser only talks to the
// loopback dev server.

import type { GeocodedPlace } from './placeSearch'

export const searchGeocodePlaces = async (query: string): Promise<GeocodedPlace[]> => {
  const response = await fetch(`/__travelatlas/geocode/search?q=${encodeURIComponent(query)}`, {
    headers: { accept: 'application/json' },
  })
  const body = await response.json().catch(() => undefined) as
    | { ok?: boolean; results?: GeocodedPlace[]; error?: string }
    | undefined
  if (!response.ok || !body?.ok || !Array.isArray(body.results)) {
    throw new Error(body?.error || '地理搜索失败，请稍后重试。')
  }
  return body.results
}

// Tests for the Nominatim geocoding helpers (UX-1): result mapping must
// tolerate missing namedetails/address, and the search wrapper must surface
// bad queries, upstream failures, and timeouts with tagged statuses.

import { describe, expect, it } from 'vitest'
import { mapNominatimResult, mapNominatimResults, searchNominatim } from './geocode.mjs'

const kyotoResult = {
  place_id: 123,
  display_name: '京都, 京都府, 日本',
  lat: '35.0116',
  lon: '135.7681',
  category: 'place',
  type: 'city',
  namedetails: { name: '京都', 'name:en': 'Kyoto' },
  address: { city: '京都', state: '京都府', country: '日本', country_code: 'JP' },
}

describe('mapNominatimResult', () => {
  it('maps a full result with namedetails and address', () => {
    expect(mapNominatimResult(kyotoResult)).toEqual({
      displayName: '京都, 京都府, 日本',
      name: '京都',
      nameEn: 'Kyoto',
      country: '日本',
      countryCode: 'jp',
      lat: 35.0116,
      lon: 135.7681,
      type: 'place/city',
      typeLabel: '城市',
    })
  })

  it('falls back to the display_name segments when namedetails are missing', () => {
    const mapped = mapNominatimResult({
      display_name: 'Semporna, Sabah, Malaysia',
      lat: '4.4795',
      lon: '118.6116',
      category: 'place',
      type: 'town',
      address: { country: 'Malaysia', country_code: 'my' },
    })
    expect(mapped?.name).toBe('Semporna')
    expect(mapped?.nameEn).toBe('Semporna')
    expect(mapped?.country).toBe('Malaysia')
    expect(mapped?.typeLabel).toBe('城镇')
  })

  it('leaves nameEn empty for CJK-only names without name:en', () => {
    const mapped = mapNominatimResult({
      display_name: '仙本那, 沙巴, 马来西亚',
      lat: '4.4795',
      lon: '118.6116',
      type: 'town',
    })
    expect(mapped?.name).toBe('仙本那')
    expect(mapped?.nameEn).toBe('')
    // Country falls back to the last display_name segment.
    expect(mapped?.country).toBe('马来西亚')
    expect(mapped?.countryCode).toBeUndefined()
  })

  it('drops results with missing or out-of-range coordinates', () => {
    expect(mapNominatimResult({ display_name: 'Nowhere', lat: 'abc', lon: '10' })).toBeUndefined()
    expect(mapNominatimResult({ display_name: 'Nowhere', lat: '95', lon: '10' })).toBeUndefined()
    expect(mapNominatimResult({ display_name: 'Nowhere', lat: '10', lon: '-200' })).toBeUndefined()
    expect(mapNominatimResult({ display_name: 'Nowhere' })).toBeUndefined()
  })

  it('drops results without any usable name', () => {
    expect(mapNominatimResult({ display_name: '', lat: '10', lon: '10' })).toBeUndefined()
    expect(mapNominatimResult({ lat: '10', lon: '10' })).toBeUndefined()
  })

  it('falls back to the raw type label for unknown types', () => {
    const mapped = mapNominatimResult({
      display_name: 'X, Y', lat: '1', lon: '2', category: 'natural', type: 'geyser',
    })
    expect(mapped?.type).toBe('natural/geyser')
    expect(mapped?.typeLabel).toBe('geyser')
  })
})

describe('mapNominatimResults', () => {
  it('filters invalid entries and keeps valid ones', () => {
    const mapped = mapNominatimResults([kyotoResult, { display_name: 'bad' }, null])
    expect(mapped).toHaveLength(1)
    expect(mapped[0].name).toBe('京都')
  })

  it('treats non-array payloads as empty', () => {
    expect(mapNominatimResults(undefined)).toEqual([])
    expect(mapNominatimResults({ error: 'nope' })).toEqual([])
  })
})

describe('searchNominatim', () => {
  const jsonResponse = (body, status = 200) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body })

  it('rejects queries shorter than 2 characters', async () => {
    await expect(searchNominatim('京', { fetchImpl: async () => jsonResponse([]) }))
      .rejects.toMatchObject({ status: 400 })
    await expect(searchNominatim('   ', { fetchImpl: async () => jsonResponse([]) }))
      .rejects.toMatchObject({ status: 400 })
  })

  it('passes the query and an identifiable User-Agent to Nominatim', async () => {
    let seenUrl
    let seenHeaders
    const fetchImpl = async (url, options) => {
      seenUrl = url
      seenHeaders = options.headers
      return jsonResponse([kyotoResult])
    }
    const results = await searchNominatim('Kyoto', { fetchImpl })
    expect(results).toHaveLength(1)
    expect(seenUrl).toContain('nominatim.openstreetmap.org/search')
    expect(seenUrl).toContain('q=Kyoto')
    expect(seenUrl).toContain('namedetails=1')
    expect(seenHeaders['user-agent']).toContain('OurWorld-LocalEditor')
  })

  it('maps upstream HTTP failures to a 502', async () => {
    await expect(searchNominatim('Kyoto', { fetchImpl: async () => jsonResponse({}, 503) }))
      .rejects.toMatchObject({ status: 502 })
  })

  it('maps network failures to a 502', async () => {
    const fetchImpl = async () => { throw new TypeError('fetch failed') }
    await expect(searchNominatim('Kyoto', { fetchImpl })).rejects.toMatchObject({ status: 502 })
  })

  it('maps an abort (timeout) to a 504', async () => {
    const fetchImpl = async (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        })
      })
    await expect(searchNominatim('Kyoto', { fetchImpl, timeoutMs: 5 }))
      .rejects.toMatchObject({ status: 504 })
  })
})

// Unit tests for the pure view-model derivations (ARCHITECTURE.md §7/§8).

import { describe, expect, it } from 'vitest'

import type { Place, Visit } from './types'
import {
  countryGroupIdForPlace,
  deriveCountryGroups,
  deriveRoutes,
  formatVisitDateRange,
  orderVisitsChronologically,
  slugify,
} from './viewModel'

const TIMESTAMPS = { createdAt: '2026-08-29T00:00:00Z', updatedAt: '2026-08-29T00:00:00Z' }

const makePlace = (overrides: Partial<Place>): Place => ({
  id: 'place-x',
  worldId: 'world-our-world',
  name: '地点',
  country: '日本',
  latitude: 35,
  longitude: 139,
  status: 'visited',
  ...TIMESTAMPS,
  ...overrides,
})

const makeVisit = (overrides: Partial<Visit>): Visit => ({
  id: 'visit-x',
  placeId: 'place-x',
  ...TIMESTAMPS,
  ...overrides,
})

const tokyo = makePlace({
  id: 'place-tokyo',
  name: '东京',
  nameEn: 'Tokyo',
  country: '日本',
  countryEn: 'Japan',
  countryCode: 'jp',
  latitude: 35.68,
  longitude: 139.69,
  status: 'visited',
})
const kyoto = makePlace({
  id: 'place-kyoto',
  name: '京都',
  nameEn: 'Kyoto',
  country: '日本',
  countryEn: 'Japan',
  countryCode: 'jp',
  latitude: 35.01,
  longitude: 135.76,
  status: 'visited',
})
const paris = makePlace({
  id: 'place-paris',
  name: '巴黎',
  nameEn: 'Paris',
  country: '法国',
  countryEn: 'France',
  countryCode: 'fr',
  latitude: 48.86,
  longitude: 2.35,
  status: 'planned',
})
const singapore = makePlace({
  id: 'place-singapore',
  name: '新加坡',
  country: '新加坡',
  countryEn: 'Singapore',
  countryCode: 'sg',
  latitude: 1.35,
  longitude: 103.82,
  status: 'wishlist',
})

describe('slugify / countryGroupIdForPlace', () => {
  it('slugifies latin names', () => {
    expect(slugify('South Korea')).toBe('south-korea')
  })

  it('prefers countryEn for the group id', () => {
    expect(countryGroupIdForPlace(tokyo)).toBe('country-japan')
  })

  it('falls back to the Chinese country name', () => {
    expect(countryGroupIdForPlace(makePlace({ country: '日本', countryEn: undefined }))).toBe('country-日本')
  })
})

describe('orderVisitsChronologically', () => {
  it('sorts by start date, puts undated visits last, breaks ties by id', () => {
    const visits = [
      makeVisit({ id: 'visit-b', startDate: '2024-05-01' }),
      makeVisit({ id: 'visit-c' }),
      makeVisit({ id: 'visit-a', startDate: '2024-05-01' }),
      makeVisit({ id: 'visit-d', startDate: '2023-10' }),
    ]
    expect(orderVisitsChronologically(visits).map((visit) => visit.id)).toEqual([
      'visit-d',
      'visit-a',
      'visit-b',
      'visit-c',
    ])
  })

  it('does not mutate the input array', () => {
    const visits = [makeVisit({ id: 'visit-b', startDate: '2024-01-01' }), makeVisit({ id: 'visit-a', startDate: '2023-01-01' })]
    orderVisitsChronologically(visits)
    expect(visits.map((visit) => visit.id)).toEqual(['visit-b', 'visit-a'])
  })
})

describe('formatVisitDateRange', () => {
  it('returns Date unknown for no dated visits', () => {
    expect(formatVisitDateRange([makeVisit({ id: 'visit-a' })])).toBe('Date unknown')
    expect(formatVisitDateRange([])).toBe('Date unknown')
  })

  it('spans from the earliest to the latest boundary date', () => {
    const visits = [
      makeVisit({ id: 'visit-a', startDate: '2024-05-01', endDate: '2024-05-10' }),
      makeVisit({ id: 'visit-b', startDate: '2023-10-02' }),
    ]
    expect(formatVisitDateRange(visits)).toBe('2023-10-02 - 2024-05-10')
  })

  it('collapses to a single date when first equals last', () => {
    expect(formatVisitDateRange([makeVisit({ id: 'visit-a', startDate: '2024-05-01' })])).toBe('2024-05-01')
  })
})

describe('deriveCountryGroups', () => {
  const visits = [
    makeVisit({ id: 'visit-tokyo-2023-10', placeId: 'place-tokyo', startDate: '2023-10-02' }),
    makeVisit({ id: 'visit-kyoto-2024-05', placeId: 'place-kyoto', startDate: '2024-05-01' }),
  ]

  it('groups places by country in first-appearance order', () => {
    const groups = deriveCountryGroups([tokyo, kyoto, paris, singapore], visits)
    expect(groups.map((group) => group.id)).toEqual(['country-japan', 'country-france', 'country-singapore'])
  })

  it('computes the centroid, visit count, and date range per group', () => {
    const [japan] = deriveCountryGroups([tokyo, kyoto], visits)
    expect(japan?.centerLat).toBeCloseTo((35.68 + 35.01) / 2)
    expect(japan?.centerLng).toBeCloseTo((139.69 + 135.76) / 2)
    expect(japan?.visitCount).toBe(2)
    expect(japan?.dateRangeLabel).toBe('2023-10-02 - 2024-05-01')
    expect(japan?.flag).toBe('🇯🇵')
  })

  it('assigns stable accents by group order', () => {
    const first = deriveCountryGroups([tokyo, paris], [])
    const second = deriveCountryGroups([tokyo, paris], [])
    expect(first.map((group) => group.accent)).toEqual(second.map((group) => group.accent))
    expect(first[0]?.accent).not.toBe(first[1]?.accent)
  })

  it('keeps no-visit groups at zero visits with an unknown date range', () => {
    const groups = deriveCountryGroups([paris], [])
    expect(groups[0]?.visitCount).toBe(0)
    expect(groups[0]?.dateRangeLabel).toBe('Date unknown')
  })
})

describe('deriveRoutes', () => {
  const places = [tokyo, kyoto, paris, singapore]

  it('connects consecutive visits with arcs in chronological order', () => {
    const visits = [
      makeVisit({ id: 'visit-tokyo-2023-10', placeId: 'place-tokyo', startDate: '2023-10-02' }),
      makeVisit({ id: 'visit-kyoto-2024-05', placeId: 'place-kyoto', startDate: '2024-05-01' }),
      makeVisit({ id: 'visit-paris-2025-04', placeId: 'place-paris', startDate: '2025-04-01' }),
    ]
    const routes = deriveRoutes(places, visits)
    expect(routes.map((route) => route.id)).toEqual([
      'route-visit-tokyo-2023-10--visit-kyoto-2024-05',
      'route-visit-kyoto-2024-05--visit-paris-2025-04',
    ])
  })

  it('marks same-country arcs as main and cross-country arcs as flight', () => {
    const visits = [
      makeVisit({ id: 'visit-tokyo-2023-10', placeId: 'place-tokyo', startDate: '2023-10-02' }),
      makeVisit({ id: 'visit-kyoto-2024-05', placeId: 'place-kyoto', startDate: '2024-05-01' }),
      makeVisit({ id: 'visit-paris-2025-04', placeId: 'place-paris', startDate: '2025-04-01' }),
    ]
    const routes = deriveRoutes(places, visits)
    expect(routes[0]?.type).toBe('main')
    expect(routes[1]?.type).toBe('flight')
  })

  it('collapses back-to-back visits to the same place', () => {
    const visits = [
      makeVisit({ id: 'visit-tokyo-2023-10', placeId: 'place-tokyo', startDate: '2023-10-02' }),
      makeVisit({ id: 'visit-tokyo-2024-11', placeId: 'place-tokyo', startDate: '2024-11-20' }),
      makeVisit({ id: 'visit-kyoto-2025-03', placeId: 'place-kyoto', startDate: '2025-03-15' }),
    ]
    const routes = deriveRoutes(places, visits)
    expect(routes).toHaveLength(1)
    expect(routes[0]?.id).toBe('route-visit-tokyo-2024-11--visit-kyoto-2025-03')
  })

  it('leaves wishlist and planned places without visits untouched', () => {
    const visits = [
      makeVisit({ id: 'visit-tokyo-2023-10', placeId: 'place-tokyo', startDate: '2023-10-02' }),
    ]
    expect(deriveRoutes(places, visits)).toEqual([])
  })

  it('skips arcs when a visit references a place missing from the list', () => {
    const visits = [
      makeVisit({ id: 'visit-tokyo-2023-10', placeId: 'place-tokyo', startDate: '2023-10-02' }),
      makeVisit({ id: 'visit-ghost-2024-01', placeId: 'place-ghost', startDate: '2024-01-01' }),
    ]
    expect(deriveRoutes(places, visits)).toEqual([])
  })
})

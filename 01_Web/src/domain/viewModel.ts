// Pure derivations over domain content (ARCHITECTURE.md §7/§8).
// No Cesium, no React, no IO — safe to unit test and reuse anywhere.

import type {
  CountryGroupId,
  Place,
  PlaceId,
  Visit,
  VisitId,
  VisitStatus,
} from './types'

export type CountryGroup = {
  /** Deterministic derived id: `country-<slug>`, e.g. `country-japan`. */
  id: CountryGroupId
  name: string
  nameEn?: string
  countryCode?: string
  region?: string
  centerLat: number
  centerLng: number
  accent: string
  flag?: string
  /** Places in content order. */
  places: Place[]
  visitCount: number
  dateRangeLabel: string
}

export type PlaceRoute = {
  id: string
  fromPlaceId: PlaceId
  toPlaceId: PlaceId
  fromCountryGroupId: CountryGroupId
  toCountryGroupId: CountryGroupId
  /** Same country group → 'main'; cross-country → 'flight'. */
  type: 'main' | 'flight'
}

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKC')
    .trim()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-|-$/g, '')

export const countryGroupIdForPlace = (place: Place): CountryGroupId =>
  `country-${slugify(place.countryEn ?? place.country)}`

const groupAccents = [
  '#66c7a8',
  '#f28b82',
  '#7dd3fc',
  '#8ecae6',
  '#c77dff',
  '#ffb703',
  '#b8c0ff',
  '#80ed99',
  '#57cc99',
  '#48cae4',
  '#e9c46a',
  '#d8b26e',
  '#f0d7a3',
  '#f07f5f',
  '#76a9d8',
  '#a7c957',
  '#90dbf4',
  '#ffafcc',
  '#bde0fe',
]

export const flagEmojiForCode = (code?: string) =>
  code?.length === 2
    ? [...code.toUpperCase()].map((character) => String.fromCodePoint(127397 + character.charCodeAt(0))).join('')
    : undefined

/** Visits sorted by start date (visits without a date go last), then id. */
export const orderVisitsChronologically = (visits: Visit[]): Visit[] =>
  [...visits].sort((left, right) =>
    `${left.startDate ?? '9999'}:${left.id}`.localeCompare(`${right.startDate ?? '9999'}:${right.id}`),
  )

/** A visit without an explicit status is a completed (past) visit. */
export const getVisitStatus = (visit: Visit): VisitStatus => visit.status ?? 'completed'

export const isCompletedVisit = (visit: Visit): boolean => getVisitStatus(visit) === 'completed'

export const getVisitsForPlace = (visits: Visit[], placeId: PlaceId): Visit[] =>
  orderVisitsChronologically(visits.filter((visit) => visit.placeId === placeId))

/**
 * Visit selection for the place detail page: 'all' keeps every visit,
 * otherwise only the chosen visit survives. Unknown ids fall back to 'all'
 * so a stale selection never blanks the page.
 */
export const selectVisits = (visits: Visit[], selectedVisitId: VisitId | 'all'): Visit[] => {
  if (selectedVisitId === 'all') return visits
  const selected = visits.filter((visit) => visit.id === selectedVisitId)
  return selected.length > 0 ? selected : visits
}

/** Latest boundary date across completed visits, for "最近到访" labels. */
export const latestVisitDate = (visits: Visit[]): string | undefined => {
  const dates = visits
    .filter(isCompletedVisit)
    .flatMap((visit) => [visit.startDate, visit.endDate])
    .filter((date): date is string => Boolean(date))
    .sort()
  return dates[dates.length - 1]
}

const visitBoundaryDates = (visit: Visit): string[] =>
  [visit.startDate, visit.endDate].filter((date): date is string => Boolean(date))

/** "2023-10-02 - 2025-04-06" style label over a set of visits. */
export const formatVisitDateRange = (visits: Visit[]): string => {
  const dates = orderVisitsChronologically(visits).flatMap(visitBoundaryDates).sort()
  if (dates.length === 0) return 'Date unknown'
  const first = dates[0] ?? 'Date unknown'
  const last = dates[dates.length - 1] ?? first
  return first === last ? first : `${first} - ${last}`
}

/**
 * Country grouping is a derived view over Place.country. Group order follows
 * first appearance in the places array, so accents stay stable as content grows.
 */
export const deriveCountryGroups = (places: Place[], visits: Visit[]): CountryGroup[] => {
  const groups: CountryGroup[] = []
  const groupById = new Map<CountryGroupId, CountryGroup>()

  for (const place of places) {
    const id = countryGroupIdForPlace(place)
    let group = groupById.get(id)
    if (!group) {
      group = {
        id,
        name: place.country,
        nameEn: place.countryEn,
        countryCode: place.countryCode,
        region: place.region,
        centerLat: 0,
        centerLng: 0,
        accent: groupAccents[groups.length % groupAccents.length] ?? '#7dd3fc',
        flag: flagEmojiForCode(place.countryCode),
        places: [],
        visitCount: 0,
        dateRangeLabel: 'Date unknown',
      }
      groupById.set(id, group)
      groups.push(group)
    }
    group.places.push(place)
  }

  for (const group of groups) {
    group.centerLat = group.places.reduce((sum, place) => sum + place.latitude, 0) / group.places.length
    group.centerLng = group.places.reduce((sum, place) => sum + place.longitude, 0) / group.places.length
    // Planned visits are intentions, not history: they never count toward a
    // group's visit total or date range.
    const groupVisits = orderVisitsChronologically(
      visits.filter(
        (visit) => isCompletedVisit(visit) && group.places.some((place) => place.id === visit.placeId),
      ),
    )
    group.visitCount = groupVisits.length
    group.dateRangeLabel = formatVisitDateRange(groupVisits)
  }

  return groups
}

/**
 * Globe routes are derived from chronologically ordered *completed* visits:
 * every pair of consecutive visits connects their places with an arc. Planned
 * visits are intentions and never draw arcs; places without visits never
 * touch an arc; back-to-back visits to the same place collapse.
 */
export const deriveRoutes = (places: Place[], visits: Visit[]): PlaceRoute[] => {
  const groupIdByPlaceId = new Map(places.map((place) => [place.id, countryGroupIdForPlace(place)]))
  const orderedVisits = orderVisitsChronologically(visits.filter(isCompletedVisit))
  const routes: PlaceRoute[] = []

  for (let index = 1; index < orderedVisits.length; index += 1) {
    const previous = orderedVisits[index - 1]
    const current = orderedVisits[index]
    if (!previous || !current || previous.placeId === current.placeId) continue

    const fromGroupId = groupIdByPlaceId.get(previous.placeId)
    const toGroupId = groupIdByPlaceId.get(current.placeId)
    if (!fromGroupId || !toGroupId) continue

    routes.push({
      id: `route-${previous.id}--${current.id}`,
      fromPlaceId: previous.placeId,
      toPlaceId: current.placeId,
      fromCountryGroupId: fromGroupId,
      toCountryGroupId: toGroupId,
      type: fromGroupId === toGroupId ? 'main' : 'flight',
    })
  }

  return routes
}

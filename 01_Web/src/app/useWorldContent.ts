// Loads all content through the repository layer once, then derives the
// view model the UI consumes (country groups, routes, visit/memory grouping,
// media galleries and covers). Components receive plain props from here and
// never import content data or data modules themselves.

import { useEffect, useState } from 'react'
import {
  deriveCountryGroups,
  deriveRoutes,
  formatVisitDateRange,
  orderVisitsChronologically,
} from '../domain/viewModel'
import type { CountryGroup, PlaceRoute } from '../domain/viewModel'
import type {
  CountryGroupId,
  Media,
  MediaId,
  Memory,
  OverviewTarget,
  Place,
  PlaceId,
  Visit,
  VisitId,
  World,
} from '../domain/types'
import {
  mediaRepository,
  memoryRepository,
  placeRepository,
  visitRepository,
  worldRepository,
} from '../repositories'

export type WorldContent = {
  world: World
  places: Place[]
  placeById: Record<PlaceId, Place>
  countryGroups: CountryGroup[]
  countryGroupById: Record<CountryGroupId, CountryGroup>
  routes: PlaceRoute[]
  overviewTarget: OverviewTarget
  visitsByPlaceId: Record<PlaceId, Visit[]>
  visitById: Record<VisitId, Visit>
  memoriesByVisitId: Record<VisitId, Memory[]>
  memoriesByPlaceId: Record<PlaceId, Memory[]>
  mediaByPlaceId: Record<PlaceId, Media[]>
  coverByPlaceId: Record<PlaceId, Media | undefined>
  hiddenMediaIdsByPlaceId: Record<PlaceId, MediaId[]>
  visitCountByPlaceId: Record<PlaceId, number>
  dateRangeByPlaceId: Record<PlaceId, string>
}

export type WorldContentState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; content: WorldContent }

const indexBy = <T,>(items: T[], keyOf: (item: T) => string): Record<string, T> =>
  Object.fromEntries(items.map((item) => [keyOf(item), item]))

const loadWorldContent = async (): Promise<WorldContent> => {
  const [world, places, visits, memories] = await Promise.all([
    worldRepository.get(),
    placeRepository.list(),
    visitRepository.list(),
    memoryRepository.list(),
  ])

  const countryGroups = deriveCountryGroups(places, visits)
  const routes = deriveRoutes(places, visits)

  const visitsByPlaceId: Record<PlaceId, Visit[]> = {}
  for (const visit of orderVisitsChronologically(visits)) {
    visitsByPlaceId[visit.placeId] = [...(visitsByPlaceId[visit.placeId] ?? []), visit]
  }

  const memoriesByVisitId: Record<VisitId, Memory[]> = {}
  for (const memory of memories) {
    memoriesByVisitId[memory.visitId] = [...(memoriesByVisitId[memory.visitId] ?? []), memory]
  }

  const memoriesByPlaceId: Record<PlaceId, Memory[]> = {}
  for (const [placeId, placeVisits] of Object.entries(visitsByPlaceId)) {
    memoriesByPlaceId[placeId] = placeVisits.flatMap((visit) => memoriesByVisitId[visit.id] ?? [])
  }

  const mediaLists = await Promise.all(places.map((place) => mediaRepository.listForPlace(place.id)))
  const covers = await Promise.all(places.map((place) => mediaRepository.getCoverForPlace(place)))
  const hiddenIdLists = await Promise.all(places.map((place) => mediaRepository.listHiddenIdsForPlace(place.id)))
  const mediaByPlaceId: Record<PlaceId, Media[]> = {}
  const coverByPlaceId: Record<PlaceId, Media | undefined> = {}
  const hiddenMediaIdsByPlaceId: Record<PlaceId, MediaId[]> = {}
  places.forEach((place, index) => {
    mediaByPlaceId[place.id] = mediaLists[index] ?? []
    coverByPlaceId[place.id] = covers[index]
    hiddenMediaIdsByPlaceId[place.id] = hiddenIdLists[index] ?? []
  })

  return {
    world,
    places,
    placeById: indexBy(places, (place) => place.id),
    countryGroups,
    countryGroupById: indexBy(countryGroups, (group) => group.id),
    routes,
    overviewTarget: world.overviewTarget ?? { lat: 20, lng: 0 },
    visitsByPlaceId,
    visitById: indexBy(visits, (visit) => visit.id),
    memoriesByVisitId,
    memoriesByPlaceId,
    mediaByPlaceId,
    coverByPlaceId,
    hiddenMediaIdsByPlaceId,
    visitCountByPlaceId: Object.fromEntries(
      Object.entries(visitsByPlaceId).map(([placeId, placeVisits]) => [placeId, placeVisits.length]),
    ),
    dateRangeByPlaceId: Object.fromEntries(
      places.map((place) => [place.id, formatVisitDateRange(visitsByPlaceId[place.id] ?? [])]),
    ),
  }
}

export const useWorldContent = (): WorldContentState => {
  const [state, setState] = useState<WorldContentState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    loadWorldContent()
      .then((content) => {
        if (!cancelled) setState({ status: 'ready', content })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({
          status: 'error',
          error: error instanceof Error ? error.message : '内容加载失败。',
        })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}

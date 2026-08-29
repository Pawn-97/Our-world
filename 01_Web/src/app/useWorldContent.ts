// Loads all content through the repository layer once, then derives the
// view model the UI consumes (country groups, routes, visit/memory grouping,
// media galleries and covers). Components receive plain props from here and
// never import content data or data modules themselves.

import { useCallback, useEffect, useState } from 'react'
import {
  deriveCountryGroups,
  deriveRoutes,
  formatVisitDateRange,
  isCompletedVisit,
  latestVisitDate,
  orderVisitsChronologically,
} from '../domain/viewModel'
import type { CountryGroup, PlaceRoute } from '../domain/viewModel'
import type {
  CountryGroupId,
  Media,
  MediaId,
  Memory,
  MemoryId,
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
import { primeLocalContentCache, refreshLocalContentCache } from '../repositories/localContentCache'
import { primeLocalMediaCache, refreshLocalMediaCache } from '../repositories/localMediaRepository'

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
  memoryById: Record<MemoryId, Memory>
  mediaById: Record<MediaId, Media>
  mediaByPlaceId: Record<PlaceId, Media[]>
  coverByPlaceId: Record<PlaceId, Media | undefined>
  hiddenMediaIdsByPlaceId: Record<PlaceId, MediaId[]>
  visitCountByPlaceId: Record<PlaceId, number>
  dateRangeByPlaceId: Record<PlaceId, string>
  /** Latest completed-visit boundary date per place, for "最近到访" labels. */
  latestVisitDateByPlaceId: Record<PlaceId, string | undefined>
}

export type WorldContentState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; content: WorldContent; refresh: () => Promise<void> }

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
  const allMedia = await mediaRepository.list()
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
    memoryById: indexBy(memories, (memory) => memory.id),
    mediaById: indexBy(allMedia, (media) => media.id),
    mediaByPlaceId,
    coverByPlaceId,
    hiddenMediaIdsByPlaceId,
    visitCountByPlaceId: Object.fromEntries(
      // Planned visits are intentions: they never count toward 到访次数.
      Object.entries(visitsByPlaceId).map(([placeId, placeVisits]) => [
        placeId,
        placeVisits.filter(isCompletedVisit).length,
      ]),
    ),
    dateRangeByPlaceId: Object.fromEntries(
      places.map((place) => [
        place.id,
        formatVisitDateRange((visitsByPlaceId[place.id] ?? []).filter(isCompletedVisit)),
      ]),
    ),
    latestVisitDateByPlaceId: Object.fromEntries(
      places.map((place) => [place.id, latestVisitDate(visitsByPlaceId[place.id] ?? [])]),
    ),
  }
}

export const useWorldContent = (): WorldContentState => {
  const [state, setState] = useState<WorldContentState>({ status: 'loading' })
  const [version, setVersion] = useState(0)

  // Preview semantics (Milestone 5): after a local-editor save, refresh
  // re-reads content AND the media catalog/curation state from disk (dev
  // middleware) and rebuilds the view model in place — no page reload.
  // In production it is a no-op rebuild.
  const refresh = useCallback(async () => {
    await Promise.all([refreshLocalContentCache(), refreshLocalMediaCache()])
    setVersion((current) => current + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      // Both primes are shared module-level promises (idempotent, one request
      // per page load). Every effect run — including React StrictMode's
      // double-mount — awaits the SAME in-flight prime before reading the
      // caches, so the view model can never be built from the stale bundled
      // snapshot while the prime is still in flight.
      await Promise.all([primeLocalContentCache(), primeLocalMediaCache()])
      return loadWorldContent()
    }
    load()
      .then((content) => {
        if (!cancelled) setState({ status: 'ready', content, refresh })
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
  }, [refresh, version])

  return state
}

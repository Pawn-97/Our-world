// Local repository implementations (ARCHITECTURE.md §5).
// Reads the tracked content files in 01_Web/content/ through the shared raw
// cache (localContentCache.ts) — in dev the cache can be refreshed after
// local-editor saves. Runtime parsing is defensive but intentionally lighter
// than scripts/validate-content.mjs, which is the authoritative pre-build
// gate.

import { orderMemoriesChronologically, orderVisitsChronologically } from '../domain/viewModel'
import { getRawContent } from './localContentCache'
import type {
  Memory,
  Place,
  PlaceId,
  Visit,
  VisitId,
  World,
} from '../domain/types'
import type {
  MemoryRepository,
  PlaceRepository,
  VisitRepository,
  WorldRepository,
} from './types'

class ContentParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ContentParseError'
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const requireString = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ContentParseError(`${label}: expected a non-empty string.`)
  }
  return value
}

const requireNumber = (value: unknown, label: string) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ContentParseError(`${label}: expected a finite number.`)
  }
  return value
}

const optionalString = (value: unknown, label: string) => {
  if (value === undefined) return undefined
  return requireString(value, label)
}

export const parseWorld = (value: unknown): World => {
  if (!isRecord(value)) throw new ContentParseError('world.json: expected an object.')
  return {
    id: requireString(value.id, 'world.id'),
    name: requireString(value.name, 'world.name'),
    slug: requireString(value.slug, 'world.slug'),
    overviewTarget: isRecord(value.overviewTarget)
      ? {
          lat: requireNumber(value.overviewTarget.lat, 'world.overviewTarget.lat'),
          lng: requireNumber(value.overviewTarget.lng, 'world.overviewTarget.lng'),
        }
      : undefined,
    createdAt: requireString(value.createdAt, 'world.createdAt'),
    updatedAt: requireString(value.updatedAt, 'world.updatedAt'),
  }
}

export const parsePlace = (value: unknown): Place => {
  if (!isRecord(value)) throw new ContentParseError('places.json: expected place objects.')
  const label = `place "${String(value.id ?? '?')}"`
  const status = requireString(value.status, `${label}.status`)
  if (status !== 'visited' && status !== 'planned' && status !== 'wishlist') {
    throw new ContentParseError(`${label}.status: unknown status "${status}".`)
  }
  return {
    id: requireString(value.id, 'place.id'),
    worldId: requireString(value.worldId, `${label}.worldId`),
    name: requireString(value.name, `${label}.name`),
    nameEn: optionalString(value.nameEn, `${label}.nameEn`),
    country: requireString(value.country, `${label}.country`),
    countryEn: optionalString(value.countryEn, `${label}.countryEn`),
    countryCode: optionalString(value.countryCode, `${label}.countryCode`),
    region: optionalString(value.region, `${label}.region`),
    latitude: requireNumber(value.latitude, `${label}.latitude`),
    longitude: requireNumber(value.longitude, `${label}.longitude`),
    status,
    summary: optionalString(value.summary, `${label}.summary`),
    wishlistReason: optionalString(value.wishlistReason, `${label}.wishlistReason`),
    coverMediaId: optionalString(value.coverMediaId, `${label}.coverMediaId`),
    createdAt: requireString(value.createdAt, `${label}.createdAt`),
    updatedAt: requireString(value.updatedAt, `${label}.updatedAt`),
  }
}

export const parseVisit = (value: unknown): Visit => {
  if (!isRecord(value)) throw new ContentParseError('visits.json: expected visit objects.')
  const label = `visit "${String(value.id ?? '?')}"`
  const status = value.status === undefined ? undefined : requireString(value.status, `${label}.status`)
  if (status !== undefined && status !== 'completed' && status !== 'planned') {
    throw new ContentParseError(`${label}.status: unknown status "${status}".`)
  }
  return {
    id: requireString(value.id, 'visit.id'),
    placeId: requireString(value.placeId, `${label}.placeId`),
    status,
    startDate: optionalString(value.startDate, `${label}.startDate`),
    endDate: optionalString(value.endDate, `${label}.endDate`),
    title: optionalString(value.title, `${label}.title`),
    summary: optionalString(value.summary, `${label}.summary`),
    createdAt: requireString(value.createdAt, `${label}.createdAt`),
    updatedAt: requireString(value.updatedAt, `${label}.updatedAt`),
  }
}

export const parseMemory = (value: unknown): Memory => {
  if (!isRecord(value)) throw new ContentParseError('memories.json: expected memory objects.')
  const label = `memory "${String(value.id ?? '?')}"`
  const type = requireString(value.type, `${label}.type`)
  if (type !== 'note' && type !== 'activity' && type !== 'photo') {
    throw new ContentParseError(`${label}.type: unknown type "${type}".`)
  }
  if (!Array.isArray(value.mediaIds) || !value.mediaIds.every((id) => typeof id === 'string')) {
    throw new ContentParseError(`${label}.mediaIds: expected an array of media ids.`)
  }
  return {
    id: requireString(value.id, 'memory.id'),
    visitId: requireString(value.visitId, `${label}.visitId`),
    type,
    title: optionalString(value.title, `${label}.title`),
    body: optionalString(value.body, `${label}.body`),
    date: optionalString(value.date, `${label}.date`),
    time: optionalString(value.time, `${label}.time`),
    locationName: optionalString(value.locationName, `${label}.locationName`),
    latitude: value.latitude === undefined ? undefined : requireNumber(value.latitude, `${label}.latitude`),
    longitude: value.longitude === undefined ? undefined : requireNumber(value.longitude, `${label}.longitude`),
    mediaIds: value.mediaIds,
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === 'string') : undefined,
    createdAt: requireString(value.createdAt, `${label}.createdAt`),
    updatedAt: requireString(value.updatedAt, `${label}.updatedAt`),
  }
}

const parseList = <T,>(value: unknown, parse: (item: unknown) => T, label: string): T[] => {
  if (!Array.isArray(value)) throw new ContentParseError(`${label}: expected an array.`)
  return value.map(parse)
}

export const createLocalWorldRepository = (): WorldRepository => ({
  get: () => Promise.resolve(parseWorld(getRawContent().world)),
})

export const createLocalPlaceRepository = (): PlaceRepository => {
  const listPlaces = () => parseList(getRawContent().places, parsePlace, 'places.json')
  return {
    list: () => Promise.resolve(listPlaces()),
    getById: (id: PlaceId) => Promise.resolve(listPlaces().find((place) => place.id === id)),
  }
}

export const createLocalVisitRepository = (): VisitRepository => {
  const listVisits = () => orderVisitsChronologically(parseList(getRawContent().visits, parseVisit, 'visits.json'))
  return {
    list: () => Promise.resolve(listVisits()),
    listForPlace: (placeId: PlaceId) =>
      Promise.resolve(listVisits().filter((visit) => visit.placeId === placeId)),
    getById: (id: VisitId) => Promise.resolve(listVisits().find((visit) => visit.id === id)),
  }
}

export const createLocalMemoryRepository = (): MemoryRepository => {
  const listMemories = () => orderMemoriesChronologically(parseList(getRawContent().memories, parseMemory, 'memories.json'))
  return {
    list: () => Promise.resolve(listMemories()),
    listForVisit: (visitId: VisitId) =>
      Promise.resolve(listMemories().filter((memory) => memory.visitId === visitId)),
    getById: (id: string) => Promise.resolve(listMemories().find((memory) => memory.id === id)),
  }
}

/** Convenience bundle so the app wires one factory per content source. */
export const createLocalContentRepositories = () => ({
  world: createLocalWorldRepository(),
  places: createLocalPlaceRepository(),
  visits: createLocalVisitRepository(),
  memories: createLocalMemoryRepository(),
})

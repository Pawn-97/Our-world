// Local media repository (ARCHITECTURE.md §6).
// Merges tracked content/media.json with the gitignored generated import
// catalog (src/data/generated/user-media.local.json, written by
// scripts/import-media.mjs), then applies local media-curation state
// (order / hide / cover). Components never read either file directly.

import mediaJson from '../../content/media.json'
import { mediaEditorState, orderBySavedIds } from '../data/editorState'
import type { Media, Place, PlaceId } from '../domain/types'
import type { MediaRepository } from './types'

export type ImportedMediaKind = 'photo' | 'panorama360' | 'aerialPhoto' | 'video'

export type ImportedMediaVariant = {
  src: string
  width?: number
  height?: number
}

/**
 * Generated catalog item (schemaVersion 3). Pipeline entries carry the owning
 * place slug directly — placeId is the clean mapping between the import
 * pipeline and the domain model.
 */
export type ImportedMediaCatalogItem = {
  id: string
  kind: ImportedMediaKind
  placeId: PlaceId
  placeName: string
  src: string
  width?: number
  height?: number
  variants?: {
    thumb?: ImportedMediaVariant
    preview?: ImportedMediaVariant
    original: ImportedMediaVariant
  }
  originalFileName: string
  titleZh?: string
  titleEn?: string
  date?: string
  description?: string
  position?: {
    lat: number
    lng: number
    altitudeMeters?: number
  }
  isCover: boolean
  status: 'ready' | 'needsMetadata'
}

type LocalMediaCatalog = {
  schemaVersion: number
  generatedAt?: string
  items: ImportedMediaCatalogItem[]
}

const localCatalogModules = import.meta.glob('../data/generated/user-media.local.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>

const isCatalogItem = (value: unknown): value is ImportedMediaCatalogItem => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ImportedMediaCatalogItem>
  return typeof candidate.id === 'string'
    && typeof candidate.placeId === 'string'
    && typeof candidate.src === 'string'
    && typeof candidate.kind === 'string'
}

const isCatalog = (value: unknown): value is LocalMediaCatalog => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<LocalMediaCatalog>
  return candidate.schemaVersion === 3 && Array.isArray(candidate.items)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** content/media.json records are already domain-shaped; parse defensively. */
const parseContentMedia = (value: unknown): Media[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.src !== 'string') return []
    const type = item.type === 'video' ? 'video' : 'image'
    return [{
      id: item.id,
      type,
      placeId: typeof item.placeId === 'string' ? item.placeId : undefined,
      src: item.src,
      thumbnailSrc: typeof item.thumbnailSrc === 'string' ? item.thumbnailSrc : undefined,
      previewSrc: typeof item.previewSrc === 'string' ? item.previewSrc : undefined,
      width: typeof item.width === 'number' ? item.width : undefined,
      height: typeof item.height === 'number' ? item.height : undefined,
      capturedAt: typeof item.capturedAt === 'string' ? item.capturedAt : undefined,
      latitude: typeof item.latitude === 'number' ? item.latitude : undefined,
      longitude: typeof item.longitude === 'number' ? item.longitude : undefined,
      alt: typeof item.alt === 'string' ? item.alt : undefined,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
    }]
  })
}

/** Map a generated catalog entry onto the domain Media shape. */
export const mapCatalogItemToMedia = (item: ImportedMediaCatalogItem): Media => ({
  id: item.id,
  type: item.kind === 'video' ? 'video' : 'image',
  placeId: item.placeId,
  src: item.variants?.original.src ?? item.src,
  thumbnailSrc: item.variants?.thumb?.src,
  previewSrc: item.variants?.preview?.src,
  width: item.variants?.original.width ?? item.width,
  height: item.variants?.original.height ?? item.height,
  capturedAt: item.date,
  latitude: item.position?.lat,
  longitude: item.position?.lng,
  alt: item.titleZh ?? item.titleEn ?? item.originalFileName,
  createdAt: item.date ?? '',
})

const allCatalogItems = Object.values(localCatalogModules)
  .filter(isCatalog)
  .flatMap((catalog) => catalog.items)
  .filter(isCatalogItem)

/**
 * Gallery items: ready photos from the import pipeline. Drone panoramas and
 * aerial media stay in the catalog but out of place galleries until a
 * dedicated presentation exists (Milestone 4).
 */
const galleryCatalogItems = allCatalogItems.filter(
  (item) => item.kind === 'photo' && item.status === 'ready',
)

const pipelineCoverByPlace = galleryCatalogItems.reduce<Record<PlaceId, string | undefined>>(
  (covers, item) => {
    if (item.isCover && !covers[item.placeId]) covers[item.placeId] = item.id
    return covers
  },
  {},
)

export const createLocalMediaRepository = (): MediaRepository => {
  const allMedia = [...parseContentMedia(mediaJson), ...galleryCatalogItems.map(mapCatalogItemToMedia)]
  const visibleMedia = allMedia.filter((item) => !mediaEditorState.hiddenMediaIds.includes(item.id))
  const mediaById = new Map(visibleMedia.map((item) => [item.id, item]))

  return {
    list: () => Promise.resolve(visibleMedia),
    listForPlace: (placeId: PlaceId) =>
      Promise.resolve(orderBySavedIds(
        visibleMedia.filter((item) => item.placeId === placeId),
        mediaEditorState.mediaOrderByPlace[placeId],
      )),
    listHiddenIdsForPlace: (placeId: PlaceId) =>
      Promise.resolve(
        allMedia
          .filter((item) => item.placeId === placeId && mediaEditorState.hiddenMediaIds.includes(item.id))
          .map((item) => item.id),
      ),
    getCoverForPlace: (place: Place) => {
      const candidates = [
        mediaEditorState.coverMediaByPlace[place.id],
        place.coverMediaId,
        pipelineCoverByPlace[place.id],
      ]
      for (const candidateId of candidates) {
        const media = candidateId ? mediaById.get(candidateId) : undefined
        if (media) return Promise.resolve(media)
      }
      // No curated cover: fall back to the first gallery item for the place.
      return Promise.resolve(visibleMedia.find((item) => item.placeId === place.id))
    },
  }
}

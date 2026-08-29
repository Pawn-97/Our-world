// Local media repository (ARCHITECTURE.md §6).
// Merges tracked content/media.json (via the shared raw cache, refreshable in
// dev) with the gitignored generated import catalog
// (src/data/generated/user-media.local.json, written by
// scripts/import-media.mjs), then applies local media-curation state
// (order / hide / cover). Components never read either file directly.
//
// Both the catalog and the curation state are mutable caches: in dev they are
// primed from disk through the middleware on page load and refreshed in place
// after local-editor saves (no reload); production always uses the bundled
// snapshot. The middleware read is loaded lazily inside a DEV guard so the
// production bundle contains no editor endpoints.

import { getMediaEditorState, orderBySavedIds, setMediaEditorState } from '../data/editorState'
import type { Media, Place, PlaceId } from '../domain/types'
import { getRawContent } from './localContentCache'
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

const deriveCatalogViews = (catalogItems: ImportedMediaCatalogItem[]) => {
  /**
   * Gallery items: ready photos from the import pipeline. Drone panoramas and
   * aerial media stay in the catalog but out of place galleries until a
   * dedicated presentation exists (Milestone 4).
   */
  const galleryItems = catalogItems.filter(
    (item) => item.kind === 'photo' && item.status === 'ready',
  )
  const coverByPlace = galleryItems.reduce<Record<PlaceId, string | undefined>>(
    (covers, item) => {
      if (item.isCover && !covers[item.placeId]) covers[item.placeId] = item.id
      return covers
    },
    {},
  )
  return { galleryItems, coverByPlace }
}

let catalogViews = deriveCatalogViews(
  Object.values(localCatalogModules)
    .filter(isCatalog)
    .flatMap((catalog) => catalog.items)
    .filter(isCatalogItem),
)

/** Dev-only read-back of the import catalog + curation state; throws on failure. */
export const refreshLocalMediaCache = async (): Promise<void> => {
  if (!import.meta.env.DEV) return
  const { readLocalEditorState, readLocalMediaCatalog } = await import('../data/localEditorApi')
  const [catalog, state] = await Promise.all([readLocalMediaCatalog(), readLocalEditorState()])
  const items = isCatalog(catalog) ? catalog.items.filter(isCatalogItem) : []
  catalogViews = deriveCatalogViews(items)
  setMediaEditorState(state)
}

/**
 * Dev-only initial prime: prefer the on-disk catalog/state over the bundled
 * snapshot so imports made outside the running dev server are visible without
 * a restart. Silently keeps the bundled snapshot when the read fails.
 */
export const primeLocalMediaCache = async (): Promise<void> => {
  if (!import.meta.env.DEV) return
  try {
    await refreshLocalMediaCache()
  } catch {
    // Bundled catalog/state is the documented dev fallback.
  }
}

export const createLocalMediaRepository = (): MediaRepository => {
  // Recomputed per call: the raw cache and catalog/state caches can refresh
  // after dev saves.
  const currentMedia = () => {
    const editorState = getMediaEditorState()
    const allMedia = [...parseContentMedia(getRawContent().media), ...catalogViews.galleryItems.map(mapCatalogItemToMedia)]
    const visibleMedia = allMedia.filter((item) => !editorState.hiddenMediaIds.includes(item.id))
    return { allMedia, visibleMedia, mediaById: new Map(visibleMedia.map((item) => [item.id, item])) }
  }

  return {
    list: () => Promise.resolve(currentMedia().visibleMedia),
    listForPlace: (placeId: PlaceId) =>
      Promise.resolve(orderBySavedIds(
        currentMedia().visibleMedia.filter((item) => item.placeId === placeId),
        getMediaEditorState().mediaOrderByPlace[placeId],
      )),
    listHiddenIdsForPlace: (placeId: PlaceId) =>
      Promise.resolve(
        currentMedia().allMedia
          .filter((item) => item.placeId === placeId && getMediaEditorState().hiddenMediaIds.includes(item.id))
          .map((item) => item.id),
      ),
    getCoverForPlace: (place: Place) => {
      const { visibleMedia, mediaById } = currentMedia()
      const candidates = [
        getMediaEditorState().coverMediaByPlace[place.id],
        place.coverMediaId,
        catalogViews.coverByPlace[place.id],
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

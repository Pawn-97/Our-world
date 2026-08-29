// Repository interfaces (ARCHITECTURE.md §5/§6).
// UI components never import content JSON or data modules directly; all reads
// flow through these abstractions. V1 implementations are local JSON; V2 can
// swap in cloud implementations without touching the UI.
//
// V1 is read-only at runtime (production is a static site). Write methods
// arrive with the Milestone 5 local editor; local media curation already
// persists through the dev-only editor API (src/data/localEditorApi.ts).

import type {
  Media,
  MediaId,
  Memory,
  MemoryId,
  Place,
  PlaceId,
  Visit,
  VisitId,
  World,
} from '../domain/types'

export interface WorldRepository {
  get(): Promise<World>
}

export interface PlaceRepository {
  list(): Promise<Place[]>
  getById(id: PlaceId): Promise<Place | undefined>
}

export interface VisitRepository {
  /** All visits, chronologically ordered (undated visits last). */
  list(): Promise<Visit[]>
  /** Visits for one place, chronologically ordered. */
  listForPlace(placeId: PlaceId): Promise<Visit[]>
  getById(id: VisitId): Promise<Visit | undefined>
}

export interface MemoryRepository {
  list(): Promise<Memory[]>
  /** Memories for one visit, ordered by date (undated last). */
  listForVisit(visitId: VisitId): Promise<Memory[]>
  getById(id: MemoryId): Promise<Memory | undefined>
}

export interface MediaRepository {
  /**
   * All media visible to the published site: tracked content/media.json
   * merged with the locally generated import catalog, with local editor
   * hide/order choices applied.
   */
  list(): Promise<Media[]>
  /** Gallery media for one place, in curated order. */
  listForPlace(placeId: PlaceId): Promise<Media[]>
  /** Locally hidden media ids for one place (dev editor "restore" flow). */
  listHiddenIdsForPlace(placeId: PlaceId): Promise<MediaId[]>
  /** Curated cover: local editor choice → place.coverMediaId → pipeline cover → first. */
  getCoverForPlace(place: Place): Promise<Media | undefined>
}

// Our World domain model (ARCHITECTURE.md §7).
// Content files in 01_Web/content/ are validated against these shapes by
// scripts/validate-content.mjs before every build.

export type PlaceStatus = 'wishlist' | 'planned' | 'visited'

export type MemoryType = 'note' | 'activity' | 'photo'

export type MediaType = 'image' | 'video'

/**
 * Visit lifecycle. Absent `status` means 'completed' (a past visit).
 * 'planned' marks a future/intended visit: it never draws globe routes and
 * does not count toward visit counts or date ranges.
 */
export type VisitStatus = 'completed' | 'planned'

// Stable IDs are readable slugs (see content/README.md). They are never
// array indexes, display names, or file names.
export type WorldId = string
export type PlaceId = string
export type VisitId = string
export type MemoryId = string
export type MediaId = string

// Country groups are a derived view over Place.country, not content entities;
// their IDs are deterministic slugs computed by the view-model layer.
export type CountryGroupId = string

export type OverviewTarget = {
  lat: number
  lng: number
}

export type World = {
  id: WorldId
  name: string
  slug: string
  overviewTarget?: OverviewTarget
  createdAt: string
  updatedAt: string
}

export type Place = {
  id: PlaceId
  worldId: WorldId
  /** Primary display name (Chinese in Our World content). */
  name: string
  /** Latin/English display name. */
  nameEn?: string
  /** Country display name (Chinese); drives the derived country grouping. */
  country: string
  countryEn?: string
  /** ISO 3166-1 alpha-2, lowercase (e.g. "jp"). */
  countryCode?: string
  /** Free-form region label (e.g. "East Asia"). */
  region?: string
  latitude: number
  longitude: number
  status: PlaceStatus
  summary?: string
  /** Why this wishlist place matters; shown on the detail page. */
  wishlistReason?: string
  coverMediaId?: MediaId
  createdAt: string
  updatedAt: string
}

export type Visit = {
  id: VisitId
  placeId: PlaceId
  /** Lifecycle; omitted means 'completed'. */
  status?: VisitStatus
  /** YYYY-MM-DD or YYYY-MM. */
  startDate?: string
  /** YYYY-MM-DD or YYYY-MM; never earlier than startDate. */
  endDate?: string
  title?: string
  summary?: string
  createdAt: string
  updatedAt: string
}

export type Memory = {
  id: MemoryId
  visitId: VisitId
  type: MemoryType
  title?: string
  body?: string
  /** YYYY-MM-DD or YYYY-MM. */
  date?: string
  /** HH:MM (24h) — time-of-day tag, mainly for activities. */
  time?: string
  /** Short human place label (e.g. "目黑川"), mainly for activities. */
  locationName?: string
  latitude?: number
  longitude?: number
  mediaIds: MediaId[]
  tags?: string[]
  createdAt: string
  updatedAt: string
}

export type Media = {
  id: MediaId
  type: MediaType
  /** Owning place for imported/catalog media; content media may omit it. */
  placeId?: PlaceId
  /** Published full-size or best-available URL. */
  src: string
  thumbnailSrc?: string
  /** Optimized large-view derivative URL. */
  previewSrc?: string
  width?: number
  height?: number
  capturedAt?: string
  latitude?: number
  longitude?: number
  alt?: string
  createdAt: string
}

// Selection depth shared by App, globe and panels. 'country' means a derived
// country group is focused; 'place' means a single place is focused.
export type SelectionMode = 'overview' | 'country' | 'place'

export const placeStatusLabels: Record<PlaceStatus, string> = {
  visited: '已到访',
  planned: '计划中',
  wishlist: '想去',
}

export const visitStatusLabels: Record<VisitStatus, string> = {
  completed: '已完成',
  planned: '计划中',
}

export const memoryTypeLabels: Record<MemoryType, string> = {
  note: '笔记',
  activity: '活动',
  photo: '照片',
}

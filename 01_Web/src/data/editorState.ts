import type { MediaId, PlaceId } from '../domain/types'

// Local editor state (dev-only, gitignored at src/data/generated/editor-state.local.json).
// Milestone 2 trimmed this to media curation only — the old country/city
// record-editing state went away with the travel-map data model.
export type MediaEditorState = {
  schemaVersion: 1
  /** Curated gallery order per place. */
  mediaOrderByPlace: Record<PlaceId, MediaId[]>
  /** Locally hidden media (never deletes source files). */
  hiddenMediaIds: MediaId[]
  /** Locally chosen cover per place. */
  coverMediaByPlace: Record<PlaceId, MediaId>
  updatedAt?: string
}

const emptyEditorState: MediaEditorState = {
  schemaVersion: 1,
  mediaOrderByPlace: {},
  hiddenMediaIds: [],
  coverMediaByPlace: {},
}

const localEditorStateModules = import.meta.glob('./generated/editor-state.local.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

const isStringArrayRecord = (value: unknown): value is Record<string, string[]> =>
  Boolean(value)
  && typeof value === 'object'
  && Object.values(value as Record<string, unknown>).every(isStringArray)

const isStringRecord = (value: unknown): value is Record<string, string> =>
  Boolean(value)
  && typeof value === 'object'
  && Object.values(value as Record<string, unknown>).every((item) => typeof item === 'string')

const parseEditorState = (value: unknown): MediaEditorState | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<MediaEditorState>
  if (candidate.schemaVersion !== 1) return undefined

  return {
    schemaVersion: 1,
    mediaOrderByPlace: isStringArrayRecord(candidate.mediaOrderByPlace) ? candidate.mediaOrderByPlace : {},
    hiddenMediaIds: isStringArray(candidate.hiddenMediaIds) ? candidate.hiddenMediaIds : [],
    coverMediaByPlace: isStringRecord(candidate.coverMediaByPlace) ? candidate.coverMediaByPlace : {},
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : undefined,
  }
}

export const mediaEditorState = Object.values(localEditorStateModules)
  .map(parseEditorState)
  .find(Boolean) ?? emptyEditorState

export const orderBySavedIds = <T extends { id: string }>(items: T[], savedOrder?: string[]) => {
  if (!savedOrder?.length) return items
  const rank = new Map(savedOrder.map((id, index) => [id, index]))

  return [...items].sort((left, right) => {
    const leftRank = rank.get(left.id)
    const rightRank = rank.get(right.id)
    if (leftRank === undefined && rightRank === undefined) return 0
    if (leftRank === undefined) return 1
    if (rightRank === undefined) return -1
    return leftRank - rightRank
  })
}

export const localEditorAvailable = import.meta.env.DEV

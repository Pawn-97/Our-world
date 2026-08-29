// Shared raw-content cache for the local repositories (Milestone 5).
// Production: the five tracked content files are statically bundled below and
// this cache never changes. Dev: after a local-editor save, repositories call
// refreshLocalContentCache(), which re-reads the files from disk through the
// dev middleware (loopback only) so the UI reflects writes without a manual
// page reload. The middleware read-back is loaded lazily inside a DEV guard,
// so the production bundle contains no editor endpoints.

import worldJson from '../../content/world.json'
import placesJson from '../../content/places.json'
import visitsJson from '../../content/visits.json'
import memoriesJson from '../../content/memories.json'
import mediaJson from '../../content/media.json'

export type RawContentSnapshot = {
  world: unknown
  places: unknown
  visits: unknown
  memories: unknown
  media: unknown
}

let cache: RawContentSnapshot = {
  world: worldJson,
  places: placesJson,
  visits: visitsJson,
  memories: memoriesJson,
  media: mediaJson,
}

export const getRawContent = (): RawContentSnapshot => cache

export const refreshLocalContentCache = async (): Promise<void> => {
  if (!import.meta.env.DEV) return
  const { fetchLocalContent } = await import('../data/localContentEditorApi')
  cache = await fetchLocalContent()
}

// Shared raw-content cache for the local repositories (Milestone 5).
// Production: the five tracked content files are statically bundled below and
// this cache never changes. Dev: the initial load primes the cache from disk
// through the dev middleware (loopback only) so new tabs/sessions see edits
// made outside the running dev server; primeLocalContentCache() falls back to
// the bundled content when the middleware is unreachable. After a
// local-editor save, refreshLocalContentCache() re-reads the files the same
// way so the UI reflects writes without a manual page reload. The middleware
// read-back is loaded lazily inside a DEV guard, so the production bundle
// contains no editor endpoints.

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

/** Dev-only read-back from disk via the middleware; throws on failure. */
export const refreshLocalContentCache = async (): Promise<void> => {
  if (!import.meta.env.DEV) return
  const { fetchLocalContent } = await import('../data/localContentEditorApi')
  cache = await fetchLocalContent()
}

/**
 * Dev-only initial prime: prefer on-disk content over the bundled snapshot so
 * external edits (e.g. hand-edited content/*.json) are visible without a dev
 * server restart. Silently keeps the bundled content when the read fails.
 */
export const primeLocalContentCache = async (): Promise<void> => {
  if (!import.meta.env.DEV) return
  try {
    await refreshLocalContentCache()
  } catch {
    // Bundled content is the documented dev fallback.
  }
}

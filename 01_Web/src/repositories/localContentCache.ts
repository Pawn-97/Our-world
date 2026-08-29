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
 *
 * The prime is idempotent and SHARED: every caller awaits the same module-level
 * promise and the middleware is hit at most once per page load. This matters
 * under React StrictMode, where the loading effect mounts twice — the second
 * run must wait for the in-flight prime rather than skip it and read the
 * stale bundled snapshot.
 */
let primePromise: Promise<void> | undefined

export const primeLocalContentCache = (): Promise<void> => {
  if (!import.meta.env.DEV) return Promise.resolve()
  primePromise ??= refreshLocalContentCache().catch(() => {
    // Bundled content is the documented dev fallback.
  })
  return primePromise
}

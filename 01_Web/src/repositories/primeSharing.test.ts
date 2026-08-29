// Regression tests for the StrictMode double-effect prime race (tech-debt
// follow-up): React StrictMode mounts the loading effect twice, and the second
// run previously skipped an in-flight prime and built the view model from the
// stale bundled snapshot. The primes are now shared module-level promises —
// both effect runs await the same promise, and the middleware is hit once.
//
// Module state is memoized, so each test re-imports the module under test
// after vi.resetModules() for isolation.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('primeLocalContentCache (shared across effect runs)', () => {
  it('two concurrent primes share one in-flight request and both see fresh content', async () => {
    const fresh = {
      world: { id: 'world-primed' },
      places: [{ id: 'place-primed' }],
      visits: [],
      memories: [],
      media: [],
    }
    const pending = deferred<Response>()
    const fetchMock = vi.fn(() => pending.promise)
    vi.stubGlobal('fetch', fetchMock)

    const { primeLocalContentCache, getRawContent } = await import('./localContentCache')

    // StrictMode timing: effect run 1 starts the prime; effect run 2 begins
    // while run 1's fetch is still in flight. (The fetch fires after the
    // lazily imported API module resolves, so wait for it.)
    const firstRun = primeLocalContentCache()
    const secondRun = primeLocalContentCache()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    // Before the prime resolves, the cache still holds the bundled snapshot.
    expect((getRawContent().world as { id: string }).id).toBe('world-our-world')

    pending.resolve(jsonResponse({ ok: true, content: fresh }))
    await Promise.all([firstRun, secondRun])

    // Both runs continued only after the prime landed: fresh content visible.
    expect((getRawContent().world as { id: string }).id).toBe('world-primed')
    expect(getRawContent().places).toEqual([{ id: 'place-primed' }])

    // Later loads reuse the settled prime — still no extra requests.
    await primeLocalContentCache()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('a failed prime resolves (bundled fallback) and is shared without retry storms', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('connection refused')
    })
    vi.stubGlobal('fetch', fetchMock)

    const { primeLocalContentCache, getRawContent } = await import('./localContentCache')

    await Promise.all([primeLocalContentCache(), primeLocalContentCache()])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((getRawContent().world as { id: string }).id).toBe('world-our-world')
  })
})

describe('primeLocalMediaCache (shared across effect runs)', () => {
  it('two concurrent primes share one in-flight read and both see the fresh catalog/state', async () => {
    const pendingMedia = deferred<Response>()
    const pendingState = deferred<Response>()
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/__travelatlas/editor/media')) return pendingMedia.promise
      if (url.includes('/__travelatlas/editor/state')) return pendingState.promise
      throw new Error(`unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { primeLocalMediaCache, createLocalMediaRepository } = await import('./localMediaRepository')

    const firstRun = primeLocalMediaCache()
    const secondRun = primeLocalMediaCache()
    // One request per endpoint despite two effect runs (fetch fires after the
    // lazily imported API module resolves, so wait for it).
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    pendingMedia.resolve(jsonResponse({
      ok: true,
      catalog: {
        schemaVersion: 3,
        items: [{
          id: 'media-primed-1',
          kind: 'photo',
          placeId: 'place-tokyo',
          placeName: 'Tokyo',
          src: '/media/user/test/primed.jpg',
          originalFileName: 'primed.jpg',
          isCover: false,
          status: 'ready',
        }],
      },
    }))
    pendingState.resolve(jsonResponse({
      ok: true,
      state: {
        schemaVersion: 1,
        mediaOrderByPlace: {},
        hiddenMediaIds: [],
        coverMediaByPlace: { 'place-tokyo': 'media-primed-1' },
      },
    }))
    await Promise.all([firstRun, secondRun])

    // Both runs continued only after the prime landed.
    const repository = createLocalMediaRepository()
    const tokyoMedia = await repository.listForPlace('place-tokyo')
    expect(tokyoMedia.map((item) => item.id)).toContain('media-primed-1')

    await primeLocalMediaCache()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

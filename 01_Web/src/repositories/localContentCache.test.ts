// Tests for the dev read-back content path (tech-debt cleanup): the initial
// prime and post-save refresh both read content from disk through the dev
// middleware, with the bundled snapshot as fallback.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRawContent, primeLocalContentCache, refreshLocalContentCache } from './localContentCache'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('localContentCache (dev read-back)', () => {
  // Runs first: asserts the pre-refresh baseline.
  it('starts from the bundled content snapshot', () => {
    const world = getRawContent().world as { id?: string }
    expect(world.id).toBe('world-our-world')
  })

  it('refreshLocalContentCache replaces the cache with on-disk content from the middleware', async () => {
    const fresh = {
      world: { id: 'world-fresh' },
      places: [{ id: 'place-fresh' }],
      visits: [],
      memories: [],
      media: [],
    }
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, content: fresh }))
    vi.stubGlobal('fetch', fetchMock)

    await refreshLocalContentCache()

    expect(fetchMock).toHaveBeenCalledWith('/__travelatlas/editor/content', { cache: 'no-store' })
    expect((getRawContent().world as { id: string }).id).toBe('world-fresh')
    expect(getRawContent().places).toEqual([{ id: 'place-fresh' }])
  })

  it('refreshLocalContentCache keeps the previous cache when the read fails', async () => {
    const before = getRawContent()
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('connection refused')
    }))

    await expect(refreshLocalContentCache()).rejects.toThrow('connection refused')
    expect(getRawContent()).toBe(before)
  })

  it('primeLocalContentCache falls back silently when the middleware is unreachable', async () => {
    const before = getRawContent()
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: false, error: 'gone' }, 404)))

    await expect(primeLocalContentCache()).resolves.toBeUndefined()
    expect(getRawContent()).toBe(before)
  })
})

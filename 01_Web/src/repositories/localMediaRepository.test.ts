// Tests for the in-place media refresh (tech-debt cleanup): after a local
// import, the repository must reflect the on-disk import catalog and curation
// state without a page reload.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMediaEditorState } from '../data/editorState'
import {
  createLocalMediaRepository,
  primeLocalMediaCache,
  refreshLocalMediaCache,
} from './localMediaRepository'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const catalogItem = {
  id: 'media-imported-test-1',
  kind: 'photo',
  placeId: 'place-beijing',
  placeName: 'Beijing',
  src: '/media/user/test/photo.jpg',
  originalFileName: 'photo.jpg',
  isCover: false,
  status: 'ready',
}

const stubMediaEndpoints = (hiddenMediaId: string) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/__travelatlas/editor/media')) {
      return jsonResponse({ ok: true, catalog: { schemaVersion: 3, items: [catalogItem] } })
    }
    if (url.includes('/__travelatlas/editor/state')) {
      return jsonResponse({
        ok: true,
        state: {
          schemaVersion: 1,
          mediaOrderByPlace: {},
          hiddenMediaIds: [hiddenMediaId],
          coverMediaByPlace: { 'place-beijing': 'media-imported-test-1' },
        },
      })
    }
    throw new Error(`unexpected fetch: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('localMediaRepository (dev in-place refresh)', () => {
  it('refreshLocalMediaCache swaps in the on-disk catalog and curation state', async () => {
    // Any bundled 北京 photo works as the "hidden by curation" fixture.
    // Reading it from the repository keeps this test alive when the tracked
    // photo set is republished with different content-hash ids.
    const bundledPhotoId = (await createLocalMediaRepository().listForPlace('place-beijing'))[0]?.id
    if (!bundledPhotoId) throw new Error('content/media.json must carry at least one 北京 photo')
    stubMediaEndpoints(bundledPhotoId)

    await refreshLocalMediaCache()

    const repository = createLocalMediaRepository()
    const beijingMedia = await repository.listForPlace('place-beijing')
    // Newly imported catalog item is visible without a reload.
    expect(beijingMedia.map((item) => item.id)).toContain('media-imported-test-1')
    // Curation state hid one bundled item and chose the new cover.
    expect(beijingMedia.map((item) => item.id)).not.toContain(bundledPhotoId)
    expect(getMediaEditorState().hiddenMediaIds).toEqual([bundledPhotoId])
    const cover = await repository.getCoverForPlace({ id: 'place-beijing' } as Parameters<typeof repository.getCoverForPlace>[0])
    expect(cover?.id).toBe('media-imported-test-1')
    const hidden = await repository.listHiddenIdsForPlace('place-beijing')
    expect(hidden).toContain(bundledPhotoId)
  })

  it('primeLocalMediaCache keeps the current caches when the middleware is unreachable', async () => {
    const stateBefore = getMediaEditorState()
    const repository = createLocalMediaRepository()
    const mediaBefore = await repository.listForPlace('place-beijing')
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('connection refused')
    }))

    await expect(primeLocalMediaCache()).resolves.toBeUndefined()
    expect(getMediaEditorState()).toBe(stateBefore)
    expect(await createLocalMediaRepository().listForPlace('place-beijing')).toEqual(mediaBefore)
  })
})

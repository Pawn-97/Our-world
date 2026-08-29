// Tests for the content store (Milestone 5): serial atomic writes, shared
// validation, cascading deletes, id/timestamp stamping.

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createContentStore } from './content-store.mjs'

const NOW = '2025-01-01T00:00:00Z'

const fixtureContent = () => ({
  world: {
    id: 'world-our-world',
    name: 'Our World',
    slug: 'our-world',
    createdAt: NOW,
    updatedAt: NOW,
  },
  places: [
    {
      id: 'place-kyoto',
      worldId: 'world-our-world',
      name: '京都',
      country: '日本',
      latitude: 35.0116,
      longitude: 135.7681,
      status: 'visited',
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  visits: [
    {
      id: 'visit-kyoto-2024-04',
      placeId: 'place-kyoto',
      status: 'completed',
      startDate: '2024-04-01',
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  memories: [
    {
      id: 'mem-kyoto-arrival-note',
      visitId: 'visit-kyoto-2024-04',
      type: 'note',
      title: '抵达',
      mediaIds: ['media-kyoto-1'],
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  media: [
    {
      id: 'media-kyoto-1',
      type: 'image',
      src: 'media/kyoto-1.jpg',
      placeId: 'place-kyoto',
      createdAt: NOW,
    },
  ],
})

let contentRoot

const seedFixture = async () => {
  const content = fixtureContent()
  for (const [name, value] of Object.entries(content)) {
    await writeFile(path.join(contentRoot, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  }
}

const readJson = async (name) => JSON.parse(await readFile(path.join(contentRoot, `${name}.json`), 'utf8'))

beforeEach(async () => {
  contentRoot = await mkdtemp(path.join(tmpdir(), 'our-world-content-store-'))
  await seedFixture()
})

afterEach(async () => {
  await rm(contentRoot, { recursive: true, force: true })
})

describe('createContentStore', () => {
  it('readAll returns the seeded content', async () => {
    const store = createContentStore(contentRoot)
    const content = await store.readAll()
    expect(content.places).toHaveLength(1)
    expect(content.world.id).toBe('world-our-world')
  })

  it('upsertPlace generates a stable id and timestamps for a new place', async () => {
    const store = createContentStore(contentRoot)
    await store.upsertPlace({
      worldId: 'world-our-world',
      name: 'Lisbon',
      nameEn: 'Lisbon',
      country: 'Portugal',
      latitude: 38.7223,
      longitude: -9.1393,
      status: 'wishlist',
    })
    const places = await readJson('places')
    expect(places).toHaveLength(2)
    const created = places.find((place) => place.name === 'Lisbon')
    expect(created.id).toBe('place-lisbon')
    expect(created.createdAt).toBeTruthy()
    expect(created.updatedAt).toBeTruthy()
  })

  it('upsertPlace with an existing id updates in place and keeps createdAt', async () => {
    const store = createContentStore(contentRoot)
    await store.upsertPlace({
      ...fixtureContent().places[0],
      name: '京都（更新）',
    })
    const places = await readJson('places')
    expect(places).toHaveLength(1)
    expect(places[0].name).toBe('京都（更新）')
    expect(places[0].createdAt).toBe(NOW)
    expect(places[0].updatedAt).not.toBe(NOW)
  })

  it('deletePlace cascades visits and memories and clears media.placeId', async () => {
    const store = createContentStore(contentRoot)
    await store.deletePlace('place-kyoto')
    expect(await readJson('places')).toHaveLength(0)
    expect(await readJson('visits')).toHaveLength(0)
    expect(await readJson('memories')).toHaveLength(0)
    const media = await readJson('media')
    expect(media).toHaveLength(1)
    expect(media[0].placeId).toBeUndefined()
  })

  it('rejects an invalid record and leaves files untouched', async () => {
    const store = createContentStore(contentRoot)
    const before = await readFile(path.join(contentRoot, 'places.json'), 'utf8')
    await expect(
      store.upsertPlace({
        worldId: 'world-our-world',
        name: 'Bad Place',
        country: 'Nowhere',
        latitude: 95,
        longitude: 0,
        status: 'visited',
      }),
    ).rejects.toMatchObject({ validation: expect.any(Array) })
    expect(await readFile(path.join(contentRoot, 'places.json'), 'utf8')).toBe(before)
  })

  it('upsertVisit rejects a dangling placeId through shared validation', async () => {
    const store = createContentStore(contentRoot)
    await expect(
      store.upsertVisit({ placeId: 'place-missing', status: 'planned' }),
    ).rejects.toMatchObject({ validation: expect.any(Array) })
    expect(await readJson('visits')).toHaveLength(1)
  })

  it('writes a .bak backup next to each changed file', async () => {
    const store = createContentStore(contentRoot)
    await store.deleteMemory('mem-kyoto-arrival-note')
    const backup = JSON.parse(await readFile(path.join(contentRoot, 'memories.bak'), 'utf8'))
    expect(backup).toHaveLength(1)
    expect(await readJson('memories')).toHaveLength(0)
  })

  it('serializes concurrent mutations through the queue', async () => {
    const store = createContentStore(contentRoot)
    await Promise.all([
      store.upsertMemory({ visitId: 'visit-kyoto-2024-04', type: 'note', title: '一', mediaIds: [] }, 'place-kyoto'),
      store.upsertMemory({ visitId: 'visit-kyoto-2024-04', type: 'note', title: '二', mediaIds: [] }, 'place-kyoto'),
      store.upsertMemory({ visitId: 'visit-kyoto-2024-04', type: 'note', title: '三', mediaIds: [] }, 'place-kyoto'),
    ])
    expect(await readJson('memories')).toHaveLength(4)
  })
})

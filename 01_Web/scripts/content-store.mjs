// Content store for the local editor (Milestone 5): the only module that
// writes content/*.json. All mutations are validated with the SAME rules as
// `npm run validate` (validateContent from validate-content.mjs — one rule
// set, no duplicates), serialized through a single promise queue, and written
// atomically (.bak backup + tmp+rename) so a crash never corrupts content.

import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { validateContent } from './validate-content.mjs'
import { generateMemoryId, generatePlaceId, generateVisitId } from './content-ids.mjs'

export const CONTENT_FILES = ['world', 'places', 'visits', 'memories', 'media']

const readJson = async (target, fallback) => {
  try {
    return JSON.parse(await readFile(target, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }
}

const exists = async (target) => {
  try {
    await readFile(target)
    return true
  } catch {
    return false
  }
}

const atomicJsonWrite = async (target, value) => {
  await mkdir(path.dirname(target), { recursive: true })
  if (await exists(target)) await copyFile(target, target.replace(/\.json$/i, '.bak'))
  const temporaryPath = `${target}.${process.pid}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, target)
}

const stamp = (record) => {
  const now = new Date().toISOString()
  return {
    ...record,
    createdAt: typeof record.createdAt === 'string' && record.createdAt ? record.createdAt : now,
    updatedAt: now,
  }
}

/**
 * @param {string} contentRoot directory containing the five content files.
 */
export const createContentStore = (contentRoot) => {
  // Single queue: content mutations run strictly one at a time.
  let queue = Promise.resolve()
  const enqueue = (task) => {
    const run = queue.then(task, task)
    queue = run.catch(() => undefined)
    return run
  }

  const readAll = async () => {
    const [world, places, visits, memories, media] = await Promise.all(
      CONTENT_FILES.map((name) => readJson(path.join(contentRoot, `${name}.json`), name === 'world' ? {} : [])),
    )
    return { world, places, visits, memories, media }
  }

  // Validate the whole content graph, then write only the files that changed.
  const commitAll = async (before, after) => {
    const errors = validateContent(after)
    if (errors.length > 0) {
      const error = new Error('内容校验未通过，已拒绝写入。')
      error.validation = errors
      throw error
    }
    for (const name of CONTENT_FILES) {
      if (JSON.stringify(before[name]) === JSON.stringify(after[name])) continue
      await atomicJsonWrite(path.join(contentRoot, `${name}.json`), after[name])
    }
  }

  const upsertById = (list, record) => {
    const index = list.findIndex((item) => item?.id === record.id)
    if (index === -1) return [...list, record]
    return list.map((item, itemIndex) => (itemIndex === index ? record : item))
  }

  const mutate = (apply) => enqueue(async () => {
    const before = await readAll()
    const after = await apply(before)
    await commitAll(before, after)
    return after
  })

  return {
    readAll: () => enqueue(readAll),

    upsertPlace: (record) => mutate(async (content) => {
      const withId = record.id
        ? record
        : { ...record, id: generatePlaceId(record, new Set(content.places.map((place) => place?.id))) }
      return { ...content, places: upsertById(content.places, stamp(withId)) }
    }),

    // Cascade: removing a place removes its visits and their memories, and
    // clears media.placeId references so nothing dangles.
    deletePlace: (placeId) => mutate(async (content) => {
      const removedVisitIds = new Set(
        content.visits.filter((visit) => visit?.placeId === placeId).map((visit) => visit.id),
      )
      return {
        ...content,
        places: content.places.filter((place) => place?.id !== placeId),
        visits: content.visits.filter((visit) => visit?.placeId !== placeId),
        memories: content.memories.filter((memory) => !removedVisitIds.has(memory?.visitId)),
        media: content.media.map((item) => (
          item?.placeId === placeId ? { ...item, placeId: undefined } : item
        )),
      }
    }),

    upsertVisit: (record) => mutate(async (content) => {
      const withId = record.id
        ? record
        : { ...record, id: generateVisitId(record.placeId, record, new Set(content.visits.map((visit) => visit?.id))) }
      return { ...content, visits: upsertById(content.visits, stamp(withId)) }
    }),

    // Cascade: removing a visit removes its memories.
    deleteVisit: (visitId) => mutate(async (content) => ({
      ...content,
      visits: content.visits.filter((visit) => visit?.id !== visitId),
      memories: content.memories.filter((memory) => memory?.visitId !== visitId),
    })),

    upsertMemory: (record, placeId) => mutate(async (content) => {
      const visit = content.visits.find((candidate) => candidate?.id === record.visitId)
      const withId = record.id
        ? record
        : {
            ...record,
            id: generateMemoryId(
              placeId ?? visit?.placeId,
              record,
              new Set(content.memories.map((memory) => memory?.id)),
            ),
          }
      return { ...content, memories: upsertById(content.memories, stamp(withId)) }
    }),

    deleteMemory: (memoryId) => mutate(async (content) => ({
      ...content,
      memories: content.memories.filter((memory) => memory?.id !== memoryId),
    })),
  }
}

const defaultContentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'content')

/** Shared store instance for the dev middleware. */
export const localContentStore = createContentStore(defaultContentRoot)

// Manual smoke entry: `node scripts/content-store.mjs` re-validates on disk.
const isCliRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isCliRun) {
  localContentStore.readAll().then((content) => {
    const errors = validateContent(content)
    console.log(errors.length === 0 ? 'content store OK' : errors.join('\n'))
    if (errors.length > 0) process.exitCode = 1
  })
}

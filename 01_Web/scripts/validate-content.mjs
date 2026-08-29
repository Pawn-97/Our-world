// Content validation for Our World (ARCHITECTURE.md §14).
// `validateContent` is pure and exported so vitest can exercise the exact
// rules the CLI enforces. The CLI fails the build on any error:
// missing/duplicate IDs, bad coordinates, dangling references
// (visit.placeId, memory.visitId, memory.mediaIds, place.coverMediaId,
// media.placeId), bad enums, and bad date formats.

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ID_PATTERNS = {
  world: /^world-[a-z0-9][a-z0-9-]*$/,
  place: /^place-[a-z0-9][a-z0-9-]*$/,
  visit: /^visit-[a-z0-9][a-z0-9-]*$/,
  memory: /^mem-[a-z0-9][a-z0-9-]*$/,
  media: /^media-[a-z0-9][a-z0-9-]*$/,
}

const PLACE_STATUSES = new Set(['wishlist', 'planned', 'visited'])
const VISIT_STATUSES = new Set(['completed', 'planned'])
const MEMORY_TYPES = new Set(['note', 'activity', 'photo'])
const MEDIA_TYPES = new Set(['image', 'video'])
const DATE_PATTERN = /^\d{4}-\d{2}(-\d{2})?$/
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0

const checkId = (errors, value, pattern, label, seenIds) => {
  if (!isNonEmptyString(value)) {
    errors.push(`${label}: missing or invalid id (expected a non-empty string).`)
    return
  }
  if (!pattern.test(value)) {
    errors.push(`${label}: id "${value}" does not follow the naming convention (${pattern.source}).`)
  }
  if (seenIds.has(value)) {
    errors.push(`${label}: duplicate id "${value}".`)
  }
  seenIds.add(value)
}

const checkTimestamps = (errors, value, label) => {
  for (const key of ['createdAt', 'updatedAt']) {
    if (!isNonEmptyString(value[key]) || !TIMESTAMP_PATTERN.test(value[key])) {
      errors.push(`${label}: ${key} must be an ISO date or datetime string.`)
    }
  }
}

const checkLatitude = (errors, value, label, required) => {
  if (value === undefined || value === null) {
    if (required) errors.push(`${label}: latitude is required.`)
    return
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -90 || value > 90) {
    errors.push(`${label}: latitude ${JSON.stringify(value)} is outside [-90, 90].`)
  }
}

const checkLongitude = (errors, value, label, required) => {
  if (value === undefined || value === null) {
    if (required) errors.push(`${label}: longitude is required.`)
    return
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -180 || value > 180) {
    errors.push(`${label}: longitude ${JSON.stringify(value)} is outside [-180, 180].`)
  }
}

const checkOptionalDate = (errors, value, key, label) => {
  if (value[key] === undefined) return
  if (!isNonEmptyString(value[key]) || !DATE_PATTERN.test(value[key])) {
    errors.push(`${label}: ${key} "${value[key]}" must be YYYY-MM-DD or YYYY-MM.`)
  }
}

const validateWorld = (errors, world) => {
  if (!isRecord(world)) {
    errors.push('world.json: must contain a single world object.')
    return
  }
  checkId(errors, world.id, ID_PATTERNS.world, 'world.json', new Set())
  if (!isNonEmptyString(world.name)) errors.push('world.json: name is required.')
  if (!isNonEmptyString(world.slug)) errors.push('world.json: slug is required.')
  if (world.overviewTarget !== undefined) {
    if (!isRecord(world.overviewTarget)) {
      errors.push('world.json: overviewTarget must be an object with lat/lng.')
    } else {
      checkLatitude(errors, world.overviewTarget.lat, 'world.json overviewTarget', true)
      checkLongitude(errors, world.overviewTarget.lng, 'world.json overviewTarget', true)
    }
  }
  checkTimestamps(errors, world, 'world.json')
}

const validatePlaces = (errors, places, worldId, mediaIds) => {
  if (!Array.isArray(places)) {
    errors.push('places.json: must contain an array of places.')
    return new Set()
  }
  const placeIds = new Set()
  for (const [index, place] of places.entries()) {
    const label = `places.json[${index}]${isNonEmptyString(place?.id) ? ` (${place.id})` : ''}`
    if (!isRecord(place)) {
      errors.push(`${label}: place must be an object.`)
      continue
    }
    checkId(errors, place.id, ID_PATTERNS.place, label, placeIds)
    if (place.worldId !== worldId) {
      errors.push(`${label}: worldId "${place.worldId}" does not match world id "${worldId}".`)
    }
    if (!isNonEmptyString(place.name)) errors.push(`${label}: name is required.`)
    if (!isNonEmptyString(place.country)) errors.push(`${label}: country is required.`)
    if (place.nameEn !== undefined && !isNonEmptyString(place.nameEn)) errors.push(`${label}: nameEn must be a non-empty string when present.`)
    if (place.countryEn !== undefined && !isNonEmptyString(place.countryEn)) errors.push(`${label}: countryEn must be a non-empty string when present.`)
    if (place.countryCode !== undefined && !/^[a-z]{2}$/.test(String(place.countryCode))) {
      errors.push(`${label}: countryCode "${place.countryCode}" must be ISO 3166-1 alpha-2 lowercase (e.g. "jp").`)
    }
    checkLatitude(errors, place.latitude, label, true)
    checkLongitude(errors, place.longitude, label, true)
    if (!PLACE_STATUSES.has(place.status)) {
      errors.push(`${label}: status "${place.status}" must be one of ${[...PLACE_STATUSES].join(', ')}.`)
    }
    if (place.wishlistReason !== undefined && !isNonEmptyString(place.wishlistReason)) {
      errors.push(`${label}: wishlistReason must be a non-empty string when present.`)
    }
    if (place.coverMediaId !== undefined && !mediaIds.has(place.coverMediaId)) {
      errors.push(`${label}: coverMediaId "${place.coverMediaId}" does not reference an existing media record.`)
    }
    checkTimestamps(errors, place, label)
  }
  return placeIds
}

const validateVisits = (errors, visits, placeIds) => {
  if (!Array.isArray(visits)) {
    errors.push('visits.json: must contain an array of visits.')
    return new Set()
  }
  const visitIds = new Set()
  for (const [index, visit] of visits.entries()) {
    const label = `visits.json[${index}]${isNonEmptyString(visit?.id) ? ` (${visit.id})` : ''}`
    if (!isRecord(visit)) {
      errors.push(`${label}: visit must be an object.`)
      continue
    }
    checkId(errors, visit.id, ID_PATTERNS.visit, label, visitIds)
    if (!isNonEmptyString(visit.placeId) || !placeIds.has(visit.placeId)) {
      errors.push(`${label}: placeId "${visit.placeId}" does not reference an existing place.`)
    }
    if (visit.status !== undefined && !VISIT_STATUSES.has(visit.status)) {
      errors.push(`${label}: status "${visit.status}" must be one of ${[...VISIT_STATUSES].join(', ')}.`)
    }
    checkOptionalDate(errors, visit, 'startDate', label)
    checkOptionalDate(errors, visit, 'endDate', label)
    if (
      DATE_PATTERN.test(String(visit.startDate))
      && DATE_PATTERN.test(String(visit.endDate))
      && visit.endDate < visit.startDate
    ) {
      errors.push(`${label}: endDate "${visit.endDate}" is earlier than startDate "${visit.startDate}".`)
    }
    checkTimestamps(errors, visit, label)
  }
  return visitIds
}

const validateMemories = (errors, memories, visitIds, mediaIds) => {
  if (!Array.isArray(memories)) {
    errors.push('memories.json: must contain an array of memories.')
    return
  }
  const memoryIds = new Set()
  for (const [index, memory] of memories.entries()) {
    const label = `memories.json[${index}]${isNonEmptyString(memory?.id) ? ` (${memory.id})` : ''}`
    if (!isRecord(memory)) {
      errors.push(`${label}: memory must be an object.`)
      continue
    }
    checkId(errors, memory.id, ID_PATTERNS.memory, label, memoryIds)
    if (!isNonEmptyString(memory.visitId) || !visitIds.has(memory.visitId)) {
      errors.push(`${label}: visitId "${memory.visitId}" does not reference an existing visit.`)
    }
    if (!MEMORY_TYPES.has(memory.type)) {
      errors.push(`${label}: type "${memory.type}" must be one of ${[...MEMORY_TYPES].join(', ')}.`)
    }
    checkOptionalDate(errors, memory, 'date', label)
    checkLatitude(errors, memory.latitude, label, false)
    checkLongitude(errors, memory.longitude, label, false)
    if (!Array.isArray(memory.mediaIds)) {
      errors.push(`${label}: mediaIds must be an array (use [] when empty).`)
    } else {
      for (const mediaId of memory.mediaIds) {
        if (!mediaIds.has(mediaId)) {
          errors.push(`${label}: mediaIds entry "${mediaId}" does not reference an existing media record.`)
        }
      }
    }
    checkTimestamps(errors, memory, label)
  }
}

const validateMedia = (errors, media, placeIds) => {
  if (!Array.isArray(media)) {
    errors.push('media.json: must contain an array of media records.')
    return new Set()
  }
  const mediaIds = new Set()
  for (const [index, item] of media.entries()) {
    const label = `media.json[${index}]${isNonEmptyString(item?.id) ? ` (${item.id})` : ''}`
    if (!isRecord(item)) {
      errors.push(`${label}: media record must be an object.`)
      continue
    }
    checkId(errors, item.id, ID_PATTERNS.media, label, mediaIds)
    if (!MEDIA_TYPES.has(item.type)) {
      errors.push(`${label}: type "${item.type}" must be one of ${[...MEDIA_TYPES].join(', ')}.`)
    }
    if (!isNonEmptyString(item.src)) errors.push(`${label}: src is required.`)
    if (item.placeId !== undefined && !placeIds.has(item.placeId)) {
      errors.push(`${label}: placeId "${item.placeId}" does not reference an existing place.`)
    }
    checkLatitude(errors, item.latitude, label, false)
    checkLongitude(errors, item.longitude, label, false)
    if (!isNonEmptyString(item.createdAt) || !TIMESTAMP_PATTERN.test(item.createdAt)) {
      errors.push(`${label}: createdAt must be an ISO date or datetime string.`)
    }
  }
  return mediaIds
}

/**
 * @returns {string[]} human-readable validation errors; empty when valid.
 */
export const validateContent = ({ world, places, visits, memories, media }) => {
  const errors = []
  validateWorld(errors, world)
  const worldId = isRecord(world) && isNonEmptyString(world.id) ? world.id : undefined

  // Media ids are needed for place.coverMediaId checks, so collect them first
  // with a light pass; the full media validation runs below.
  const mediaIdsForRefs = new Set(
    (Array.isArray(media) ? media : [])
      .filter((item) => isRecord(item) && isNonEmptyString(item.id))
      .map((item) => item.id),
  )

  const placeIds = validatePlaces(errors, places, worldId, mediaIdsForRefs)
  const visitIds = validateVisits(errors, visits, placeIds)
  validateMemories(errors, memories, visitIds, mediaIdsForRefs)
  validateMedia(errors, media, placeIds)
  return errors
}

const readJsonFile = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'))

const main = async () => {
  const contentRoot = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'content')

  const [world, places, visits, memories, media] = await Promise.all([
    readJsonFile(path.join(contentRoot, 'world.json')),
    readJsonFile(path.join(contentRoot, 'places.json')),
    readJsonFile(path.join(contentRoot, 'visits.json')),
    readJsonFile(path.join(contentRoot, 'memories.json')),
    readJsonFile(path.join(contentRoot, 'media.json')),
  ])

  const errors = validateContent({ world, places, visits, memories, media })
  if (errors.length > 0) {
    console.error(`Our World content validation failed (${errors.length}):`)
    for (const error of errors) console.error(`  - ${error}`)
    process.exitCode = 1
    return
  }

  console.log('Our World content validation passed.')
  console.log(`World "${world.name}" · ${places.length} places · ${visits.length} visits · ${memories.length} memories · ${media.length} media records`)
}

const isCliRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isCliRun) {
  main().catch((error) => {
    console.error(`Our World content validation could not run: ${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
  })
}

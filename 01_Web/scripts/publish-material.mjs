// Publishes the private `素材/<城市>/` photo drops as TRACKED web content media.
//
// Why this exists next to scripts/import-media.mjs: that pipeline is the
// local-only intake (02_Assets/MediaInbox → public/media/user/, gitignored by
// design). Content that must reach GitHub Pages has to live in the tracked
// pair instead — public/media/content/<place-slug>/ + content/media.json —
// which is what this script writes, mirroring the tier shape the sample
// generator used (full + thumb) so components are unchanged.
//
// Privacy: every published derivative is a fresh WebP encode. `rotate()` bakes
// the EXIF orientation into pixels and no metadata is copied, so GPS, camera
// serials and capture-absolute timestamps never reach the repository. The raw
// originals in 素材/ stay untracked (see .gitignore).
//
// Content wiring: media records carry `placeId` + `capturedAt` (EXIF date,
// else filename date, else file mtime). Photos are then attached to one
// `photo` memory per visit — the visit whose start date is nearest the capture
// date, within MATERIAL_VISIT_TOLERANCE_DAYS — so the place timeline shows the
// right trip's photos. Photos that match no visit stay gallery-only (they still
// render in the place photo wall) and are reported.
//
// Idempotent: re-running replaces only what this script owns
// (`media-<slug>-<hash8>` records, `mem-*-photos` memories, `sample-*`
// leftovers). Hand-authored places, visits and note memories are never touched.
//
// Usage:
//   npm run media:material          # dry run + report
//   npm run media:material -- --apply

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(scriptDirectory, '..')
const projectRoot = path.resolve(webRoot, '..')
const materialRoot = path.join(projectRoot, '素材')
const contentRoot = path.join(webRoot, 'content')
const mediaContentRoot = path.join(webRoot, 'public', 'media', 'content')

const shouldApply = process.argv.includes('--apply')
const FULL_MAX_EDGE = 1600
const FULL_QUALITY = 74
const THUMB_MAX_EDGE = 640
const THUMB_QUALITY = 70
const MATERIAL_VISIT_TOLERANCE_DAYS = 75
const stillExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif'])

const errors = []
const warnings = []

const slugOfPlaceId = (placeId) => placeId.replace(/^place-/, '')
const visitKeyOfVisitId = (visitId) => visitId.replace(/^visit-/, '')

const monthLabel = (date) => {
  if (!date) return ''
  const [year, month] = date.split('-')
  return month ? `${year}年${Number(month)}月` : year
}

const parseDate = (value) => {
  if (typeof value !== 'string') return undefined
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(value)
  if (!match) return undefined
  const [, year, month, day] = match
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day ?? '1')))
}

const daysBetween = (left, right) => Math.abs(Math.round((left - right) / 86_400_000))

/** EXIF → "YYYY-MM-DD", reading the DateTime* strings out of the raw blob. */
const exifCaptureDate = (metadata) => {
  if (!metadata?.exif) return undefined
  const text = metadata.exif.toString('latin1')
  const match = /(2\d{3})[-:](\d{2})[-:](\d{2})[ T]\d{2}:\d{2}/.exec(text)
  if (!match) return undefined
  const [, year, month, day] = match
  return `${year}-${month}-${day}`
}

/** WeChat/Live Photo exports keep the date in the file name: 20250929. */
const fileNameCaptureDate = (fileName) => {
  const match = /(20\d{2})(\d{2})(\d{2})/.exec(fileName)
  if (!match) return undefined
  const [, year, month, day] = match
  const parsed = Date.UTC(Number(year), Number(month) - 1, Number(day))
  if (Number.isNaN(parsed)) return undefined
  const date = new Date(parsed)
  if (date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return undefined
  return `${year}-${month}-${day}`
}

const orientedDimensions = (metadata) => {
  const orientation = metadata.orientation ?? 1
  const swapsAxes = orientation >= 5 && orientation <= 8
  const width = swapsAxes ? metadata.height : metadata.width
  const height = swapsAxes ? metadata.width : metadata.height
  return width && height ? { width, height } : undefined
}

const sha256 = (target) =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(target)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })

const readJson = async (filePath, label) => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    errors.push(`${label} 无法读取：${error.message}`)
    return undefined
  }
}

const writeJson = (filePath, value) =>
  writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')

const listStillFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && stillExtensions.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right), 'zh-CN'))
}

/**
 * Capture date, most trustworthy first: EXIF DateTime → a date baked into the
 * file name (WeChat/Live Photo exports) → the file's birth time. mtime is the
 * last resort only — these folders were copied, which rewrites mtime to the
 * copy date while birthtime still carries the original save date.
 */
const readMaterialPhoto = async (filePath, city) => {
  const stats = await stat(filePath)
  const metadata = await sharp(filePath).metadata()
  const dimensions = orientedDimensions(metadata)
  if (!dimensions) {
    warnings.push(`${city}/${path.basename(filePath)} 缺少有效宽高，已跳过。`)
    return undefined
  }
  const digest = await sha256(filePath)
  const exifDate = exifCaptureDate(metadata)
  const fallbackDate = fileNameCaptureDate(path.basename(filePath))
    ?? stats.birthtime.toISOString().slice(0, 10)
  return {
    city,
    fileName: path.basename(filePath),
    filePath,
    hash: digest.slice(0, 8),
    capturedAt: exifDate ?? fallbackDate,
    dateSource: exifDate ? 'exif' : 'fallback',
    dimensions,
    sizeInBytes: stats.size,
  }
}

/** Nearest-visit assignment; returns undefined when the photo matches no trip. */
const assignVisitId = (photo, visits) => {
  const captured = parseDate(photo.capturedAt)
  let best
  let bestDistance = Number.POSITIVE_INFINITY
  for (const visit of visits) {
    const start = parseDate(visit.startDate)
    if (!start) continue
    const distance = daysBetween(captured, start)
    if (distance < bestDistance) {
      best = visit
      bestDistance = distance
    }
  }
  return bestDistance <= MATERIAL_VISIT_TOLERANCE_DAYS ? best?.id : undefined
}

/** Cover pick: biggest, landscape-friendly photo of the latest visit. */
const pickCoverId = (photos, visits) => {
  const latestVisit = [...visits]
    .filter((visit) => visit.startDate)
    .sort((left, right) => right.startDate.localeCompare(left.startDate))[0]
  const pool = photos.filter((photo) => (latestVisit ? photo.visitId === latestVisit.id : true))
  const scored = (pool.length > 0 ? pool : photos).map((photo) => ({
    photo,
    score: photo.dimensions.width * photo.dimensions.height * (photo.dimensions.width >= photo.dimensions.height ? 1.2 : 1),
  }))
  scored.sort((left, right) => right.score - left.score)
  return scored[0]?.photo.id
}

const main = async () => {
  const places = await readJson(path.join(contentRoot, 'places.json'), 'content/places.json')
  const visits = await readJson(path.join(contentRoot, 'visits.json'), 'content/visits.json')
  const memories = await readJson(path.join(contentRoot, 'memories.json'), 'content/memories.json')
  const media = await readJson(path.join(contentRoot, 'media.json'), 'content/media.json')
  if (!places || !visits || !memories || !media) {
    printReport([])
    process.exitCode = 1
    return
  }

  const placeByCity = new Map(places.map((place) => [place.name.trim(), place]))
  const cities = (await readdir(materialRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, 'zh-CN'))

  const photos = []
  for (const city of cities) {
    const place = placeByCity.get(city.trim())
    if (!place) {
      errors.push(`素材/${city} 在 content/places.json 中没有同名地点，请先补地点。`)
      continue
    }
    const placeVisits = visits
      .filter((visit) => visit.placeId === place.id)
      .sort((left, right) => String(left.startDate ?? '9999').localeCompare(String(right.startDate ?? '9999')))
    const files = await listStillFiles(path.join(materialRoot, city))
    if (files.length === 0) {
      warnings.push(`素材/${city} 没有可发布的图片文件。`)
      continue
    }
    for (const filePath of files) {
      const photo = await readMaterialPhoto(filePath, city)
      if (!photo) continue
      const slug = slugOfPlaceId(place.id)
      photos.push({
        ...photo,
        slug,
        placeId: place.id,
        placeName: place.name,
        id: `media-${slug}-${photo.hash}`,
        visitId: assignVisitId(photo, placeVisits),
      })
    }
  }

  const duplicates = photos.filter((photo, index) =>
    photos.some((other, otherIndex) => otherIndex < index && other.id === photo.id))
  if (duplicates.length > 0) {
    warnings.push(`发现 ${duplicates.length} 个内容完全相同的照片，只发布一份。`)
  }
  const uniquePhotos = [...new Map(photos.map((photo) => [photo.id, photo])).values()]

  // Publish order per place: capture date, then file name — the photo wall and
  // the memory filmstrip both follow this order.
  uniquePhotos.sort((left, right) =>
    `${left.capturedAt}:${left.fileName}`.localeCompare(`${right.capturedAt}:${right.fileName}`, 'zh-CN'))

  const publishedMedia = uniquePhotos.map((photo) => ({
    id: photo.id,
    type: 'image',
    placeId: photo.placeId,
    src: `/media/content/${photo.slug}/${photo.hash}.webp`,
    thumbnailSrc: `/media/content/${photo.slug}/${photo.hash}.thumb.webp`,
    width: photo.dimensions.width,
    height: photo.dimensions.height,
    capturedAt: photo.capturedAt,
    alt: `${photo.placeName} · ${photo.capturedAt}`,
    createdAt: photo.capturedAt,
  }))

  const photoMemories = []
  const coversByPlaceId = {}
  for (const place of places) {
    const placePhotos = uniquePhotos.filter((photo) => photo.placeId === place.id)
    if (placePhotos.length === 0) continue
    const placeVisits = visits
      .filter((visit) => visit.placeId === place.id)
      .sort((left, right) => String(left.startDate ?? '9999').localeCompare(String(right.startDate ?? '9999')))
    for (const visit of placeVisits) {
      const mediaIds = placePhotos.filter((photo) => photo.visitId === visit.id).map((photo) => photo.id)
      if (mediaIds.length === 0) continue
      const first = placePhotos.find((photo) => photo.id === mediaIds[0])
      photoMemories.push({
        id: `mem-${visitKeyOfVisitId(visit.id)}-photos`,
        visitId: visit.id,
        type: 'photo',
        title: `${place.name} · ${monthLabel(first.capturedAt)}`,
        date: first.capturedAt,
        mediaIds,
        createdAt: first.capturedAt,
        updatedAt: first.capturedAt,
      })
    }
    const coverId = pickCoverId(placePhotos, placeVisits)
    if (coverId) coversByPlaceId[place.id] = coverId
  }

  printReport(uniquePhotos)
  if (errors.length > 0) {
    if (shouldApply) console.error('\n未写入任何文件。请先处理以上问题。')
    process.exitCode = 1
    return
  }
  if (!shouldApply) {
    console.log('\n预检通过。确认后运行 npm run media:material -- --apply')
    return
  }

  for (const photo of uniquePhotos) {
    const directory = path.join(mediaContentRoot, photo.slug)
    const base = path.join(directory, photo.hash)
    await mkdir(directory, { recursive: true })
    for (const [suffix, maxEdge, quality] of [
      ['.webp', FULL_MAX_EDGE, FULL_QUALITY],
      ['.thumb.webp', THUMB_MAX_EDGE, THUMB_QUALITY],
    ]) {
      const target = `${base}${suffix}`
      if (await exists(target)) continue
      await sharp(photo.filePath)
        .rotate()
        .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
        .webp({ quality, effort: 4 })
        .toFile(target)
    }
  }

  // Replace only the records this script owns; keep hand-authored content.
  const ownedIds = new Set([...publishedMedia.map((item) => item.id), ...photoMemories.map((item) => item.id)])
  const publishedSlugs = new Set(uniquePhotos.map((photo) => photo.slug))
  const generatedMediaId = (id) => {
    const slug = /^media-([a-z0-9-]+?)-(sample-[a-z0-9-]+|[0-9a-f]{8})$/.exec(id)?.[1]
    return slug && publishedSlugs.has(slug)
  }
  const keptMedia = media.filter((item) => !(generatedMediaId(item.id) && !ownedIds.has(item.id)))
  await writeJson(path.join(contentRoot, 'media.json'), [...keptMedia, ...publishedMedia])

  const generatedMemoryId = /^mem-[a-z0-9-]+-photos$/
  const keptMemories = memories.filter((item) => !(generatedMemoryId.test(item.id) && !ownedIds.has(item.id)))
  await writeJson(path.join(contentRoot, 'memories.json'), [...keptMemories, ...photoMemories])

  const nextPlaces = places.map((place) => (coversByPlaceId[place.id]
    ? { ...place, coverMediaId: coversByPlaceId[place.id], updatedAt: place.updatedAt }
    : place))
  await writeJson(path.join(contentRoot, 'places.json'), nextPlaces)

  // Drop orphaned derivative files (including the retired sample set).
  const keep = new Set(uniquePhotos.map((photo) => `${photo.slug}/${photo.hash}`))
  let removedFiles = 0
  for (const slug of publishedSlugs) {
    const directory = path.join(mediaContentRoot, slug)
    if (!(await exists(directory))) continue
    for (const entry of await readdir(directory)) {
      const stem = entry.replace(/\.(thumb\.)?webp$/, '')
      if (keep.has(`${slug}/${stem}`)) continue
      await rm(path.join(directory, entry), { force: true })
      removedFiles += 1
    }
  }

  const totalBytes = uniquePhotos.reduce((sum, photo) => sum + photo.sizeInBytes, 0)
  console.log(`\n已发布 ${publishedMedia.length} 张照片（源文件 ${(totalBytes / 1024 / 1024).toFixed(0)} MiB → WebP 两级变体）`)
  console.log(`生成 ${photoMemories.length} 条到访相册记忆；清理旧文件 ${removedFiles} 个`)
}

const exists = async (target) => {
  try {
    await stat(target)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function printReport(items) {
  const byCity = new Map()
  for (const item of items) {
    const entry = byCity.get(item.city) ?? { total: 0, unassigned: 0, dates: [] }
    entry.total += 1
    entry.dates.push(item.capturedAt)
    if (!item.visitId) entry.unassigned += 1
    byCity.set(item.city, entry)
  }
  console.log(`Our World 素材发布${shouldApply ? '（写入）' : '（预检）'}：${items.length} 张照片`)
  for (const [city, entry] of byCity) {
    const dates = entry.dates.sort()
    console.log(
      `- ${city}: ${entry.total} 张 · ${dates[0]} → ${dates[dates.length - 1]}`
      + `${entry.unassigned ? ` · ${entry.unassigned} 张未匹配到访（仅进照片墙）` : ''}`,
    )
  }
  if (warnings.length > 0) {
    console.log(`\n提醒（${warnings.length}）：`)
    for (const warning of warnings) console.log(`- ${warning}`)
  }
  if (errors.length > 0) {
    console.error(`\n需要处理（${errors.length}）：`)
    for (const error of errors) console.error(`- ${error}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

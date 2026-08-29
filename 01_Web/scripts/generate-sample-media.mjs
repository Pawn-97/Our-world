// Generates the tracked sample photo set for the six real visited places
// (Milestone 7 scale pass). The images are programmatic gradient/composition
// art — deliberately neutral, obviously samples, no real photography —
// written to the TRACKED public/media/content/<place-slug>/ directories so
// the static build ships them, and registered in content/media.json with
// stable ids. Each visited place also gets three generated photo memories in
// content/memories.json so timeline/gallery paths render at scale.
//
// Re-running is idempotent: generated records (media-*-sample-*,
// mem-*-sample-photos-*) are replaced, never duplicated; unrelated records
// are kept.
//
// Usage: npm run media:sample

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(scriptDirectory, '..')
const mediaContentPath = path.join(webRoot, 'content', 'media.json')
const memoriesContentPath = path.join(webRoot, 'content', 'memories.json')

const WIDTH = 1200
const HEIGHT = 800
const PHOTOS_PER_PLACE = 19
const GENERATED_DATE = '2026-08-30'
const CAPTURED_AT = '2025-01-01'

// One entry per visited place. baseHue anchors a city-flavoured palette; the
// PRNG rotates it per photo so no two sample images look alike.
const PLACES = [
  { slug: 'semporna', cityZh: '仙本那', cityEn: 'SEMPORNA', baseHue: 190 },
  { slug: 'kuala-lumpur', cityZh: '吉隆坡', cityEn: 'KUALA LUMPUR', baseHue: 280 },
  { slug: 'suzhou', cityZh: '苏州', cityEn: 'SUZHOU', baseHue: 140 },
  { slug: 'chongqing', cityZh: '重庆', cityEn: 'CHONGQING', baseHue: 15 },
  { slug: 'shanghai', cityZh: '上海', cityEn: 'SHANGHAI', baseHue: 210 },
  { slug: 'beijing', cityZh: '北京', cityEn: 'BEIJING', baseHue: 35 },
]

// Deterministic PRNG so the generated art is stable across runs/machines.
const hashSeed = (text) => {
  let hash = 2166136261
  for (const char of text) {
    hash ^= char.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const mulberry32 = (seed) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const hslToHex = (h, s, l) => {
  h = ((h % 360) + 360) % 360
  s /= 100
  l /= 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x]
  const to255 = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${to255(r)}${to255(g)}${to255(b)}`
}

const paletteFor = (baseHue, rand) => {
  const hue = baseHue + (rand() * 40 - 20)
  return [
    hslToHex(hue, 62 + rand() * 15, 78 + rand() * 8),
    hslToHex(hue + 12, 55 + rand() * 15, 52 + rand() * 10),
    hslToHex(hue + 24, 50 + rand() * 15, 26 + rand() * 8),
    hslToHex(hue + 160, 60, 70), // accent
  ]
}

// Four composition variants rotated by photo index.
const compositionFor = (variant, colors, rand) => {
  const accent = colors[3]
  if (variant === 0) {
    // circles
    const count = 2 + Math.floor(rand() * 3)
    const circles = Array.from({ length: count }, () => {
      const cx = Math.round(rand() * WIDTH)
      const cy = Math.round(rand() * HEIGHT)
      const r = Math.round(50 + rand() * 160)
      const fill = rand() > 0.5 ? '#ffffff' : accent
      const opacity = (0.3 + rand() * 0.6).toFixed(2)
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${opacity}"/>`
    })
    return circles.join('')
  }
  if (variant === 1) {
    // horizontal bands
    const bands = Array.from({ length: 3 }, (_, i) => {
      const y = Math.round(HEIGHT * (0.2 + i * 0.25))
      const h = Math.round(40 + rand() * 90)
      const opacity = (0.25 + rand() * 0.4).toFixed(2)
      return `<rect x="0" y="${y}" width="${WIDTH}" height="${h}" fill="${accent}" opacity="${opacity}"/>`
    })
    return bands.join('')
  }
  if (variant === 2) {
    // horizon + sun
    const horizonY = Math.round(HEIGHT * (0.55 + rand() * 0.15))
    const sunX = Math.round(WIDTH * (0.25 + rand() * 0.5))
    const sunR = Math.round(90 + rand() * 70)
    return [
      `<rect x="0" y="${horizonY}" width="${WIDTH}" height="${HEIGHT - horizonY}" fill="#101820" opacity="0.35"/>`,
      `<circle cx="${sunX}" cy="${horizonY - sunR * 0.6}" r="${sunR}" fill="${accent}" opacity="0.9"/>`,
      `<line x1="0" y1="${horizonY}" x2="${WIDTH}" y2="${horizonY}" stroke="#ffffff" stroke-width="3" opacity="0.5"/>`,
    ].join('')
  }
  // diagonal stripes
  const stripes = Array.from({ length: 3 }, (_, i) => {
    const offset = Math.round(rand() * WIDTH)
    const width = Math.round(60 + rand() * 120)
    const opacity = (0.2 + rand() * 0.35).toFixed(2)
    const shift = 300 + i * 60
    return `<polygon points="${offset},0 ${offset + width},0 ${offset + width - shift},${HEIGHT} ${offset - shift},${HEIGHT}" fill="${accent}" opacity="${opacity}"/>`
  })
  return stripes.join('')
}

const svgFor = ({ label, colors, variant, rand }) => {
  const [top, mid, bottom] = colors
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="${top}"/>
      <stop offset="0.55" stop-color="${mid}"/>
      <stop offset="1" stop-color="${bottom}"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sky)"/>
  ${compositionFor(variant, colors, rand)}
  <text x="60" y="${HEIGHT - 80}" font-family="Helvetica, Arial, sans-serif" font-size="56" font-weight="700" letter-spacing="8" fill="rgba(255,255,255,0.92)">${label}</text>
  <text x="60" y="${HEIGHT - 36}" font-family="Helvetica, Arial, sans-serif" font-size="22" letter-spacing="5" fill="rgba(255,255,255,0.65)">OUR WORLD SAMPLE MEDIA</text>
</svg>`
}

const pad2 = (n) => String(n).padStart(2, '0')

const mediaIdFor = (slug, index) => `media-${slug}-sample-${pad2(index)}`

// Memory splits per place: photos 1-7 / 8-14 / 15-19.
const MEMORY_SLICES = [[1, 7], [8, 14], [15, 19]]

const main = async () => {
  const mediaRecords = []
  const memoryRecords = []

  for (const place of PLACES) {
    const outputDir = path.join(webRoot, 'public', 'media', 'content', place.slug)
    await mkdir(outputDir, { recursive: true })

    for (let index = 1; index <= PHOTOS_PER_PLACE; index++) {
      const rand = mulberry32(hashSeed(`${place.slug}-${index}`))
      const colors = paletteFor(place.baseHue, rand)
      const variant = (index - 1) % 4
      const fileBase = `sample-${pad2(index)}`
      const svg = Buffer.from(
        svgFor({ label: `SAMPLE · ${place.cityEn} ${pad2(index)}`, colors, variant, rand }),
      )

      const base = path.join(outputDir, fileBase)
      // original.webp + the same two derivative tiers the import pipeline
      // produces (640 thumb / 1600 preview), so content media and imported
      // media render through identical component paths.
      await sharp(svg).webp({ quality: 80 }).toFile(`${base}.webp`)
      await sharp(svg).resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).webp({ quality: 70 }).toFile(`${base}.thumb.webp`)
      await sharp(svg).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toFile(`${base}.preview.webp`)

      mediaRecords.push({
        id: mediaIdFor(place.slug, index),
        type: 'image',
        placeId: `place-${place.slug}`,
        src: `/media/content/${place.slug}/${fileBase}.webp`,
        thumbnailSrc: `/media/content/${place.slug}/${fileBase}.thumb.webp`,
        previewSrc: `/media/content/${place.slug}/${fileBase}.preview.webp`,
        width: WIDTH,
        height: HEIGHT,
        capturedAt: CAPTURED_AT,
        alt: `${place.cityZh} 示例图 ${pad2(index)}`,
        createdAt: GENERATED_DATE,
      })
    }
    console.log(`generated ${PHOTOS_PER_PLACE} samples for ${place.slug}`)

    MEMORY_SLICES.forEach(([from, to], memoryIndex) => {
      const mediaIds = []
      for (let i = from; i <= to; i++) mediaIds.push(mediaIdFor(place.slug, i))
      memoryRecords.push({
        id: `mem-${place.slug}-sample-photos-${memoryIndex + 1}`,
        visitId: `visit-${place.slug}-2025-01`,
        type: 'photo',
        title: `示例照片 · ${place.cityZh}`,
        date: CAPTURED_AT,
        mediaIds,
        createdAt: GENERATED_DATE,
        updatedAt: GENERATED_DATE,
      })
    })
  }

  // Idempotent upsert: drop previously generated sample records (and the
  // retired Tokyo mock set), keep everything else.
  const generatedMediaId = /^media-(semporna|kuala-lumpur|suzhou|chongqing|shanghai|beijing)-sample-|^media-tokyo-sakura-/
  const existingMedia = JSON.parse(await readFile(mediaContentPath, 'utf8'))
  const keptMedia = existingMedia.filter((record) => !generatedMediaId.test(record.id))
  await writeFile(mediaContentPath, `${JSON.stringify([...keptMedia, ...mediaRecords], null, 2)}\n`)
  console.log(`content/media.json: ${mediaRecords.length} sample records upserted (${keptMedia.length} existing kept)`)

  const generatedMemoryId = /^mem-.*-sample-photos-/
  const existingMemories = JSON.parse(await readFile(memoriesContentPath, 'utf8'))
  const keptMemories = existingMemories.filter((record) => !generatedMemoryId.test(record.id))
  await writeFile(memoriesContentPath, `${JSON.stringify([...keptMemories, ...memoryRecords], null, 2)}\n`)
  console.log(`content/memories.json: ${memoryRecords.length} sample memories upserted (${keptMemories.length} existing kept)`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

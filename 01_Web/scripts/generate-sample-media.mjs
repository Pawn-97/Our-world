// Generates the tracked sample photo set for the Tokyo 2025-04 "樱花季再访"
// mock trip (Milestone 4). The images are programmatic gradient/composition
// art — deliberately neutral, no real photography — written to the TRACKED
// public/media/content/ directory so the static build ships them, and
// registered in content/media.json with stable ids. Re-running is idempotent:
// records with the same id are replaced, never duplicated.
//
// Usage: npm run media:sample

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(scriptDirectory, '..')
const outputRoot = path.join(webRoot, 'public', 'media', 'content', 'tokyo-2025-sakura')
const mediaContentPath = path.join(webRoot, 'content', 'media.json')

const WIDTH = 1600
const HEIGHT = 1000

// One entry per sample photo: distinct palette + composition + label so the
// gallery and timeline read as different "photos" at a glance.
const SAMPLE_PHOTOS = [
  {
    slug: 'meguro-river',
    label: 'MEGURO RIVER',
    capturedAt: '2025-04-05',
    alt: '目黑川沿岸的樱花（示例图）',
    colors: ['#f9c5d5', '#e888a8', '#7a4a63'],
    circles: [
      { cx: 1180, cy: 240, r: 150, fill: '#fff7fa', opacity: 0.9 },
      { cx: 320, cy: 760, r: 90, fill: '#ffffff', opacity: 0.5 },
      { cx: 760, cy: 540, r: 46, fill: '#ffffff', opacity: 0.4 },
    ],
  },
  {
    slug: 'ueno-park',
    label: 'UENO PARK',
    capturedAt: '2025-04-04',
    alt: '上野公园野餐（示例图）',
    colors: ['#cfe8cf', '#7fb98a', '#315c46'],
    circles: [
      { cx: 420, cy: 300, r: 120, fill: '#f6fbef', opacity: 0.85 },
      { cx: 1160, cy: 700, r: 80, fill: '#fbd3e0', opacity: 0.55 },
    ],
  },
  {
    slug: 'shibuya-night',
    label: 'SHIBUYA NIGHT',
    capturedAt: '2025-04-03',
    alt: '涩谷十字路口夜景（示例图）',
    colors: ['#1b2340', '#3d2b63', '#0c0f1f'],
    circles: [
      { cx: 800, cy: 320, r: 130, fill: '#ffd166', opacity: 0.85 },
      { cx: 240, cy: 780, r: 60, fill: '#7dd3fc', opacity: 0.5 },
      { cx: 1340, cy: 720, r: 74, fill: '#f472b6', opacity: 0.45 },
    ],
  },
  {
    slug: 'sensoji-morning',
    label: 'SENSOJI 07:40',
    capturedAt: '2025-04-02',
    alt: '浅草寺清晨（示例图）',
    colors: ['#f7d9b0', '#d98e5f', '#7a3b2e'],
    circles: [
      { cx: 800, cy: 380, r: 170, fill: '#fff3d6', opacity: 0.9 },
      { cx: 1240, cy: 760, r: 66, fill: '#ffffff', opacity: 0.4 },
    ],
  },
  {
    slug: 'kissa-latte',
    label: 'KISSA LATTE',
    capturedAt: '2025-04-05',
    alt: '喫茶店的拿铁（示例图）',
    colors: ['#efe3d0', '#c9a27a', '#5f4632'],
    circles: [
      { cx: 800, cy: 500, r: 200, fill: '#fffaf0', opacity: 0.95 },
      { cx: 800, cy: 500, r: 130, fill: '#b3875b', opacity: 0.9 },
    ],
  },
  {
    slug: 'chidorigafuchi',
    label: 'CHIDORIGAFUCHI',
    capturedAt: '2025-04-06',
    alt: '千鸟渊划船赏樱（示例图）',
    colors: ['#cfe4f5', '#8fb8dd', '#e8a0bb'],
    circles: [
      { cx: 500, cy: 280, r: 110, fill: '#fdf2f6', opacity: 0.9 },
      { cx: 1080, cy: 640, r: 140, fill: '#ffffff', opacity: 0.35 },
    ],
  },
]

const svgFor = ({ label, colors, circles }) => {
  const [top, mid, bottom] = colors
  const circleMarkup = circles
    .map((circle) => `<circle cx="${circle.cx}" cy="${circle.cy}" r="${circle.r}" fill="${circle.fill}" opacity="${circle.opacity}"/>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="${top}"/>
      <stop offset="0.55" stop-color="${mid}"/>
      <stop offset="1" stop-color="${bottom}"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sky)"/>
  ${circleMarkup}
  <text x="80" y="${HEIGHT - 90}" font-family="Helvetica, Arial, sans-serif" font-size="64" font-weight="700" letter-spacing="10" fill="rgba(255,255,255,0.92)">${label}</text>
  <text x="80" y="${HEIGHT - 40}" font-family="Helvetica, Arial, sans-serif" font-size="26" letter-spacing="6" fill="rgba(255,255,255,0.65)">TOKYO · SAKURA SAMPLE</text>
</svg>`
}

const mediaIdFor = (slug) => `media-tokyo-sakura-${slug}`

const main = async () => {
  await mkdir(outputRoot, { recursive: true })

  const records = []
  for (const photo of SAMPLE_PHOTOS) {
    const base = path.join(outputRoot, photo.slug)
    const svg = Buffer.from(svgFor(photo))
    // original.webp + the same two derivative tiers the import pipeline
    // produces (640 thumb / 2400 preview), so content media and imported
    // media render through identical component paths.
    await sharp(svg).webp({ quality: 90 }).toFile(`${base}.webp`)
    await sharp(svg).resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).webp({ quality: 76 }).toFile(`${base}.thumb.webp`)
    await sharp(svg).resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toFile(`${base}.preview.webp`)

    records.push({
      id: mediaIdFor(photo.slug),
      type: 'image',
      placeId: 'place-tokyo',
      src: `/media/content/tokyo-2025-sakura/${photo.slug}.webp`,
      thumbnailSrc: `/media/content/tokyo-2025-sakura/${photo.slug}.thumb.webp`,
      previewSrc: `/media/content/tokyo-2025-sakura/${photo.slug}.preview.webp`,
      width: WIDTH,
      height: HEIGHT,
      capturedAt: photo.capturedAt,
      alt: photo.alt,
      createdAt: '2026-08-29',
    })
    console.log(`generated ${photo.slug}`)
  }

  const existing = JSON.parse(await readFile(mediaContentPath, 'utf8'))
  const sampleIds = new Set(records.map((record) => record.id))
  const kept = existing.filter((record) => !sampleIds.has(record.id))
  await writeFile(mediaContentPath, `${JSON.stringify([...kept, ...records], null, 2)}\n`)
  console.log(`content/media.json: ${records.length} sample records upserted (${kept.length} existing kept)`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

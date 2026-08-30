// Post-build dist integrity smoke check (Milestone 6 — the automated part of
// "responsive QA" / publish safety). Verifies, without a browser:
//   1. dist/index.html exists and every local asset it references resolves
//      under the expected base path AND exists on disk;
//   2. the Cesium runtime assets were copied (Assets/Workers/Widgets/
//      ThirdParty + widgets.css);
//   3. tracked content media directory is present;
//   4. no dev-only editor endpoints leaked into the production bundle;
//   5. no Cesium ion API endpoint string outside the prebuilt cesium/ asset.
//
// Usage: node scripts/check-dist.mjs            (expects base '/')
//        BASE_PATH=/our-world/ node scripts/check-dist.mjs

import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distRoot = path.join(webRoot, 'dist')

const normalizeBasePath = (value) => {
  const trimmed = String(value ?? '').trim()
  if (!trimmed || trimmed === '/') return '/'
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`
}

const base = normalizeBasePath(process.env.BASE_PATH)
const errors = []
const fail = (message) => errors.push(message)

const indexPath = path.join(distRoot, 'index.html')
let indexHtml = ''
try {
  indexHtml = readFileSync(indexPath, 'utf8')
} catch {
  fail('dist/index.html is missing — run npm run build first.')
}

// 1. Local asset references in index.html must carry the base and exist.
if (indexHtml) {
  const refs = [...indexHtml.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((ref) => !ref.startsWith('http://') && !ref.startsWith('https://') && !ref.startsWith('data:'))
  for (const ref of refs) {
    if (base !== '/' && !ref.startsWith(base)) {
      fail(`index.html reference "${ref}" does not start with base "${base}".`)
      continue
    }
    const relative = base !== '/' && ref.startsWith(base) ? ref.slice(base.length - 1) : ref
    const target = path.join(distRoot, relative)
    try {
      if (!statSync(target).isFile()) fail(`index.html reference "${ref}" is not a file.`)
    } catch {
      fail(`index.html reference "${ref}" missing on disk (expected ${path.relative(webRoot, target)}).`)
    }
  }
}

// 2. Cesium runtime assets.
for (const required of ['cesium/Assets', 'cesium/Workers', 'cesium/Widgets', 'cesium/ThirdParty', 'cesium/Widgets/widgets.css']) {
  try {
    statSync(path.join(distRoot, required))
  } catch {
    fail(`Cesium asset "${required}" missing from dist.`)
  }
}

// 3. Tracked content media published.
try {
  if (!statSync(path.join(distRoot, 'media', 'content')).isDirectory()) {
    fail('dist/media/content is not a directory.')
  }
} catch {
  fail('dist/media/content missing — tracked content media was not published.')
}

// 4. Dev-only editor endpoints and debug handles must not exist anywhere in
// the bundle. `__ourWorldViewer` is the DEV-only window handle for browser
// QA scripts; the import.meta.env.DEV guard must have tree-shaken it away.
const walk = (dir) => {
  const files = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) files.push(...walk(full))
    else files.push(full)
  }
  return files
}
try {
  for (const file of walk(distRoot)) {
    if (!/\.(js|css|html|json|map)$/.test(file)) continue
    const text = readFileSync(file, 'utf8')
    if (text.includes('__travelatlas')) {
      fail(`dev-only editor endpoint string found in ${path.relative(distRoot, file)}.`)
    }
    if (text.includes('__ourWorldViewer')) {
      fail(`dev-only viewer debug handle found in ${path.relative(distRoot, file)}.`)
    }
  }
} catch (error) {
  if (errors.length === 0) throw error
}

// 5. No Cesium ion runtime (UX-2): the app must never reference the ion API
// endpoint. The prebuilt dist/cesium library asset is exempt — it is copied
// verbatim and contains the library's internal default URL constant, but no
// application code path invokes it (no token, baseLayer/geocoder disabled).
try {
  for (const file of walk(distRoot)) {
    if (file.startsWith(path.join(distRoot, 'cesium'))) continue
    if (!/\.(js|css|html|json|map)$/.test(file)) continue
    if (readFileSync(file, 'utf8').includes('api.cesium.com')) {
      fail(`Cesium ion endpoint string found in ${path.relative(distRoot, file)}.`)
    }
  }
} catch (error) {
  if (errors.length === 0) throw error
}

if (errors.length > 0) {
  console.error(`dist integrity check FAILED (base "${base}"):`)
  for (const error of errors) console.error(`  - ${error}`)
  process.exit(1)
}
console.log(`dist integrity check passed (base "${base}").`)

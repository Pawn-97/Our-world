// Post-build fixup for sub-path hosting (Milestone 6 — GitHub Pages project
// sites). vite-plugin-cesium joins Vite's `base` into BOTH the runtime
// CESIUM_BASE_URL (a URL, correctly base-prefixed) and the asset copy
// destination (a disk path, incorrectly base-prefixed): with
// BASE_PATH=/our-world/ the Cesium runtime lands in dist/our-world/cesium/
// while index.html and Cesium itself reference /our-world/cesium/..., which
// GitHub Pages maps to dist/cesium/. Move the directory back so URL and disk
// layout agree. No-op under the default root base.

import { existsSync, renameSync, rmSync } from 'node:fs'
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
if (base === '/') process.exit(0)

const nestedCesium = path.join(distRoot, base, 'cesium')
if (!existsSync(nestedCesium)) {
  console.log(`fix-dist-base: no nested Cesium directory for base "${base}", nothing to do.`)
  process.exit(0)
}

const targetCesium = path.join(distRoot, 'cesium')
rmSync(targetCesium, { recursive: true, force: true })
renameSync(nestedCesium, targetCesium)
// Remove the now-empty dist/<base>/ tree the plugin created.
rmSync(path.join(distRoot, base), { recursive: true, force: true })
console.log(`fix-dist-base: moved dist${base}cesium → dist/cesium for base "${base}".`)

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const projectRoot = path.resolve(webRoot, '..')
const publicFiles = process.argv.includes('--manifest-stdin')
  ? readFileSync(0, 'utf8').split('\0').filter(Boolean)
  : []

const isPrivateTrackedPath = (filePath) => {
  const normalized = filePath.replaceAll('\\', '/')
  if (normalized.startsWith('02_Assets/PrivateData/')) return true
  if (normalized.startsWith('01_Web/public/media/user/')) return true
  if (normalized.startsWith('01_Web/src/data/generated/')) return true
  if (normalized.includes('.local.')) return true
  if (normalized === '01_Web/src/data/travel_map_export.json') return true
  if (normalized.startsWith('02_Assets/MediaInbox/')) {
    return normalized !== '02_Assets/MediaInbox/README.md'
      && !normalized.startsWith('02_Assets/MediaInbox/_country-template/')
  }
  if (/^01_Web\/\.env(?:\.|$)/.test(normalized)) return normalized !== '01_Web/.env.example'
  return false
}

const existingViolations = publicFiles.filter((filePath) =>
  isPrivateTrackedPath(filePath) && existsSync(path.join(projectRoot, filePath)),
)

const contentDir = path.join(webRoot, 'content')
const requiredContentFiles = ['world', 'places', 'visits', 'memories', 'media']
  .map((name) => `01_Web/content/${name}.json`)
const errors = []

if (publicFiles.length === 0) {
  errors.push('No public-file manifest was provided. Run this audit through npm run privacy:check.')
}

if (existingViolations.length > 0) {
  errors.push(`Private paths are tracked:\n${existingViolations.map((filePath) => `  - ${filePath}`).join('\n')}`)
}
if (!existsSync(contentDir)) {
  errors.push('01_Web/content/ is missing; tracked world content is required.')
} else {
  const missingContent = requiredContentFiles.filter((filePath) => !publicFiles.includes(filePath))
  if (missingContent.length > 0) {
    errors.push(`Content files must be tracked in git:\n${missingContent.map((filePath) => `  - ${filePath}`).join('\n')}`)
  }
}

if (errors.length > 0) {
  console.error(`Our World privacy audit failed (${errors.length}):`)
  for (const error of errors) console.error(`\n${error}`)
  process.exitCode = 1
} else {
  console.log('Our World privacy audit passed.')
  console.log(`Tracked and unignored public files checked: ${publicFiles.length}`)
  console.log(`Tracked content files: ${requiredContentFiles.length} under 01_Web/content/`)
  console.log('Private Inbox, generated media, local catalogs, local editor state, and environment files are outside the tracked public boundary.')
  console.log('Note: this checks the current tree. Publish from a clean repository so earlier private Git history is not inherited.')
}

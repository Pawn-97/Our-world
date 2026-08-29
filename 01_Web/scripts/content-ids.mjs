// Stable ID generation for the local editor (Milestone 5).
// Pure functions — no IO — so vitest can cover slug/conflict behavior.
// Convention (content/README.md): place-<slug>, visit-<place>-<start>,
// mem-<place>-<topic>-<type>. Slugs are latin-only because content
// validation enforces ASCII id patterns; CJK-only names fall back to a
// timestamp-based suffix.

const slugify = (value) =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const uniqueId = (base, existingIds) => {
  if (!existingIds.has(base)) return base
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`
    if (!existingIds.has(candidate)) return candidate
  }
  throw new Error(`无法为 "${base}" 生成不冲突的 id。`)
}

const fallbackSlug = (prefix) => `${prefix}-${Date.now().toString(36)}`

export const generatePlaceId = (draft, existingIds) => {
  const slug = slugify(draft?.nameEn) || slugify(draft?.name)
  return uniqueId(slug ? `place-${slug}` : fallbackSlug('place'), existingIds)
}

export const generateVisitId = (placeId, draft, existingIds) => {
  const placePart = slugify(String(placeId ?? '').replace(/^place-/, '')) || 'place'
  const startPart = slugify(draft?.startDate) || 'undated'
  return uniqueId(`visit-${placePart}-${startPart}`, existingIds)
}

export const generateMemoryId = (placeId, draft, existingIds) => {
  const placePart = slugify(String(placeId ?? '').replace(/^place-/, '')) || 'place'
  const topic = slugify(draft?.title) || 'memory'
  const type = ['note', 'activity', 'photo'].includes(draft?.type) ? draft.type : 'note'
  return uniqueId(`mem-${placePart}-${topic}-${type}`, existingIds)
}

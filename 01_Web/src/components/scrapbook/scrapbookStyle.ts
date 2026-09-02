// Deterministic paper-craft geometry for the scrapbook place detail page.
//
// Every tilt, tape angle and torn edge is derived from a stable content id, so
// a place collage looks identical on every render, device and build — the
// layout must never jitter between renders the way Math.random would.
//
// Pure helpers only (no React, no DOM) so vitest can pin the geometry.

import type { Visit } from '../../domain/types'

const hashSeed = (text: string) => {
  let hash = 2166136261
  for (const char of text) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** mulberry32 step: same seed + salt always yields the same unit value. */
const unitFor = (seed: string, salt: number) => {
  let state = (hashSeed(seed) ^ Math.imul(salt + 1, 0x6d2b79f5)) >>> 0
  state = (state + 0x6d2b79f5) | 0
  let t = Math.imul(state ^ (state >>> 15), 1 | state)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Small rotation in degrees, signed, capped by `amplitude`. */
export const tiltFor = (seed: string, amplitude = 2.2): number =>
  Number(((unitFor(seed, 1) * 2 - 1) * amplitude).toFixed(2))

/** Washi-tape angle in degrees — tapes sit crooked, but never upside down. */
export const tapeTiltFor = (seed: string): number =>
  Number(((unitFor(seed, 2) * 2 - 1) * 9).toFixed(2))

/** Vertical offset in percent used to stagger cards in a column. */
export const offsetFor = (seed: string, range = 6): number =>
  Number(((unitFor(seed, 3) - 0.5) * range).toFixed(2))

/**
 * A hand-torn paper edge as a CSS `polygon()`. Jitter stays inside the box so
 * text never gets clipped: only the outer 0–2.6% of each edge is roughened.
 */
export const tornPolygon = (seed: string, depth = 2.6): string => {
  const points: string[] = []
  const jitter = (index: number) => Number((unitFor(seed, index + 10) * depth).toFixed(2))
  const topSteps = 9
  const sideSteps = 6

  for (let index = 0; index <= topSteps; index += 1) {
    points.push(`${((index / topSteps) * 100).toFixed(2)}% ${jitter(index).toFixed(2)}%`)
  }
  for (let index = 1; index <= sideSteps; index += 1) {
    points.push(`${(100 - jitter(topSteps + index)).toFixed(2)}% ${((index / sideSteps) * 100).toFixed(2)}%`)
  }
  for (let index = topSteps - 1; index >= 0; index -= 1) {
    points.push(`${((index / topSteps) * 100).toFixed(2)}% ${(100 - jitter(topSteps + sideSteps + index)).toFixed(2)}%`)
  }
  for (let index = sideSteps - 1; index >= 1; index -= 1) {
    points.push(`${jitter(topSteps * 2 + sideSteps + index).toFixed(2)}% ${((index / sideSteps) * 100).toFixed(2)}%`)
  }
  return `polygon(${points.join(', ')})`
}

const dateParts = (value?: string) => {
  const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(value ?? '')
  if (!match) return undefined
  const [, year, month, day] = match
  return { year, month, day }
}

/** "2025年12月" / "2025年" — month granularity is what the records carry. */
export const scrapMonthLabel = (date?: string): string => {
  const parts = dateParts(date)
  if (!parts) return ''
  if (!parts.month) return `${parts.year}年`
  return `${parts.year}年${Number(parts.month)}月`
}

const dayLabel = (date?: string): string => {
  const parts = dateParts(date)
  if (!parts?.month) return ''
  return parts.day ? `${Number(parts.month)}.${Number(parts.day)}` : `${Number(parts.month)}月`
}

/**
 * Visit window as a compact scrapbook date: "2025.12.24 – 12.27", or just the
 * month when only YYYY-MM is known. Unknown dates read "日期待定".
 */
export const formatVisitWindow = (visit: Visit): string => {
  if (!visit.startDate) return '日期待定'
  const parts = dateParts(visit.startDate)
  const start = dayLabel(visit.startDate)
  const end = visit.endDate && visit.endDate !== visit.startDate ? dayLabel(visit.endDate) : ''
  const body = end ? `${start} – ${end}` : start
  if (!parts) return visit.startDate
  return body ? `${parts.year}.${body}` : parts.year
}

/** Meta line under the title: counts plus the whole-place date span. */
export const buildPlaceMeta = ({
  photoCount,
  memoryCount,
  dateRangeLabel,
}: {
  photoCount: number
  memoryCount: number
  dateRangeLabel: string
}): string => {
  const pieces = [
    photoCount > 0 ? `${photoCount} 张照片` : null,
    memoryCount > 0 ? `${memoryCount} 段记忆` : null,
    dateRangeLabel && !/date unknown/i.test(dateRangeLabel) ? dateRangeLabel : null,
  ].filter((piece): piece is string => Boolean(piece))
  return pieces.join('  ·  ')
}

/** Body paragraphs: content keeps `\n` separated prose; blank lines collapse. */
export const splitParagraphs = (body?: string): string[] =>
  (body ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

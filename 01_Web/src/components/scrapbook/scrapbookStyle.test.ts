import { describe, expect, it } from 'vitest'
import type { Visit } from '../../domain/types'
import {
  buildPlaceMeta,
  formatVisitWindow,
  scrapMonthLabel,
  splitParagraphs,
  tiltFor,
  tornPolygon,
} from './scrapbookStyle'

describe('tiltFor', () => {
  it('is deterministic for the same seed', () => {
    expect(tiltFor('place-shanghai:cover')).toBe(tiltFor('place-shanghai:cover'))
  })

  it('stays inside the requested amplitude', () => {
    for (const seed of ['a', 'place-semporna:cover', 'mem-chongqing-2025-01-photos', 'x'.repeat(64)]) {
      expect(Math.abs(tiltFor(seed, 2.6))).toBeLessThanOrEqual(2.6)
    }
  })

  it('varies across seeds so the collage is not uniformly aligned', () => {
    const tilts = new Set(['a', 'b', 'c', 'd', 'e'].map((seed) => tiltFor(seed)))
    expect(tilts.size).toBeGreaterThan(1)
  })
})

/** Polygon points are written as `x% y%`; strip the unit before parsing. */
const parsePoints = (polygon: string) =>
  polygon
    .slice('polygon('.length, -1)
    .split(', ')
    .map((point) => point.split(/\s+/).map((value) => Number(value.replace('%', ''))))

describe('tornPolygon', () => {
  it('returns a css polygon of in-bounds percentage points', () => {
    const polygon = tornPolygon('mem-beijing-universal-note')
    expect(polygon.startsWith('polygon(')).toBe(true)
    expect(polygon.endsWith(')')).toBe(true)
    for (const [x, y] of parsePoints(polygon)) {
      expect(Number.isFinite(x)).toBe(true)
      expect(Number.isFinite(y)).toBe(true)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(100)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(100)
    }
  })

  it('roughens only the outer band so card content never clips', () => {
    const depth = 2.6
    const points = parsePoints(tornPolygon('place-nanjing:summary', depth))
    expect(points.length).toBeGreaterThan(16)
    for (const [x, y] of points) {
      expect(Math.min(x, y, 100 - x, 100 - y)).toBeLessThanOrEqual(depth)
    }
  })

  it('gives each seed its own silhouette', () => {
    expect(tornPolygon('mem-a')).not.toBe(tornPolygon('mem-b'))
  })
})

describe('scrapMonthLabel', () => {
  it('formats month and day granularity in Chinese', () => {
    expect(scrapMonthLabel('2025-12')).toBe('2025年12月')
    expect(scrapMonthLabel('2025-12-27')).toBe('2025年12月')
    expect(scrapMonthLabel('2025')).toBe('2025年')
    expect(scrapMonthLabel(undefined)).toBe('')
    expect(scrapMonthLabel('garbage')).toBe('')
  })
})

describe('formatVisitWindow', () => {
  const visit = (partial: Partial<Visit> & { id: string; placeId: string }): Visit => ({
    createdAt: '2026-09-02',
    updatedAt: '2026-09-02',
    ...partial,
  })

  it('shows a same-year window without repeating the year', () => {
    expect(formatVisitWindow(visit({
      id: 'visit-shanghai-2025-12',
      placeId: 'place-shanghai',
      startDate: '2025-12-24',
      endDate: '2025-12-27',
    }))).toBe('2025.12.24 – 12.27')
  })

  it('keeps both years when a visit spans a year boundary', () => {
    expect(formatVisitWindow(visit({
      id: 'visit-changchun-2025-04',
      placeId: 'place-changchun',
      startDate: '2025-04-18',
      endDate: '2025-05-18',
    }))).toBe('2025.4.18 – 5.18')
  })

  it('falls back to a month label and to 日期待定', () => {
    expect(formatVisitWindow(visit({ id: 'v', placeId: 'p', startDate: '2026-06' }))).toBe('2026.6月')
    expect(formatVisitWindow(visit({ id: 'v', placeId: 'p' }))).toBe('日期待定')
  })
})

describe('buildPlaceMeta', () => {
  it('joins the counts and drops an unknown date range', () => {
    expect(buildPlaceMeta({ photoCount: 19, memoryCount: 4, dateRangeLabel: '2025.12.24 → 2025.12.27' }))
      .toBe('19 张照片  ·  4 段记忆  ·  2025.12.24 → 2025.12.27')
    expect(buildPlaceMeta({ photoCount: 0, memoryCount: 2, dateRangeLabel: 'Date unknown' }))
      .toBe('2 段记忆')
  })
})

describe('splitParagraphs', () => {
  it('splits on newlines and drops blank lines', () => {
    expect(splitParagraphs('第一段\n\n第二段  \n')).toEqual(['第一段', '第二段'])
    expect(splitParagraphs(undefined)).toEqual([])
  })
})

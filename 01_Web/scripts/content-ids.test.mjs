// Unit tests for scripts/content-ids.mjs — stable ID generation (M5).

import { describe, expect, it } from 'vitest'

import { generateMemoryId, generatePlaceId, generateVisitId } from './content-ids.mjs'

describe('generatePlaceId', () => {
  it('slugifies the English name', () => {
    expect(generatePlaceId({ name: '首尔', nameEn: 'Seoul' }, new Set())).toBe('place-seoul')
  })

  it('falls back to the latinized display name', () => {
    expect(generatePlaceId({ name: 'Hong Kong' }, new Set())).toBe('place-hong-kong')
  })

  it('suffixes on conflict', () => {
    expect(generatePlaceId({ nameEn: 'Tokyo' }, new Set(['place-tokyo']))).toBe('place-tokyo-2')
  })

  it('falls back to a timestamped id for CJK-only names', () => {
    const id = generatePlaceId({ name: '东京' }, new Set())
    expect(id).toMatch(/^place-[a-z0-9][a-z0-9-]*$/)
  })
})

describe('generateVisitId', () => {
  it('combines place and start date', () => {
    expect(generateVisitId('place-tokyo', { startDate: '2026-05-01' }, new Set())).toBe('visit-tokyo-2026-05-01')
  })

  it('uses undated when no start date exists', () => {
    expect(generateVisitId('place-paris', {}, new Set())).toBe('visit-paris-undated')
  })

  it('suffixes on conflict', () => {
    const existing = new Set(['visit-tokyo-2026-05-01'])
    expect(generateVisitId('place-tokyo', { startDate: '2026-05-01' }, existing)).toBe('visit-tokyo-2026-05-01-2')
  })
})

describe('generateMemoryId', () => {
  it('combines place, topic, and type', () => {
    expect(generateMemoryId('place-tokyo', { title: 'Sensoji Morning', type: 'note' }, new Set()))
      .toBe('mem-tokyo-sensoji-morning-note')
  })

  it('falls back for CJK-only titles and unknown types', () => {
    const id = generateMemoryId('place-tokyo', { title: '清晨', type: 'unknown' }, new Set())
    expect(id).toMatch(/^mem-tokyo-[a-z0-9-]+-note$/)
  })

  it('suffixes on conflict', () => {
    const existing = new Set(['mem-tokyo-sensoji-note'])
    expect(generateMemoryId('place-tokyo', { title: 'Sensoji', type: 'note' }, existing))
      .toBe('mem-tokyo-sensoji-note-2')
  })
})

import { describe, expect, it } from 'vitest'

import {
  validateMemoryDraft,
  validatePlaceDraft,
  validateVisitDraft,
} from './editorValidation'
import type { MemoryDraft, PlaceDraft, VisitDraft } from './editorValidation'

const placeDraft = (overrides: Partial<PlaceDraft> = {}): PlaceDraft => ({
  name: '东京',
  nameEn: 'Tokyo',
  country: '日本',
  countryEn: 'Japan',
  countryCode: 'jp',
  region: '',
  latitude: '35.6762',
  longitude: '139.6503',
  status: 'visited',
  summary: '',
  wishlistReason: '',
  ...overrides,
})

const visitDraft = (overrides: Partial<VisitDraft> = {}): VisitDraft => ({
  title: '',
  status: 'completed',
  startDate: '2025-04-02',
  endDate: '2025-04-06',
  summary: '',
  ...overrides,
})

const memoryDraft = (overrides: Partial<MemoryDraft> = {}): MemoryDraft => ({
  type: 'note',
  title: '浅草寺的清晨',
  body: '',
  date: '2025-04-02',
  time: '07:40',
  locationName: '浅草寺',
  mediaIds: [],
  ...overrides,
})

describe('validatePlaceDraft', () => {
  it('accepts a complete draft', () => {
    expect(validatePlaceDraft(placeDraft())).toEqual([])
  })

  it('requires name and country', () => {
    const errors = validatePlaceDraft(placeDraft({ name: ' ', country: '' }))
    expect(errors).toContain('名称必填。')
    expect(errors).toContain('国家/地区必填。')
  })

  it('rejects out-of-range coordinates', () => {
    expect(validatePlaceDraft(placeDraft({ latitude: '95' }))).toContain('纬度须在 -90 到 90 之间。')
    expect(validatePlaceDraft(placeDraft({ longitude: '-181' }))).toContain('经度须在 -180 到 180 之间。')
    expect(validatePlaceDraft(placeDraft({ latitude: 'abc' })).length).toBeGreaterThan(0)
  })

  it('rejects a malformed country code', () => {
    expect(validatePlaceDraft(placeDraft({ countryCode: 'JPN' }))).toContain('国家代码须为两位小写字母（如 jp）。')
  })
})

describe('validateVisitDraft', () => {
  it('accepts a complete draft and undated drafts', () => {
    expect(validateVisitDraft(visitDraft())).toEqual([])
    expect(validateVisitDraft(visitDraft({ startDate: '', endDate: '' }))).toEqual([])
  })

  it('rejects malformed dates', () => {
    expect(validateVisitDraft(visitDraft({ startDate: '2025/04/02' }))).toContain('开始日期须为 YYYY-MM-DD 或 YYYY-MM。')
  })

  it('rejects end before start', () => {
    expect(validateVisitDraft(visitDraft({ endDate: '2025-04-01' }))).toContain('结束日期不能早于开始日期。')
  })
})

describe('validateMemoryDraft', () => {
  it('accepts a complete note draft', () => {
    expect(validateMemoryDraft(memoryDraft())).toEqual([])
  })

  it('requires a title', () => {
    expect(validateMemoryDraft(memoryDraft({ title: '' }))).toContain('标题必填。')
  })

  it('rejects malformed time', () => {
    expect(validateMemoryDraft(memoryDraft({ time: '7pm' }))).toContain('时间须为 HH:MM（24 小时制）。')
  })

  it('requires media for photo memories', () => {
    expect(validateMemoryDraft(memoryDraft({ type: 'photo' }))).toContain('照片记忆至少需要关联一张媒体资产。')
    expect(validateMemoryDraft(memoryDraft({ type: 'photo', mediaIds: ['media-a'] }))).toEqual([])
  })
})

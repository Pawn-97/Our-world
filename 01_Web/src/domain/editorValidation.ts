// Form-level validation for the local editor (Milestone 5): instant feedback
// on required fields, date formats, HH:MM times, and coordinate ranges before
// anything is sent. The authoritative full-graph validation stays in
// scripts/validate-content.mjs and runs again server-side before every write —
// these field rules intentionally mirror the same formats.

import type { MemoryType, PlaceStatus, VisitStatus } from './types'

export const DATE_PATTERN = /^\d{4}-\d{2}(-\d{2})?$/
export const TIME_PATTERN = /^\d{2}:\d{2}$/
export const COUNTRY_CODE_PATTERN = /^[a-z]{2}$/

const isBlank = (value: string) => value.trim().length === 0

export type PlaceDraft = {
  id?: string
  name: string
  nameEn: string
  country: string
  countryEn: string
  countryCode: string
  region: string
  latitude: string
  longitude: string
  status: PlaceStatus
  summary: string
  wishlistReason: string
}

export const validatePlaceDraft = (draft: PlaceDraft): string[] => {
  const errors: string[] = []
  if (isBlank(draft.name)) errors.push('名称必填。')
  if (isBlank(draft.country)) errors.push('国家/地区必填。')
  if (draft.countryCode && !COUNTRY_CODE_PATTERN.test(draft.countryCode)) {
    errors.push('国家代码须为两位小写字母（如 jp）。')
  }
  const lat = Number(draft.latitude)
  const lng = Number(draft.longitude)
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) errors.push('纬度须在 -90 到 90 之间。')
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) errors.push('经度须在 -180 到 180 之间。')
  return errors
}

export type VisitDraft = {
  id?: string
  title: string
  status: VisitStatus
  startDate: string
  endDate: string
  summary: string
}

export const validateVisitDraft = (draft: VisitDraft): string[] => {
  const errors: string[] = []
  if (draft.startDate && !DATE_PATTERN.test(draft.startDate)) errors.push('开始日期须为 YYYY-MM-DD 或 YYYY-MM。')
  if (draft.endDate && !DATE_PATTERN.test(draft.endDate)) errors.push('结束日期须为 YYYY-MM-DD 或 YYYY-MM。')
  if (
    draft.startDate && draft.endDate
    && DATE_PATTERN.test(draft.startDate) && DATE_PATTERN.test(draft.endDate)
    && draft.endDate < draft.startDate
  ) {
    errors.push('结束日期不能早于开始日期。')
  }
  return errors
}

export type MemoryDraft = {
  id?: string
  type: MemoryType
  title: string
  body: string
  date: string
  time: string
  locationName: string
  mediaIds: string[]
}

export const validateMemoryDraft = (draft: MemoryDraft): string[] => {
  const errors: string[] = []
  if (isBlank(draft.title)) errors.push('标题必填。')
  if (draft.date && !DATE_PATTERN.test(draft.date)) errors.push('日期须为 YYYY-MM-DD 或 YYYY-MM。')
  if (draft.time && !TIME_PATTERN.test(draft.time)) errors.push('时间须为 HH:MM（24 小时制）。')
  if (draft.type === 'photo' && draft.mediaIds.length === 0) errors.push('照片记忆至少需要关联一张媒体资产。')
  return errors
}

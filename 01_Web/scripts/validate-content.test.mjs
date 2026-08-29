// Unit tests for scripts/validate-content.mjs (MVP.md M2 exit criteria).
// Every test mutates a copy of one known-valid fixture, so a passing fixture
// proves the validator accepts good content and each mutation isolates exactly
// one failure mode.

import { describe, expect, it } from 'vitest'

import { validateContent } from './validate-content.mjs'

const TIMESTAMPS = { createdAt: '2026-08-29T00:00:00Z', updatedAt: '2026-08-29T00:00:00Z' }

const validContent = () => ({
  world: {
    id: 'world-our-world',
    name: 'Our World',
    slug: 'our-world',
    overviewTarget: { lat: 30, lng: 110 },
    ...TIMESTAMPS,
  },
  places: [
    {
      id: 'place-tokyo',
      worldId: 'world-our-world',
      name: '东京',
      nameEn: 'Tokyo',
      country: '日本',
      countryEn: 'Japan',
      countryCode: 'jp',
      latitude: 35.68,
      longitude: 139.69,
      status: 'visited',
      ...TIMESTAMPS,
    },
  ],
  visits: [
    {
      id: 'visit-tokyo-2023-10',
      placeId: 'place-tokyo',
      startDate: '2023-10-02',
      endDate: '2023-10-09',
      ...TIMESTAMPS,
    },
  ],
  memories: [
    {
      id: 'mem-tokyo-arrival-note',
      visitId: 'visit-tokyo-2023-10',
      type: 'note',
      body: 'First evening in Shinjuku.',
      mediaIds: [],
      ...TIMESTAMPS,
    },
  ],
  media: [
    {
      id: 'media-tokyo-shibuya-photo',
      type: 'image',
      src: '/media/user/japan/tokyo/photos/shibuya.jpg',
      placeId: 'place-tokyo',
      createdAt: '2026-08-29T00:00:00Z',
    },
  ],
})

describe('validateContent', () => {
  it('accepts a valid minimal world', () => {
    expect(validateContent(validContent())).toEqual([])
  })

  it('fails on a missing place id', () => {
    const content = validContent()
    delete content.places[0].id
    const errors = validateContent(content)
    expect(errors.some((error) => error.includes('missing or invalid id'))).toBe(true)
  })

  it('fails on duplicate place ids', () => {
    const content = validContent()
    content.places.push({ ...content.places[0] })
    const errors = validateContent(content)
    expect(errors.some((error) => error.includes('duplicate id "place-tokyo"'))).toBe(true)
  })

  it('fails on an id that breaks the naming convention', () => {
    const content = validContent()
    content.places[0].id = 'Tokyo'
    const errors = validateContent(content)
    expect(errors.some((error) => error.includes('naming convention'))).toBe(true)
  })

  it('fails on a latitude outside [-90, 90]', () => {
    const content = validContent()
    content.places[0].latitude = 95
    const errors = validateContent(content)
    expect(errors.some((error) => error.includes('latitude 95'))).toBe(true)
  })

  it('fails on a longitude outside [-180, 180]', () => {
    const content = validContent()
    content.places[0].longitude = -181
    const errors = validateContent(content)
    expect(errors.some((error) => error.includes('longitude -181'))).toBe(true)
  })

  it('fails on a bad place status', () => {
    const content = validContent()
    content.places[0].status = 'been-there'
    const errors = validateContent(content)
    expect(errors.some((error) => error.includes('status "been-there"'))).toBe(true)
  })

  it('fails on a dangling visit.placeId', () => {
    const content = validContent()
    content.visits[0].placeId = 'place-nowhere'
    const errors = validateContent(content)
    expect(errors.some((error) => error.includes('placeId "place-nowhere"'))).toBe(true)
  })

  it('fails on a dangling memory.visitId', () => {
    const content = validContent()
    content.memories[0].visitId = 'visit-nowhere'
    const errors = validateContent(content)
    expect(errors.some((error) => error.includes('visitId "visit-nowhere"'))).toBe(true)
  })

  it('fails on a dangling memory.mediaIds entry', () => {
    const content = validContent()
    content.memories[0].mediaIds = ['media-missing']
    const errors = validateContent(content)
    expect(errors.some((error) => error.includes('mediaIds entry "media-missing"'))).toBe(true)
  })

  it('fails on a dangling place.coverMediaId', () => {
    const content = validContent()
    content.places[0].coverMediaId = 'media-missing'
    const errors = validateContent(content)
    expect(errors.some((error) => error.includes('coverMediaId "media-missing"'))).toBe(true)
  })

  it('accepts place.coverMediaId that references an existing media record', () => {
    const content = validContent()
    content.places[0].coverMediaId = 'media-tokyo-shibuya-photo'
    expect(validateContent(content)).toEqual([])
  })

  it('fails on a dangling media.placeId', () => {
    const content = validContent()
    content.media[0].placeId = 'place-nowhere'
    const errors = validateContent(content)
    expect(errors.some((error) => error.includes('placeId "place-nowhere"'))).toBe(true)
  })

  it('fails when a visit endDate is earlier than its startDate', () => {
    const content = validContent()
    content.visits[0].endDate = '2023-09-30'
    const errors = validateContent(content)
    expect(errors.some((error) => error.includes('earlier than startDate'))).toBe(true)
  })

  it('fails on a malformed visit date', () => {
    const content = validContent()
    content.visits[0].startDate = '10/02/2023'
    const errors = validateContent(content)
    expect(errors.some((error) => error.includes('must be YYYY-MM-DD or YYYY-MM'))).toBe(true)
  })

  it('fails when a place belongs to another world', () => {
    const content = validContent()
    content.places[0].worldId = 'world-other'
    const errors = validateContent(content)
    expect(errors.some((error) => error.includes('does not match world id'))).toBe(true)
  })

  it('accepts a planned visit with future dates', () => {
    const content = validContent()
    content.visits.push({
      id: 'visit-tokyo-2026-12',
      placeId: 'place-tokyo',
      status: 'planned',
      startDate: '2026-12-20',
      endDate: '2026-12-27',
      ...TIMESTAMPS,
    })
    expect(validateContent(content)).toEqual([])
  })

  it('fails on a bad visit status', () => {
    const content = validContent()
    content.visits[0].status = 'cancelled'
    const errors = validateContent(content)
    expect(errors.some((error) => error.includes('status "cancelled"'))).toBe(true)
  })

  it('accepts a wishlist reason on a place', () => {
    const content = validContent()
    content.places[0].wishlistReason = '想去看樱花。'
    expect(validateContent(content)).toEqual([])
  })

  it('fails on an empty wishlist reason', () => {
    const content = validContent()
    content.places[0].wishlistReason = ''
    const errors = validateContent(content)
    expect(errors.some((error) => error.includes('wishlistReason'))).toBe(true)
  })
})

// Media service tests: derivative fallbacks and base-path prefixing
// (Milestone 6 — GitHub Pages project sites serve from a sub-path).

import { describe, expect, it } from 'vitest'
import type { Media } from '../domain/types'
import { mediaService } from './mediaService'

const media = (overrides: Partial<Media>): Media => ({
  id: 'media-test',
  type: 'image',
  src: '/media/content/place/photo.jpg',
  createdAt: '2026-01-01',
  ...overrides,
})

describe('mediaService', () => {
  it('prefers preview for viewing and thumbnail for grids', () => {
    const item = media({
      thumbnailSrc: '/media/content/place/photo.thumb.webp',
      previewSrc: '/media/content/place/photo.preview.webp',
    })
    // import.meta.env.BASE_URL is '/' under vitest — root stays unchanged.
    expect(mediaService.getUrl(item)).toBe('/media/content/place/photo.preview.webp')
    expect(mediaService.getThumbnailUrl(item)).toBe('/media/content/place/photo.thumb.webp')
    expect(mediaService.getOriginalUrl(item)).toBe('/media/content/place/photo.jpg')
  })

  it('falls back to src when derivatives are missing', () => {
    const item = media({})
    expect(mediaService.getUrl(item)).toBe('/media/content/place/photo.jpg')
    expect(mediaService.getThumbnailUrl(item)).toBe('/media/content/place/photo.jpg')
  })

  it('falls back to preview for thumbnails when no thumbnail exists', () => {
    const item = media({ previewSrc: '/media/content/place/photo.preview.webp' })
    expect(mediaService.getThumbnailUrl(item)).toBe('/media/content/place/photo.preview.webp')
  })

  it('leaves relative URLs untouched', () => {
    const item = media({ src: 'media/content/place/photo.jpg' })
    expect(mediaService.getUrl(item)).toBe('media/content/place/photo.jpg')
  })
})

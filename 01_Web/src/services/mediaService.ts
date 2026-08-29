// Media service (ARCHITECTURE.md §6): the single place that decides which
// published URL a component renders. V1 serves static generated derivatives;
// V2 can swap in cloud storage without touching presentation components.

import type { Media } from '../domain/types'

// Content and catalog records store root-absolute paths ("/media/...").
// Under a GitHub Pages project site the app is served from a sub-path
// (import.meta.env.BASE_URL, e.g. "/our-world/"), so every published URL is
// prefixed here — the single place that decides what a component renders.
const withBase = (url: string): string => {
  if (!url.startsWith('/')) return url
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return `${base}${url}`
}

export interface MediaService {
  /** Best URL for large viewing (optimized preview derivative). */
  getUrl(media: Media): string
  /** Small derivative for thumbnails, cards and filmstrips. */
  getThumbnailUrl(media: Media): string
  /** Untouched published original (explicit full-size viewing only). */
  getOriginalUrl(media: Media): string
}

export const localMediaService: MediaService = {
  getUrl: (media) => withBase(media.previewSrc ?? media.src),
  getThumbnailUrl: (media) => withBase(media.thumbnailSrc ?? media.previewSrc ?? media.src),
  getOriginalUrl: (media) => withBase(media.src),
}

export const mediaService: MediaService = localMediaService

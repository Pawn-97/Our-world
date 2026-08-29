// Media service (ARCHITECTURE.md §6): the single place that decides which
// published URL a component renders. V1 serves static generated derivatives;
// V2 can swap in cloud storage without touching presentation components.

import type { Media } from '../domain/types'

export interface MediaService {
  /** Best URL for large viewing (optimized preview derivative). */
  getUrl(media: Media): string
  /** Small derivative for thumbnails, cards and filmstrips. */
  getThumbnailUrl(media: Media): string
  /** Untouched published original (explicit full-size viewing only). */
  getOriginalUrl(media: Media): string
}

export const localMediaService: MediaService = {
  getUrl: (media) => media.previewSrc ?? media.src,
  getThumbnailUrl: (media) => media.thumbnailSrc ?? media.previewSrc ?? media.src,
  getOriginalUrl: (media) => media.src,
}

export const mediaService: MediaService = localMediaService

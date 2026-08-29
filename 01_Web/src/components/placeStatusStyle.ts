import type { CSSProperties } from 'react'
import type { PlaceStatus } from '../domain/types'

// Small status dots for lists/previews, mirroring the globe marker language:
// visited = solid accent dot, planned = hollow accent ring, wishlist = muted dot.
export const statusDotStyle = (status: PlaceStatus, accent = '#38bdf8'): CSSProperties => {
  if (status === 'planned') {
    return {
      backgroundColor: 'transparent',
      border: `2px solid ${accent}`,
    }
  }
  if (status === 'wishlist') {
    return {
      backgroundColor: 'rgba(148, 163, 184, 0.55)',
      border: '1px solid rgba(255, 255, 255, 0.5)',
    }
  }
  return {
    backgroundColor: accent,
    border: '1px solid rgba(255, 255, 255, 0.9)',
  }
}

// Visual tuning for the immersive globe pass (UX-3/4): pure functions so the
// atmosphere/bloom/marker choices are unit-testable without a WebGL context.
// CesiumAtlasGlobe applies them in configureViewer and the marker layer.

import type { GlobeQualityMode } from '../globeQuality'

export type BloomSettings = {
  enabled: boolean
  contrast: number
  brightness: number
  delta: number
  sigma: number
  stepSize: number
}

// Restrained bloom: just enough to let the atmosphere limb and marker halos
// glow against pure-black space. Field testing showed the previous values
// (contrast 116 / brightness -0.12) blew out bright landmasses (e.g. the
// Tibetan plateau read as white), so the high-quality pass now keeps Cesium's
// stock contrast and only trims the glow threshold. Reduced quality (mobile /
// coarse pointer) disables bloom entirely — the post-process stage is the
// first thing to go when the GPU budget is tight.
export const bloomSettingsForQuality = (qualityMode: GlobeQualityMode): BloomSettings => {
  if (qualityMode === 'reduced') {
    return { enabled: false, contrast: 128, brightness: -0.3, delta: 1, sigma: 2, stepSize: 1 }
  }
  return { enabled: true, contrast: 104, brightness: -0.3, delta: 1, sigma: 2, stepSize: 1 }
}

// Soft halo diameter behind a place marker (the point primitive stays the
// crisp core). Selected markers get a larger halo; the breathing animation
// itself is a Cesium CallbackProperty in the globe component.
export const markerHaloSizeFor = (corePixelSize: number, isSelected: boolean): number => {
  const base = corePixelSize * 3.2
  return Math.round(isSelected ? base * 1.25 : base)
}

// Breathing amplitude/period for the selected marker's halo. Reduced quality
// keeps the halo static (no per-frame property evaluation).
export const markerBreathing = { amplitude: 0.12, periodMs: 1040 } as const

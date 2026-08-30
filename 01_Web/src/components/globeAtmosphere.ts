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

export type AtmosphereShift = {
  saturationShift: number
  brightnessShift: number
}

// Restrained bloom: just enough to let the atmosphere limb and marker halos
// glow against pure-black space. Reduced quality (mobile / coarse pointer)
// disables it entirely — the post-process stage is the first thing to go
// when the GPU budget is tight.
export const bloomSettingsForQuality = (qualityMode: GlobeQualityMode): BloomSettings => {
  if (qualityMode === 'reduced') {
    return { enabled: false, contrast: 128, brightness: -0.3, delta: 1, sigma: 2, stepSize: 1 }
  }
  return { enabled: true, contrast: 116, brightness: -0.12, delta: 0.9, sigma: 1.8, stepSize: 1 }
}

// Slight blue-saturation push so the atmosphere reads as a clean blue glow
// rather than a grey haze. Kept identical across quality modes: uniform
// shifts are cheap compared to the bloom stage.
export const atmosphereShiftForQuality = (qualityMode: GlobeQualityMode): AtmosphereShift => {
  void qualityMode // deliberate: identical shift in both modes (see comment)
  return {
    saturationShift: 0.12,
    brightnessShift: 0.02,
  }
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

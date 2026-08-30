// Tests for the pure visual-tuning functions behind the immersive globe
// pass (UX-3/4): bloom restraint + mobile degradation, atmosphere shift,
// and marker halo sizing.

import { describe, expect, it } from 'vitest'
import {
  atmosphereShiftForQuality,
  bloomSettingsForQuality,
  markerBreathing,
  markerHaloSizeFor,
} from './globeAtmosphere'

describe('bloomSettingsForQuality', () => {
  it('enables a restrained bloom in high quality mode', () => {
    const settings = bloomSettingsForQuality('high')
    expect(settings.enabled).toBe(true)
    // Restraint guardrails: bloom must stay subtle, not a neon wash.
    expect(settings.contrast).toBeLessThan(128)
    expect(settings.brightness).toBeLessThanOrEqual(0)
    expect(settings.stepSize).toBe(1)
  })

  it('disables bloom entirely in reduced quality mode (mobile degradation)', () => {
    expect(bloomSettingsForQuality('reduced').enabled).toBe(false)
  })
})

describe('atmosphereShiftForQuality', () => {
  it('applies a gentle blue saturation push in both quality modes', () => {
    for (const mode of ['high', 'reduced'] as const) {
      const shift = atmosphereShiftForQuality(mode)
      expect(shift.saturationShift).toBeGreaterThan(0)
      expect(shift.saturationShift).toBeLessThan(0.3)
    }
  })
})

describe('markerHaloSizeFor', () => {
  it('scales with the core marker and grows when selected', () => {
    const idle = markerHaloSizeFor(11, false)
    const selected = markerHaloSizeFor(11, true)
    expect(idle).toBeGreaterThan(11)
    expect(selected).toBeGreaterThan(idle)
  })

  it('keeps the breathing amplitude subtle', () => {
    expect(markerBreathing.amplitude).toBeLessThan(0.2)
    expect(markerBreathing.periodMs).toBeGreaterThan(500)
  })
})

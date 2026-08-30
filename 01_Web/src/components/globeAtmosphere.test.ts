// Tests for the pure visual-tuning functions behind the immersive globe
// pass (UX-3/4): bloom restraint + mobile degradation and marker halo
// sizing. The skyAtmosphere saturation/brightness shift was removed after
// field testing showed it pushed oceans into electric blue; the limb now
// keeps Cesium's physical defaults.

import { describe, expect, it } from 'vitest'
import {
  bloomSettingsForQuality,
  markerBreathing,
  markerHaloSizeFor,
} from './globeAtmosphere'

describe('bloomSettingsForQuality', () => {
  it('enables a restrained bloom in high quality mode', () => {
    const settings = bloomSettingsForQuality('high')
    expect(settings.enabled).toBe(true)
    // Restraint guardrails: bloom must stay subtle, not a neon wash, and
    // must not blow out bright landmasses (Tibetan plateau read as white
    // with the previous contrast/brightness pair).
    expect(settings.contrast).toBeLessThanOrEqual(105)
    expect(settings.brightness).toBe(-0.3)
    expect(settings.stepSize).toBe(1)
  })

  it('disables bloom entirely in reduced quality mode (mobile degradation)', () => {
    expect(bloomSettingsForQuality('reduced').enabled).toBe(false)
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

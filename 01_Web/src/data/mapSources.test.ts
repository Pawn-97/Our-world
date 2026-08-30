// Tests for the map-source configuration after the ion removal (UX-2): Esri
// is the tokenless default, the legacy 'cesium' source id is gone, and a
// persisted legacy id falls back to Esri instead of resurrecting ion.

import { describe, expect, it } from 'vitest'
import {
  createMapSourceLayers,
  esriImageryUrlTemplate,
  getInitialMapSource,
  mapSourceOptions,
} from './mapSources'

describe('mapSourceOptions', () => {
  it('offers esri (default), tianditu and local — no cesium/ion source', () => {
    expect(mapSourceOptions.map((option) => option.id)).toEqual(['esri', 'tianditu', 'local'])
  })

  it('esri needs no credential and is always configured', () => {
    const esri = mapSourceOptions.find((option) => option.id === 'esri')
    expect(esri?.configured).toBe(true)
  })
})

describe('esriImageryUrlTemplate', () => {
  it('targets the Esri World Imagery REST endpoint with z/y/x placeholders', () => {
    expect(esriImageryUrlTemplate).toContain('services.arcgisonline.com')
    expect(esriImageryUrlTemplate).toContain('World_Imagery')
    expect(esriImageryUrlTemplate).toContain('{z}/{y}/{x}')
  })
})

describe('getInitialMapSource', () => {
  it('defaults to esri when nothing is stored', () => {
    expect(getInitialMapSource()).toBe('esri')
  })
})

describe('createMapSourceLayers', () => {
  it('builds an esri base layer without any promise or token', () => {
    const layers = createMapSourceLayers('esri')
    expect(layers.base).toBeTruthy()
    expect(layers.labels).toBeUndefined()
  })

  it('falls back to the bundled local imagery for the local source', () => {
    const layers = createMapSourceLayers('local')
    expect(layers.base).toBeTruthy()
  })
})

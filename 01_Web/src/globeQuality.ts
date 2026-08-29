// Globe quality auto-detection (Milestone 1 spike).
// Mobile / coarse-pointer devices get a reduced render load; no UI toggle.
export type GlobeQualityMode = 'high' | 'reduced'

export const detectGlobeQualityMode = (): GlobeQualityMode => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'high'

  const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  const narrowScreen = window.matchMedia('(max-width: 767px)').matches

  return coarsePointer || narrowScreen ? 'reduced' : 'high'
}

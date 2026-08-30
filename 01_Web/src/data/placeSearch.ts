// Debounced, race-safe place search for the editor's search-first add-place
// flow (UX-1). Framework-free on purpose: the React sheet subscribes through
// onState, and vitest covers debounce/race behavior with fake timers. The
// actual network call is injected (`search`) so this module never contains
// endpoint strings — the dev-only client lives in ./geocodeApi.

export type GeocodedPlace = {
  displayName: string
  name: string
  nameEn: string
  country: string
  countryCode?: string
  lat: number
  lon: number
  type: string
  typeLabel: string
}

export type PlaceSearchState =
  | { status: 'idle' }
  | { status: 'loading'; query: string }
  | { status: 'success'; query: string; results: GeocodedPlace[] }
  | { status: 'empty'; query: string }
  | { status: 'error'; query: string; message: string }

export const PLACE_SEARCH_MIN_QUERY = 2
export const PLACE_SEARCH_DEBOUNCE_MS = 400

type CreatePlaceSearchOptions = {
  search: (query: string) => Promise<GeocodedPlace[]>
  onState: (state: PlaceSearchState) => void
  debounceMs?: number
  minQueryLength?: number
}

export type PlaceSearchController = {
  /** Feed the raw input value; whitespace-only / short input resets to idle. */
  setQuery: (raw: string) => void
  /** Stop listening: pending timers and in-flight results are dropped. */
  dispose: () => void
}

export const createPlaceSearch = ({
  search,
  onState,
  debounceMs = PLACE_SEARCH_DEBOUNCE_MS,
  minQueryLength = PLACE_SEARCH_MIN_QUERY,
}: CreatePlaceSearchOptions): PlaceSearchController => {
  let timer: ReturnType<typeof setTimeout> | undefined
  // Monotonic request id: a response that arrives after a newer query was
  // issued is stale and must not overwrite newer state.
  let requestSeq = 0
  let disposed = false

  const clearPending = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  const run = (query: string) => {
    const seq = ++requestSeq
    onState({ status: 'loading', query })
    search(query).then(
      (results) => {
        if (disposed || seq !== requestSeq) return
        onState(results.length > 0 ? { status: 'success', query, results } : { status: 'empty', query })
      },
      (error: unknown) => {
        if (disposed || seq !== requestSeq) return
        onState({
          status: 'error',
          query,
          message: error instanceof Error ? error.message : '搜索失败，请稍后重试。',
        })
      },
    )
  }

  return {
    setQuery(raw) {
      clearPending()
      const query = raw.trim()
      if (query.length < minQueryLength) {
        // Invalidate any in-flight request so its result can't reappear.
        requestSeq += 1
        onState({ status: 'idle' })
        return
      }
      timer = setTimeout(() => {
        timer = undefined
        run(query)
      }, debounceMs)
    },
    dispose() {
      disposed = true
      clearPending()
    },
  }
}

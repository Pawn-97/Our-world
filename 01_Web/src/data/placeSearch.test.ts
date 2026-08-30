// Tests for the debounced, race-safe place search controller (UX-1). Fake
// timers drive the debounce; controllable promises drive race scenarios.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlaceSearch } from './placeSearch'
import type { GeocodedPlace, PlaceSearchState } from './placeSearch'

const sampleResult: GeocodedPlace = {
  displayName: '京都, 京都府, 日本',
  name: '京都',
  nameEn: 'Kyoto',
  country: '日本',
  countryCode: 'jp',
  lat: 35.0116,
  lon: 135.7681,
  type: 'place/city',
  typeLabel: '城市',
}

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const setup = (search: (query: string) => Promise<GeocodedPlace[]>) => {
  const states: PlaceSearchState[] = []
  const controller = createPlaceSearch({ search, onState: (state) => states.push(state) })
  return { states, controller }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createPlaceSearch', () => {
  it('debounces rapid input into a single search after 400ms', async () => {
    const search = vi.fn(async () => [sampleResult])
    const { states, controller } = setup(search)

    controller.setQuery('K')
    controller.setQuery('Ky')
    controller.setQuery('Kyo')
    await vi.advanceTimersByTimeAsync(399)
    expect(search).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith('Kyo')
    await vi.runAllTimersAsync()
    expect(states.at(-1)).toEqual({ status: 'success', query: 'Kyo', results: [sampleResult] })
    controller.dispose()
  })

  it('ignores queries shorter than 2 characters and resets to idle', async () => {
    const search = vi.fn(async () => [sampleResult])
    const { states, controller } = setup(search)

    controller.setQuery('  K ')
    await vi.runAllTimersAsync()
    expect(search).not.toHaveBeenCalled()
    expect(states.at(-1)).toEqual({ status: 'idle' })
    controller.dispose()
  })

  it('a short follow-up query invalidates an in-flight request', async () => {
    const pending = deferred<GeocodedPlace[]>()
    const search = vi.fn(() => pending.promise)
    const { states, controller } = setup(search)

    controller.setQuery('Kyoto')
    await vi.advanceTimersByTimeAsync(400)
    expect(search).toHaveBeenCalledTimes(1)
    controller.setQuery('K')
    pending.resolve([sampleResult])
    await vi.runAllTimersAsync()
    // The stale success must not overwrite the idle state.
    expect(states.at(-1)).toEqual({ status: 'idle' })
    controller.dispose()
  })

  it('drops stale responses when a newer query wins the race', async () => {
    const first = deferred<GeocodedPlace[]>()
    const second = deferred<GeocodedPlace[]>()
    const search = vi
      .fn<(query: string) => Promise<GeocodedPlace[]>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const { states, controller } = setup(search)

    controller.setQuery('Kyoto')
    await vi.advanceTimersByTimeAsync(400)
    controller.setQuery('Osaka')
    await vi.advanceTimersByTimeAsync(400)
    expect(search).toHaveBeenCalledTimes(2)

    // Newer query resolves first, then the stale older one — the final state
    // must still belong to "Osaka".
    second.resolve([sampleResult])
    await vi.runAllTimersAsync()
    first.resolve([])
    await vi.runAllTimersAsync()

    expect(states.at(-1)).toEqual({ status: 'success', query: 'Osaka', results: [sampleResult] })
    controller.dispose()
  })

  it('reports an empty state when nothing matches', async () => {
    const search = vi.fn(async () => [] as GeocodedPlace[])
    const { states, controller } = setup(search)

    controller.setQuery('Zzz')
    await vi.advanceTimersByTimeAsync(400)
    await vi.runAllTimersAsync()
    expect(states.at(-1)).toEqual({ status: 'empty', query: 'Zzz' })
    controller.dispose()
  })

  it('reports search failures with the server message', async () => {
    const search = vi.fn(async () => {
      throw new Error('地理搜索超时，请检查网络后重试。')
    })
    const { states, controller } = setup(search)

    controller.setQuery('Kyoto')
    await vi.advanceTimersByTimeAsync(400)
    await vi.runAllTimersAsync()
    expect(states.at(-1)).toEqual({
      status: 'error',
      query: 'Kyoto',
      message: '地理搜索超时，请检查网络后重试。',
    })
    controller.dispose()
  })

  it('stops emitting after dispose', async () => {
    const pending = deferred<GeocodedPlace[]>()
    const search = vi.fn(() => pending.promise)
    const { states, controller } = setup(search)

    controller.setQuery('Kyoto')
    await vi.advanceTimersByTimeAsync(400)
    const countBefore = states.length
    controller.dispose()
    pending.resolve([sampleResult])
    await vi.runAllTimersAsync()
    expect(states).toHaveLength(countBefore)
  })
})

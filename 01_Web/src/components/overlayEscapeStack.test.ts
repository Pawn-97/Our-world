// Unit tests for the shared overlay Escape stack (M4 lightbox layering fix).

import { describe, expect, it, vi } from 'vitest'

import { createOverlayEscapeStack } from './overlayEscapeStack'
import type { EscapeEventTarget } from './overlayEscapeStack'

type KeyListener = (event: { key: string }) => void

const createFakeTarget = () => {
  const listeners = new Set<KeyListener>()
  const target: EscapeEventTarget = {
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  }
  return {
    target,
    listenerCount: () => listeners.size,
    press: (key: string) => listeners.forEach((listener) => listener({ key })),
  }
}

describe('overlayEscapeStack', () => {
  it('dispatches Escape only to the topmost layer', () => {
    const { target, press } = createFakeTarget()
    const stack = createOverlayEscapeStack(target)
    const bottom = vi.fn()
    const top = vi.fn()
    stack.register(bottom)
    stack.register(top)

    press('Escape')
    expect(top).toHaveBeenCalledTimes(1)
    expect(bottom).not.toHaveBeenCalled()
  })

  it('falls through to the layer beneath once the top unregisters', () => {
    const { target, press } = createFakeTarget()
    const stack = createOverlayEscapeStack(target)
    const bottom = vi.fn()
    const top = vi.fn()
    stack.register(bottom)
    const unregisterTop = stack.register(top)

    press('Escape')
    unregisterTop()
    press('Escape')
    expect(top).toHaveBeenCalledTimes(1)
    expect(bottom).toHaveBeenCalledTimes(1)
  })

  it('ignores non-Escape keys', () => {
    const { target, press } = createFakeTarget()
    const stack = createOverlayEscapeStack(target)
    const handler = vi.fn()
    stack.register(handler)

    press('ArrowLeft')
    press('Enter')
    expect(handler).not.toHaveBeenCalled()
  })

  it('detaches the global listener when the last layer unregisters', () => {
    const { target, listenerCount } = createFakeTarget()
    const stack = createOverlayEscapeStack(target)
    const unregister = stack.register(() => undefined)
    expect(listenerCount()).toBe(1)
    unregister()
    expect(listenerCount()).toBe(0)
    expect(stack.size()).toBe(0)
  })
})

// A single global Escape dispatcher for stacked overlays.
// Multiple layers (place detail overlay, photo lightbox, …) each used to
// attach their own window keydown listener, so one Escape press closed every
// layer at once. Now layers register here; only the most recently registered
// (topmost) layer's handler runs per keypress. Layers unregister on unmount,
// so closing the lightbox automatically restores the layer beneath it.

type KeyEventLike = { key: string }

export type EscapeEventTarget = {
  addEventListener: (type: 'keydown', listener: (event: KeyEventLike) => void) => void
  removeEventListener: (type: 'keydown', listener: (event: KeyEventLike) => void) => void
}

export type OverlayEscapeStack = {
  /** Push a layer; returns its unregister function. */
  register: (handler: () => void) => () => void
  /** Current layer count (topmost first semantics). */
  size: () => number
}

export const createOverlayEscapeStack = (target: EscapeEventTarget): OverlayEscapeStack => {
  const stack: Array<() => void> = []
  let listening = false

  const dispatch = (event: KeyEventLike) => {
    if (event.key !== 'Escape') return
    const topmost = stack[stack.length - 1]
    if (topmost) topmost()
  }

  const startListening = () => {
    if (listening) return
    target.addEventListener('keydown', dispatch)
    listening = true
  }

  const stopListening = () => {
    if (!listening) return
    target.removeEventListener('keydown', dispatch)
    listening = false
  }

  return {
    register: (handler) => {
      stack.push(handler)
      startListening()
      return () => {
        const index = stack.lastIndexOf(handler)
        if (index >= 0) stack.splice(index, 1)
        if (stack.length === 0) stopListening()
      }
    },
    size: () => stack.length,
  }
}

const noopStack: OverlayEscapeStack = {
  register: () => () => undefined,
  size: () => 0,
}

export const overlayEscapeStack: OverlayEscapeStack =
  typeof window === 'undefined' ? noopStack : createOverlayEscapeStack(window)

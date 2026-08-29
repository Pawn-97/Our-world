// Shared shell for the local editor sheets (Milestone 5): a glass panel that
// is full-screen on mobile and a centered dialog on desktop, with a header,
// scrollable form body, inline error list, and a cancel/save footer. Escape
// handling goes through overlayEscapeStack so stacked layers (lightbox above
// a sheet above the place overlay) dismiss one at a time.

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Loader2, X } from 'lucide-react'
import { overlayEscapeStack } from '../overlayEscapeStack'

type EditorSheetProps = {
  title: string
  description?: string
  /** Validation/server errors shown above the footer. */
  errors: string[]
  busy: boolean
  submitLabel?: string
  onClose: () => void
  /** Form submit handler (already wired to the save button and Enter). */
  onSubmit: () => void
  children: ReactNode
}

export const editorInputClass =
  'w-full rounded-xl border border-white/14 bg-white/[0.06] px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/70 focus:bg-white/[0.09]'

export function EditorField({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-300">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] leading-4 text-slate-500">{hint}</span> : null}
    </label>
  )
}

export function EditorSheet({
  title,
  description,
  errors,
  busy,
  submitLabel = '保存',
  onClose,
  onSubmit,
  children,
}: EditorSheetProps) {
  // Latest-handler refs keep the Escape registration stable across renders.
  const closeRef = useRef(onClose)
  const busyRef = useRef(busy)
  useEffect(() => {
    closeRef.current = onClose
    busyRef.current = busy
  }, [onClose, busy])

  useEffect(() => overlayEscapeStack.register(() => {
    if (!busyRef.current) closeRef.current()
  }), [])

  return (
    <div
      className="fixed inset-0 z-[90] flex items-stretch justify-center sm:items-center sm:p-6"
    >
      <button
        type="button"
        aria-label="关闭编辑器"
        className="absolute inset-0 cursor-default bg-slate-950/60 backdrop-blur-[2px]"
        onClick={onClose}
        disabled={busy}
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[100dvh] w-full max-w-lg flex-col overflow-hidden border border-white/12 bg-[#0b1526] text-slate-100 shadow-2xl sm:max-h-[85vh] sm:rounded-3xl"
        onSubmit={(event) => {
          event.preventDefault()
          if (!busy) onSubmit()
        }}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-white">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-slate-400">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="关闭"
            title="关闭"
            className="grid size-10 shrink-0 place-items-center rounded-full border border-white/16 bg-white/8 text-slate-100 transition hover:bg-white/14 active:scale-95 disabled:opacity-60"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {children}
        </div>

        {errors.length > 0 ? (
          <ul
            role="alert"
            className="max-h-32 shrink-0 space-y-1 overflow-y-auto whitespace-pre-line border-t border-rose-300/20 bg-rose-400/[0.08] px-5 py-3 text-xs leading-5 text-rose-200"
          >
            {errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        ) : null}

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-10 items-center rounded-full border border-white/16 bg-white/8 px-4 text-xs font-semibold text-slate-200 transition hover:bg-white/14 active:scale-95 disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-sky-300/60 bg-sky-400/25 px-4 text-xs font-semibold text-sky-100 transition hover:bg-sky-400/35 active:scale-95 disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {submitLabel}
          </button>
        </footer>
      </form>
    </div>
  )
}

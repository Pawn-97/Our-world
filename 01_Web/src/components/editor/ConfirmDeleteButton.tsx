// Two-step delete button for the local editor (Milestone 5): the first tap
// arms the button ("确认删除？"), the second executes. Arming expires after a
// few seconds so a stray tap never deletes anything. Destructive actions in
// the editor (place/visit/memory) all go through this pattern.

import { useEffect, useRef, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'

const ARM_TIMEOUT_MS = 4_000

type ConfirmDeleteButtonProps = {
  label: string
  confirmLabel?: string
  /** Must not throw — wrap the underlying call and surface errors yourself. */
  onConfirm: () => void | Promise<void>
  disabled?: boolean
  compact?: boolean
}

export function ConfirmDeleteButton({
  label,
  confirmLabel = '确认删除？',
  onConfirm,
  disabled = false,
  compact = false,
}: ConfirmDeleteButtonProps) {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const handleClick = async () => {
    if (busy || disabled) return
    if (!armed) {
      setArmed(true)
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setArmed(false), ARM_TIMEOUT_MS)
      return
    }
    window.clearTimeout(timerRef.current)
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
      setArmed(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={disabled || busy}
      aria-label={armed ? confirmLabel : label}
      title={armed ? confirmLabel : label}
      data-armed={armed}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full border font-semibold transition active:scale-95 disabled:opacity-60 ${
        compact ? 'h-8 px-3 text-[11px]' : 'h-10 px-4 text-xs'
      } ${
        armed
          ? 'border-rose-300/70 bg-rose-400/25 text-rose-100 hover:bg-rose-400/35'
          : 'border-white/16 bg-white/8 text-slate-300 hover:bg-white/14'
      }`}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
      {armed ? confirmLabel : label}
    </button>
  )
}

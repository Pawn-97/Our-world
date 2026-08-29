// Visit create/edit sheet (Milestone 5, local editor). Same write path as the
// place sheet: client-side draft validation first, then a dynamic-imported
// dev-only middleware call guarded by import.meta.env.DEV.

import { useState } from 'react'
import { validateVisitDraft } from '../../domain/editorValidation'
import type { VisitDraft } from '../../domain/editorValidation'
import { visitStatusLabels } from '../../domain/types'
import type { PlaceId, Visit, VisitStatus } from '../../domain/types'
import { EditorField, EditorSheet, editorInputClass } from './EditorSheet'

type VisitEditorSheetProps = {
  placeId: PlaceId
  existing?: Visit
  onClose: () => void
  onSaved: () => Promise<void>
}

const emptyDraft: VisitDraft = {
  title: '',
  status: 'completed',
  startDate: '',
  endDate: '',
  summary: '',
}

const draftFromVisit = (visit: Visit): VisitDraft => ({
  id: visit.id,
  title: visit.title ?? '',
  status: visit.status ?? 'completed',
  startDate: visit.startDate ?? '',
  endDate: visit.endDate ?? '',
  summary: visit.summary ?? '',
})

const optional = (value: string) => {
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

export function VisitEditorSheet({ placeId, existing, onClose, onSaved }: VisitEditorSheetProps) {
  const [draft, setDraft] = useState<VisitDraft>(() => (existing ? draftFromVisit(existing) : emptyDraft))
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [serverErrors, setServerErrors] = useState<string[]>([])

  const clientErrors = validateVisitDraft(draft)
  const errors = [...(attempted ? clientErrors : []), ...serverErrors]

  const update = <K extends keyof VisitDraft>(key: K, value: VisitDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const submit = async () => {
    setAttempted(true)
    setServerErrors([])
    if (clientErrors.length > 0) return
    if (!import.meta.env.DEV) return

    const record: Record<string, unknown> = {
      ...(existing ? { id: existing.id, createdAt: existing.createdAt } : {}),
      placeId,
      // 'completed' is the implicit default in the content model; omit it.
      status: draft.status === 'planned' ? 'planned' : undefined,
      title: optional(draft.title),
      startDate: optional(draft.startDate),
      endDate: optional(draft.endDate),
      summary: optional(draft.summary),
    }

    setBusy(true)
    try {
      const { saveLocalContentEntity } = await import('../../data/localContentEditorApi')
      await saveLocalContentEntity('visits', record)
      await onSaved()
      onClose()
    } catch (error) {
      setServerErrors([error instanceof Error ? error.message : '保存失败。'])
    } finally {
      setBusy(false)
    }
  }

  return (
    <EditorSheet
      title={existing ? '编辑到访' : '新增到访'}
      description="仅保存在本机 content/visits.json，生产站点不受影响。"
      errors={errors}
      busy={busy}
      onClose={onClose}
      onSubmit={() => void submit()}
    >
      <EditorField label="标题" hint="留空时按日期显示。">
        <input
          className={editorInputClass}
          value={draft.title}
          onChange={(event) => update('title', event.currentTarget.value)}
          placeholder="樱花季之行"
        />
      </EditorField>

      <EditorField label="状态">
        <div className="flex flex-wrap gap-2" role="group" aria-label="到访状态">
          {(Object.keys(visitStatusLabels) as VisitStatus[]).map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={draft.status === status}
              onClick={() => update('status', status)}
              className={`h-9 rounded-full border px-4 text-xs font-semibold transition ${
                draft.status === status
                  ? 'border-sky-300/80 bg-sky-400/20 text-sky-100'
                  : 'border-white/14 bg-white/[0.06] text-slate-300 hover:bg-white/12'
              }`}
            >
              {visitStatusLabels[status]}
            </button>
          ))}
        </div>
      </EditorField>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <EditorField label="开始日期" hint="YYYY-MM-DD 或 YYYY-MM。">
          <input
            className={editorInputClass}
            value={draft.startDate}
            onChange={(event) => update('startDate', event.currentTarget.value)}
            placeholder="2024-04-01"
            inputMode="numeric"
          />
        </EditorField>
        <EditorField label="结束日期" hint="不早于开始日期。">
          <input
            className={editorInputClass}
            value={draft.endDate}
            onChange={(event) => update('endDate', event.currentTarget.value)}
            placeholder="2024-04-07"
            inputMode="numeric"
          />
        </EditorField>
      </div>

      <EditorField label="简介">
        <textarea
          className={`${editorInputClass} min-h-20 resize-y`}
          value={draft.summary}
          onChange={(event) => update('summary', event.currentTarget.value)}
          placeholder="这次到访的一句话记录。"
        />
      </EditorField>
    </EditorSheet>
  )
}

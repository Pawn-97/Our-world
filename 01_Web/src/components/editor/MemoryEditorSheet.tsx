// Memory create/edit sheet (Milestone 5, local editor). Photo memories pick
// their media from the place's existing media list (multi-select thumbnails);
// use the「添加照片」flow first when the needed asset is not imported yet.

import { useState } from 'react'
import { validateMemoryDraft } from '../../domain/editorValidation'
import type { MemoryDraft } from '../../domain/editorValidation'
import { memoryTypeLabels } from '../../domain/types'
import type { Media, MediaId, Memory, MemoryType, PlaceId, VisitId } from '../../domain/types'
import { mediaService } from '../../services/mediaService'
import { EditorField, EditorSheet, editorInputClass } from './EditorSheet'

type MemoryEditorSheetProps = {
  visitId: VisitId
  /** Owning place — used for id generation and the media picker list. */
  placeId: PlaceId
  /** Media available to attach (the place's media list). */
  media: Media[]
  existing?: Memory
  onClose: () => void
  onSaved: () => Promise<void>
}

const draftFromMemory = (memory: Memory): MemoryDraft => ({
  id: memory.id,
  type: memory.type,
  title: memory.title ?? '',
  body: memory.body ?? '',
  date: memory.date ?? '',
  time: memory.time ?? '',
  locationName: memory.locationName ?? '',
  mediaIds: [...memory.mediaIds],
})

const optional = (value: string) => {
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

export function MemoryEditorSheet({
  visitId,
  placeId,
  media,
  existing,
  onClose,
  onSaved,
}: MemoryEditorSheetProps) {
  const [draft, setDraft] = useState<MemoryDraft>(() => existing
    ? draftFromMemory(existing)
    : { type: 'note', title: '', body: '', date: '', time: '', locationName: '', mediaIds: [] })
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [serverErrors, setServerErrors] = useState<string[]>([])

  const clientErrors = validateMemoryDraft(draft)
  const errors = [...(attempted ? clientErrors : []), ...serverErrors]

  const update = <K extends keyof MemoryDraft>(key: K, value: MemoryDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const toggleMedia = (mediaId: MediaId) => {
    setDraft((current) => ({
      ...current,
      mediaIds: current.mediaIds.includes(mediaId)
        ? current.mediaIds.filter((id) => id !== mediaId)
        : [...current.mediaIds, mediaId],
    }))
  }

  const submit = async () => {
    setAttempted(true)
    setServerErrors([])
    if (clientErrors.length > 0) return
    if (!import.meta.env.DEV) return

    const record: Record<string, unknown> = {
      ...(existing ? { id: existing.id, createdAt: existing.createdAt } : {}),
      visitId,
      type: draft.type,
      title: draft.title.trim(),
      body: optional(draft.body),
      date: optional(draft.date),
      time: optional(draft.time),
      locationName: optional(draft.locationName),
      mediaIds: draft.mediaIds,
    }

    setBusy(true)
    try {
      const { saveLocalContentEntity } = await import('../../data/localContentEditorApi')
      await saveLocalContentEntity('memories', record, placeId)
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
      title={existing ? '编辑记忆' : '新增记忆'}
      description="仅保存在本机 content/memories.json，生产站点不受影响。"
      errors={errors}
      busy={busy}
      onClose={onClose}
      onSubmit={() => void submit()}
    >
      <EditorField label="类型">
        <div className="flex flex-wrap gap-2" role="group" aria-label="记忆类型">
          {(Object.keys(memoryTypeLabels) as MemoryType[]).map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={draft.type === type}
              onClick={() => update('type', type)}
              className={`h-9 rounded-full border px-4 text-xs font-semibold transition ${
                draft.type === type
                  ? 'border-sky-300/80 bg-sky-400/20 text-sky-100'
                  : 'border-white/14 bg-white/[0.06] text-slate-300 hover:bg-white/12'
              }`}
            >
              {memoryTypeLabels[type]}
            </button>
          ))}
        </div>
      </EditorField>

      <EditorField label="标题 *">
        <input
          className={editorInputClass}
          value={draft.title}
          onChange={(event) => update('title', event.currentTarget.value)}
          placeholder="抵达京都站"
        />
      </EditorField>

      <EditorField label="正文">
        <textarea
          className={`${editorInputClass} min-h-24 resize-y`}
          value={draft.body}
          onChange={(event) => update('body', event.currentTarget.value)}
          placeholder="这一段记忆的内容。"
        />
      </EditorField>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <EditorField label="日期" hint="YYYY-MM-DD 或 YYYY-MM。">
          <input
            className={editorInputClass}
            value={draft.date}
            onChange={(event) => update('date', event.currentTarget.value)}
            placeholder="2024-04-02"
            inputMode="numeric"
          />
        </EditorField>
        <EditorField label="时间" hint="HH:MM（24 小时制）。">
          <input
            className={editorInputClass}
            value={draft.time}
            onChange={(event) => update('time', event.currentTarget.value)}
            placeholder="14:30"
            inputMode="numeric"
          />
        </EditorField>
      </div>

      <EditorField label="地点标注" hint="简短的人类可读地名，如「目黑川」。">
        <input
          className={editorInputClass}
          value={draft.locationName}
          onChange={(event) => update('locationName', event.currentTarget.value)}
          placeholder="清水寺"
        />
      </EditorField>

      <EditorField
        label="关联媒体"
        hint={draft.type === 'photo' ? '照片记忆至少选择一项。' : '可选；从该地点的媒体中选择。'}
      >
        {media.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/14 px-3 py-4 text-xs leading-5 text-slate-500">
            该地点暂无媒体。可先用「添加照片」从本机导入，再来关联。
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-2" role="group" aria-label="选择关联媒体">
            {media.map((item) => {
              const isSelected = draft.mediaIds.includes(item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`关联媒体 ${item.alt ?? item.id}`}
                  onClick={() => toggleMedia(item.id)}
                  className={`overflow-hidden rounded-xl border transition ${
                    isSelected
                      ? 'border-sky-300/90 ring-2 ring-sky-300/40'
                      : 'border-white/10 opacity-70 hover:opacity-100'
                  }`}
                >
                  <img
                    src={mediaService.getThumbnailUrl(item)}
                    alt={item.alt ?? ''}
                    className="aspect-square w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                </button>
              )
            })}
          </div>
        )}
      </EditorField>
    </EditorSheet>
  )
}

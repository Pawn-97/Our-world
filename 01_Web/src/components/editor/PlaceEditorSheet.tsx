// Place create/edit sheet (Milestone 5, local editor). Validates the draft
// instantly with domain/editorValidation, then saves through the dev-only
// middleware via a DYNAMIC import inside an import.meta.env.DEV guard — the
// production bundle must not contain any editor endpoint strings.

import { useState } from 'react'
import { validatePlaceDraft } from '../../domain/editorValidation'
import type { PlaceDraft } from '../../domain/editorValidation'
import { placeStatusLabels } from '../../domain/types'
import type { Place, PlaceStatus, WorldId } from '../../domain/types'
import { EditorField, EditorSheet, editorInputClass } from './EditorSheet'

type PlaceEditorSheetProps = {
  worldId: WorldId
  /** Present when editing; absent when creating a new place. */
  existing?: Place
  onClose: () => void
  /** Called after a successful save so the app can refresh content. */
  onSaved: () => Promise<void>
}

const emptyDraft: PlaceDraft = {
  name: '',
  nameEn: '',
  country: '',
  countryEn: '',
  countryCode: '',
  region: '',
  latitude: '',
  longitude: '',
  status: 'wishlist',
  summary: '',
  wishlistReason: '',
}

const draftFromPlace = (place: Place): PlaceDraft => ({
  id: place.id,
  name: place.name,
  nameEn: place.nameEn ?? '',
  country: place.country,
  countryEn: place.countryEn ?? '',
  countryCode: place.countryCode ?? '',
  region: place.region ?? '',
  latitude: String(place.latitude),
  longitude: String(place.longitude),
  status: place.status,
  summary: place.summary ?? '',
  wishlistReason: place.wishlistReason ?? '',
})

const optional = (value: string) => {
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

export function PlaceEditorSheet({ worldId, existing, onClose, onSaved }: PlaceEditorSheetProps) {
  const [draft, setDraft] = useState<PlaceDraft>(() => (existing ? draftFromPlace(existing) : emptyDraft))
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [serverErrors, setServerErrors] = useState<string[]>([])

  const clientErrors = validatePlaceDraft(draft)
  const errors = [...(attempted ? clientErrors : []), ...serverErrors]

  const update = <K extends keyof PlaceDraft>(key: K, value: PlaceDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const submit = async () => {
    setAttempted(true)
    setServerErrors([])
    if (clientErrors.length > 0) return
    if (!import.meta.env.DEV) return

    const record: Record<string, unknown> = {
      ...(existing ? { id: existing.id, createdAt: existing.createdAt } : {}),
      worldId,
      name: draft.name.trim(),
      country: draft.country.trim(),
      latitude: Number(draft.latitude),
      longitude: Number(draft.longitude),
      status: draft.status,
      nameEn: optional(draft.nameEn),
      countryEn: optional(draft.countryEn),
      countryCode: optional(draft.countryCode),
      region: optional(draft.region),
      summary: optional(draft.summary),
      wishlistReason: optional(draft.wishlistReason),
    }

    setBusy(true)
    try {
      const { saveLocalContentEntity } = await import('../../data/localContentEditorApi')
      await saveLocalContentEntity('places', record)
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
      title={existing ? `编辑地点 · ${existing.name}` : '新增地点'}
      description="仅保存在本机 content/places.json，生产站点不受影响。"
      errors={errors}
      busy={busy}
      onClose={onClose}
      onSubmit={() => void submit()}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <EditorField label="名称 *">
          <input
            className={editorInputClass}
            value={draft.name}
            onChange={(event) => update('name', event.currentTarget.value)}
            placeholder="京都"
          />
        </EditorField>
        <EditorField label="英文名" hint="拉丁字母名，用于生成稳定 id。">
          <input
            className={editorInputClass}
            value={draft.nameEn}
            onChange={(event) => update('nameEn', event.currentTarget.value)}
            placeholder="Kyoto"
          />
        </EditorField>
        <EditorField label="国家/地区 *">
          <input
            className={editorInputClass}
            value={draft.country}
            onChange={(event) => update('country', event.currentTarget.value)}
            placeholder="日本"
          />
        </EditorField>
        <EditorField label="国家英文名">
          <input
            className={editorInputClass}
            value={draft.countryEn}
            onChange={(event) => update('countryEn', event.currentTarget.value)}
            placeholder="Japan"
          />
        </EditorField>
        <EditorField label="国家代码" hint="ISO 3166-1 两位小写字母，如 jp。">
          <input
            className={editorInputClass}
            value={draft.countryCode}
            onChange={(event) => update('countryCode', event.currentTarget.value)}
            placeholder="jp"
            maxLength={2}
          />
        </EditorField>
        <EditorField label="区域" hint="自由文本，如 East Asia。">
          <input
            className={editorInputClass}
            value={draft.region}
            onChange={(event) => update('region', event.currentTarget.value)}
            placeholder="East Asia"
          />
        </EditorField>
        <EditorField label="纬度 *" hint="-90 到 90。">
          <input
            className={editorInputClass}
            value={draft.latitude}
            onChange={(event) => update('latitude', event.currentTarget.value)}
            placeholder="35.0116"
            inputMode="decimal"
          />
        </EditorField>
        <EditorField label="经度 *" hint="-180 到 180。">
          <input
            className={editorInputClass}
            value={draft.longitude}
            onChange={(event) => update('longitude', event.currentTarget.value)}
            placeholder="135.7681"
            inputMode="decimal"
          />
        </EditorField>
      </div>

      <EditorField label="状态">
        <div className="flex flex-wrap gap-2" role="group" aria-label="地点状态">
          {(Object.keys(placeStatusLabels) as PlaceStatus[]).map((status) => (
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
              {placeStatusLabels[status]}
            </button>
          ))}
        </div>
      </EditorField>

      <EditorField label="简介">
        <textarea
          className={`${editorInputClass} min-h-20 resize-y`}
          value={draft.summary}
          onChange={(event) => update('summary', event.currentTarget.value)}
          placeholder="这个地点的一句话介绍。"
        />
      </EditorField>

      {draft.status === 'wishlist' ? (
        <EditorField label="想去理由">
          <textarea
            className={`${editorInputClass} min-h-20 resize-y`}
            value={draft.wishlistReason}
            onChange={(event) => update('wishlistReason', event.currentTarget.value)}
            placeholder="为什么想去这里？"
          />
        </EditorField>
      ) : null}
    </EditorSheet>
  )
}

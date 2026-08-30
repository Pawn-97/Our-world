// Place create/edit sheet (Milestone 5, local editor; UX-1 search-first
// create flow). Create mode now leads with a Nominatim-backed search: pick a
// result and name/country/coordinates auto-fill, then choose a status and
// optionally write a summary. The original full form stays available behind
// a "高级 / 手动填写" fold for places geocoding can't find. The geocode
// client is loaded through a DYNAMIC import inside an import.meta.env.DEV
// guard — the production bundle must not contain any editor endpoint
// strings (verified by scripts/check-dist.mjs).

import { useEffect, useRef, useState } from 'react'
import { Loader2, MapPin, Search } from 'lucide-react'
import { validatePlaceDraft } from '../../domain/editorValidation'
import type { PlaceDraft } from '../../domain/editorValidation'
import { placeStatusLabels } from '../../domain/types'
import type { Place, PlaceStatus, WorldId } from '../../domain/types'
import { createPlaceSearch } from '../../data/placeSearch'
import type { GeocodedPlace, PlaceSearchController, PlaceSearchState } from '../../data/placeSearch'
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

const statusChipClass = (active: boolean) =>
  `h-11 rounded-full border px-5 text-xs font-semibold transition sm:h-9 sm:px-4 ${
    active
      ? 'border-sky-300/80 bg-sky-400/20 text-sky-100'
      : 'border-white/14 bg-white/[0.06] text-slate-300 hover:bg-white/12'
  }`

export function PlaceEditorSheet({ worldId, existing, onClose, onSaved }: PlaceEditorSheetProps) {
  const [draft, setDraft] = useState<PlaceDraft>(() => (existing ? draftFromPlace(existing) : emptyDraft))
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [serverErrors, setServerErrors] = useState<string[]>([])

  // Search-first create flow state (unused when editing an existing place).
  const [manualMode, setManualMode] = useState(false)
  const [query, setQuery] = useState('')
  const [searchState, setSearchState] = useState<PlaceSearchState>({ status: 'idle' })
  const [selected, setSelected] = useState<GeocodedPlace | undefined>()
  const [statusChosen, setStatusChosen] = useState(false)
  const searchControllerRef = useRef<PlaceSearchController | undefined>(undefined)

  const searchMode = !existing && !manualMode

  useEffect(() => {
    if (existing || !import.meta.env.DEV) return undefined
    const controller = createPlaceSearch({
      search: (searchQuery) =>
        import('../../data/geocodeApi').then((module) => module.searchGeocodePlaces(searchQuery)),
      onState: setSearchState,
    })
    searchControllerRef.current = controller
    return () => controller.dispose()
  }, [existing])

  const clientErrors = validatePlaceDraft(draft)
  // In search mode the hidden form fields are filled by picking a result, so
  // surface flow-level guidance instead of raw field errors.
  const flowErrors = attempted && searchMode
    ? [
        ...(selected ? [] : ['请先搜索并选择一个地点。']),
        ...(statusChosen ? [] : ['请选择地点状态：已去过、计划去或想去。']),
      ]
    : []
  const errors = [
    ...(searchMode ? flowErrors : attempted ? clientErrors : []),
    ...serverErrors,
  ]

  const update = <K extends keyof PlaceDraft>(key: K, value: PlaceDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const onQueryChange = (value: string) => {
    setQuery(value)
    setSelected(undefined)
    searchControllerRef.current?.setQuery(value)
  }

  const selectResult = (result: GeocodedPlace) => {
    setSelected(result)
    setDraft((current) => ({
      ...current,
      name: result.name,
      nameEn: result.nameEn,
      country: result.country,
      countryCode: result.countryCode ?? '',
      latitude: String(result.lat),
      longitude: String(result.lon),
    }))
  }

  const submit = async () => {
    setAttempted(true)
    setServerErrors([])
    if (searchMode && (!selected || !statusChosen)) return
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

  const statusChips = (
    <div className="flex flex-wrap gap-2" role="group" aria-label="地点状态">
      {(Object.keys(placeStatusLabels) as PlaceStatus[]).map((status) => {
        const active = searchMode ? statusChosen && draft.status === status : draft.status === status
        return (
          <button
            key={status}
            type="button"
            aria-pressed={active}
            onClick={() => {
              setStatusChosen(true)
              update('status', status)
            }}
            className={statusChipClass(active)}
          >
            {placeStatusLabels[status]}
          </button>
        )
      })}
    </div>
  )

  return (
    <EditorSheet
      title={existing ? `编辑地点 · ${existing.name}` : '新增地点'}
      description="仅保存在本机 content/places.json，生产站点不受影响。"
      errors={errors}
      busy={busy}
      onClose={onClose}
      onSubmit={() => void submit()}
    >
      {searchMode ? (
        <>
          <EditorField label="搜索地点 *" hint="输入城市或地点名（如 Kyoto、仙本那），至少 2 个字符后自动搜索。">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <input
                className={`${editorInputClass} pl-9`}
                value={query}
                onChange={(event) => onQueryChange(event.currentTarget.value)}
                placeholder="Kyoto / 仙本那"
                autoFocus
              />
            </div>
          </EditorField>

          {searchState.status === 'loading' ? (
            <p className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="size-3.5 animate-spin" />
              正在搜索「{searchState.query}」…
            </p>
          ) : null}
          {searchState.status === 'empty' ? (
            <p className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs leading-5 text-slate-400">
              没有找到「{searchState.query}」的匹配地点，换个关键词试试；也可以在下方手动填写。
            </p>
          ) : null}
          {searchState.status === 'error' ? (
            <p role="alert" className="rounded-xl border border-rose-300/20 bg-rose-400/[0.08] px-4 py-3 text-xs leading-5 text-rose-200">
              {searchState.message}
            </p>
          ) : null}

          {!selected && searchState.status === 'success' ? (
            <ul className="divide-y divide-white/8 overflow-hidden rounded-2xl border border-white/12 bg-white/[0.04]">
              {searchState.results.map((result) => (
                <li key={`${result.displayName}|${result.lat}|${result.lon}`}>
                  <button
                    type="button"
                    onClick={() => selectResult(result)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.07] active:bg-white/[0.1]"
                  >
                    <MapPin className="size-4 shrink-0 text-sky-300/80" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-100">
                        {result.name}
                        {result.nameEn && result.nameEn !== result.name ? ` · ${result.nameEn}` : ''}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-400">
                        {result.country} · {result.typeLabel}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {selected ? (
            <div className="rounded-2xl border border-sky-300/30 bg-sky-400/[0.08] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-100">
                    {selected.name}
                    {selected.nameEn && selected.nameEn !== selected.name ? ` · ${selected.nameEn}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{selected.country} · {selected.typeLabel}</p>
                  <p className="mt-1 font-mono text-[11px] text-slate-500">
                    {selected.lat.toFixed(4)}, {selected.lon.toFixed(4)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(undefined)}
                  className="shrink-0 rounded-full border border-white/16 bg-white/8 px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:bg-white/14 active:scale-95"
                >
                  重新选择
                </button>
              </div>
            </div>
          ) : null}

          <EditorField label="状态 *">
            {statusChips}
          </EditorField>

          <EditorField label="简介（可选）">
            <textarea
              className={`${editorInputClass} min-h-20 resize-y`}
              value={draft.summary}
              onChange={(event) => update('summary', event.currentTarget.value)}
              placeholder="这个地点的一句话介绍，留空也可以保存。"
            />
          </EditorField>

          <button
            type="button"
            onClick={() => setManualMode(true)}
            className="text-left text-xs font-medium text-slate-400 underline decoration-slate-600 underline-offset-4 transition hover:text-slate-200"
          >
            高级 / 手动填写（搜不到的小众地点）
          </button>
        </>
      ) : (
        <>
          {!existing ? (
            <button
              type="button"
              onClick={() => setManualMode(false)}
              className="text-left text-xs font-medium text-slate-400 underline decoration-slate-600 underline-offset-4 transition hover:text-slate-200"
            >
              ← 返回搜索添加
            </button>
          ) : null}

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
            {statusChips}
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
        </>
      )}
    </EditorSheet>
  )
}

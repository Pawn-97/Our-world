import type { MediaEditorState } from './editorState'

// Dev-only local editor API client (served by scripts/local-editor-plugin.mjs,
// loopback-only). Milestone 2 removed the travel-record write paths
// (/records, /countries, catalog search) because they wrote the old
// travel-map format; place/visit/memory content is now edited directly in
// content/*.json. Media upload/import/curation stays.

type EditorResponse<T> = {
  ok: boolean
  error?: string
  details?: string
} & T

const editorHeaders = {
  'content-type': 'application/json',
  'x-travelatlas-local-editor': '1',
}

const parseResponse = async <T,>(response: Response) => {
  const body = await response.json() as EditorResponse<T>
  if (!response.ok || !body.ok) {
    throw new Error([body.error, body.details].filter(Boolean).join('\n') || '本地编辑操作失败。')
  }
  return body
}

export const readLocalEditorState = async () => {
  const response = await fetch('/__travelatlas/editor/state', { cache: 'no-store' })
  return (await parseResponse<{ state: MediaEditorState }>(response)).state
}

export const updateLocalEditorState = async (
  update: (current: MediaEditorState) => MediaEditorState,
) => {
  const current = await readLocalEditorState()
  const response = await fetch('/__travelatlas/editor/state', {
    method: 'PUT',
    headers: editorHeaders,
    body: JSON.stringify(update(current)),
  })
  return (await parseResponse<{ state: MediaEditorState }>(response)).state
}

export type LocalMediaUpload = {
  placeId: string
  kind: 'photo' | 'panorama360' | 'aerialPhoto'
  file: File
  date?: string
  lat?: number
  lng?: number
  altitudeMeters?: number
  relativeAltitudeMeters?: number
  titleZh?: string
  titleEn?: string
}

export const uploadLocalMedia = async (upload: LocalMediaUpload) => {
  const search = new URLSearchParams({
    placeId: upload.placeId,
    kind: upload.kind,
    fileName: upload.file.name,
  })
  if (upload.date) search.set('date', upload.date)
  if (upload.lat !== undefined) search.set('lat', String(upload.lat))
  if (upload.lng !== undefined) search.set('lng', String(upload.lng))
  if (upload.altitudeMeters !== undefined) search.set('altitudeMeters', String(upload.altitudeMeters))
  if (upload.relativeAltitudeMeters !== undefined) search.set('relativeAltitudeMeters', String(upload.relativeAltitudeMeters))
  if (upload.titleZh) search.set('titleZh', upload.titleZh)
  if (upload.titleEn) search.set('titleEn', upload.titleEn)

  const response = await fetch(`/__travelatlas/editor/upload?${search}`, {
    method: 'POST',
    headers: {
      'content-type': upload.file.type || 'application/octet-stream',
      'x-travelatlas-local-editor': '1',
    },
    body: upload.file,
  })
  return parseResponse<{ fileName: string; bytes: number; sourcePath: string }>(response)
}

export const importLocalMedia = async (sourcePaths: string[] = []) => {
  const response = await fetch('/__travelatlas/editor/import', {
    method: 'POST',
    headers: editorHeaders,
    body: JSON.stringify({ sourcePaths }),
  })
  return parseResponse<{ output: string; restoredMediaIds: string[] }>(response)
}

export const deleteHiddenLocalMedia = async (placeId: string, ids: string[]) => {
  const response = await fetch('/__travelatlas/editor/media/delete', {
    method: 'POST',
    headers: editorHeaders,
    body: JSON.stringify({ placeId, ids }),
  })
  return parseResponse<{ deletedIds: string[]; deletedSourceFiles: number; output: string }>(response)
}

export const reloadAfterLocalSave = () => window.location.reload()

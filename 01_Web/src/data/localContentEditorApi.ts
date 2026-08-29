// Dev-only content editor API client (served by scripts/local-editor-plugin.mjs,
// loopback-only). This module must NEVER be statically imported by a component:
// every call site loads it with `await import(...)` inside an
// `import.meta.env.DEV` guard so the production bundle contains none of these
// endpoint strings.

export type LocalContentEntity = 'places' | 'visits' | 'memories'

type EditorResponse<T> = {
  ok: boolean
  error?: string
  details?: string
  validation?: string[]
} & T

const editorHeaders = {
  'content-type': 'application/json',
  'x-travelatlas-local-editor': '1',
}

const parseResponse = async <T>(response: Response) => {
  const body = await response.json() as EditorResponse<T>
  if (!response.ok || !body.ok) {
    const validation = body.validation?.length ? `\n${body.validation.join('\n')}` : ''
    throw new Error([body.error, body.details].filter(Boolean).join('\n') + validation || '本地编辑操作失败。')
  }
  return body
}

export type LocalContentSnapshot = {
  world: unknown
  places: unknown
  visits: unknown
  memories: unknown
  media: unknown
}

/** Fresh content straight from disk after a save (dev middleware read-back). */
export const fetchLocalContent = async () => {
  const response = await fetch('/__travelatlas/editor/content', { cache: 'no-store' })
  return (await parseResponse<{ content: LocalContentSnapshot }>(response)).content
}

export const saveLocalContentEntity = async (
  entity: LocalContentEntity,
  record: Record<string, unknown>,
  placeId?: string,
) => {
  const response = await fetch(`/__travelatlas/editor/content/${entity}`, {
    method: 'POST',
    headers: editorHeaders,
    body: JSON.stringify({ op: 'upsert', record, ...(placeId ? { placeId } : {}) }),
  })
  return parseResponse(response)
}

export const deleteLocalContentEntity = async (entity: LocalContentEntity, id: string) => {
  const response = await fetch(`/__travelatlas/editor/content/${entity}`, {
    method: 'POST',
    headers: editorHeaders,
    body: JSON.stringify({ op: 'delete', id }),
  })
  return parseResponse(response)
}

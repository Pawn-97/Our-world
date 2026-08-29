import { createReadStream, createWriteStream } from 'node:fs'
import { access, copyFile, mkdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { localContentStore } from './content-store.mjs'

// Loopback-only Vite middleware for the local editor (dev server only; the
// production build has no write APIs). Milestone 2 removed the old
// travel-record endpoints (/records, /countries, catalog search). Milestone 5
// adds content CRUD (places/visits/memories) via scripts/content-store.mjs —
// every mutation is validated with the same rules as `npm run validate`
// before anything hits disk.

const execFileAsync = promisify(execFile)
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const projectRoot = path.resolve(webRoot, '..')
const generatedRoot = path.join(webRoot, 'src', 'data', 'generated')
const editorStatePath = path.join(generatedRoot, 'editor-state.local.json')
const mediaCatalogPath = path.join(generatedRoot, 'user-media.local.json')
const mediaSourceIndexPath = path.join(generatedRoot, 'media-source-index.local.json')
const placesContentPath = path.join(webRoot, 'content', 'places.json')
const inboxRoot = path.join(projectRoot, '02_Assets', 'MediaInbox')
const userMediaRoot = path.join(webRoot, 'public', 'media', 'user')
const editorHeader = 'x-travelatlas-local-editor'
const maxUploadBytes = 250 * 1024 * 1024
const userMediaContentTypes = new Map([
  ['.avif', 'image/avif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
])

const emptyState = {
  schemaVersion: 1,
  mediaOrderByPlace: {},
  hiddenMediaIds: [],
  coverMediaByPlace: {},
}

const exists = async (target) => access(target).then(() => true, () => false)
const readJson = async (target, fallback) => {
  try {
    return JSON.parse(await readFile(target, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }
}

const sendJson = (response, status, body) => {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(JSON.stringify(body))
}

const readJsonBody = async (request) => {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 1024 * 1024) throw new Error('请求内容过大。')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string')
const isStringArrayRecord = (value) => value && typeof value === 'object'
  && Object.values(value).every(isStringArray)
const isStringRecord = (value) => value && typeof value === 'object'
  && Object.values(value).every((item) => typeof item === 'string')

const normalizeState = (value) => {
  if (!value || typeof value !== 'object') throw new Error('编辑状态格式无效。')
  return {
    schemaVersion: 1,
    mediaOrderByPlace: isStringArrayRecord(value.mediaOrderByPlace) ? value.mediaOrderByPlace : {},
    hiddenMediaIds: isStringArray(value.hiddenMediaIds) ? value.hiddenMediaIds : [],
    coverMediaByPlace: isStringRecord(value.coverMediaByPlace) ? value.coverMediaByPlace : {},
    updatedAt: new Date().toISOString(),
  }
}

const atomicJsonWrite = async (target, value) => {
  await mkdir(path.dirname(target), { recursive: true })
  if (await exists(target)) await copyFile(target, target.replace(/\.json$/i, '.bak'))
  const temporaryPath = `${target}.${process.pid}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, target)
}

const getLocation = async (placeId) => {
  const places = await readJson(placesContentPath, [])
  const place = Array.isArray(places) ? places.find((candidate) => candidate?.id === placeId) : undefined
  if (!place) {
    throw new Error('找不到对应的地点，请先在 content/places.json 中添加该地点。')
  }
  return {
    placeId: place.id,
    countryName: place.countryEn ?? place.country,
    placeName: place.nameEn ?? place.name,
  }
}

const safeSegment = (value, label) => {
  // eslint-disable-next-line no-control-regex -- Windows file names must reject ASCII control characters.
  const cleaned = String(value ?? '').trim().replace(/[\x00-\x1f<>:"/\\|?*]/g, '-')
  if (!cleaned || cleaned === '.' || cleaned === '..') throw new Error(`${label}无效。`)
  return cleaned.slice(0, 120)
}

const reserveDestination = async (directory, originalName) => {
  const parsed = path.parse(safeSegment(originalName, '文件名'))
  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? '' : `-${index}`
    const candidate = path.join(directory, `${parsed.name}${suffix}${parsed.ext.toLowerCase()}`)
    if (!await exists(candidate)) return candidate
  }
  throw new Error('同名文件过多，请先整理文件名。')
}

const orientedImageDimensions = (metadata) => {
  const orientation = metadata.orientation ?? 1
  const swapsAxes = orientation >= 5 && orientation <= 8
  const width = swapsAxes ? metadata.height : metadata.width
  const height = swapsAxes ? metadata.width : metadata.height
  return width && height ? { width, height } : undefined
}

const isLikelyEquirectangularPanorama = (dimensions) => {
  if (!dimensions) return false
  const ratio = dimensions.width / dimensions.height
  return ratio >= 1.9 && ratio <= 2.1
}

const writeUpload = async (request, destination, kind) => {
  const contentLength = Number(request.headers['content-length'] ?? 0)
  if (!Number.isFinite(contentLength) || contentLength <= 0) throw new Error('没有收到文件内容。')
  if (contentLength > maxUploadBytes) throw new Error('单个文件不能超过 250 MiB。')

  const temporaryPath = path.join(tmpdir(), `ourworld-upload-${process.pid}-${Date.now()}`)
  let received = 0
  request.on('data', (chunk) => {
    received += chunk.length
    if (received > maxUploadBytes) request.destroy(new Error('单个文件不能超过 250 MiB。'))
  })

  try {
    await pipeline(request, createWriteStream(temporaryPath, { flags: 'wx' }))
    const imageMetadata = await sharp(temporaryPath).metadata()
    if (!imageMetadata.width || !imageMetadata.height) throw new Error('无法读取图片尺寸或文件内容无效。')
    const dimensions = orientedImageDimensions(imageMetadata)
    if (kind === 'panorama360' && !isLikelyEquirectangularPanorama(dimensions)) {
      throw new Error(`所选图片为 ${dimensions?.width ?? imageMetadata.width} × ${dimensions?.height ?? imageMetadata.height}，不是常见的 2:1 等距柱状全景图。请改选“航拍照片”，或上传正确的 360 全景图。`)
    }
    await mkdir(path.dirname(destination), { recursive: true })
    await pipeline(createReadStream(temporaryPath), createWriteStream(destination, { flags: 'wx' }))
    return imageMetadata
  } finally {
    await unlink(temporaryPath).catch(() => undefined)
  }
}

const updateDroneSidecar = async (placeRoot, destination, metadata, imageMetadata) => {
  const sidecarPath = path.join(placeRoot, 'media.json')
  const sidecar = await readJson(sidecarPath, {})
  const relativeKey = path.posix.join('drone', path.basename(destination))
  sidecar[relativeKey] = {
    kind: metadata.kind,
    titleZh: metadata.titleZh,
    titleEn: metadata.titleEn,
    date: metadata.date,
    resolution: `${imageMetadata.width} × ${imageMetadata.height}`,
    captureType: metadata.kind === 'panorama360' ? 'Drone 360 Panorama' : 'Aerial Photo',
    ...(metadata.lat === undefined || metadata.lng === undefined ? {} : {
      position: {
        lat: metadata.lat,
        lng: metadata.lng,
        ...(metadata.altitudeMeters === undefined ? {} : { altitudeMeters: metadata.altitudeMeters }),
      },
    }),
    ...(metadata.altitudeMeters === undefined ? {} : { altitudeMeters: metadata.altitudeMeters }),
    ...(metadata.relativeAltitudeMeters === undefined ? {} : { relativeAltitudeMeters: metadata.relativeAltitudeMeters }),
  }
  await atomicJsonWrite(sidecarPath, sidecar)
}

const runImporter = async () => {
  const command = process.execPath
  const script = path.join(webRoot, 'scripts', 'import-media.mjs')
  const preflight = await execFileAsync(command, [script], { cwd: webRoot, maxBuffer: 4 * 1024 * 1024 })
  const blockingPattern = /需要处理|缺少日期或分辨率|缺少日期、分辨率或有效坐标|无法读取|找不到国家|找不到城市|找不到地点/
  if (blockingPattern.test(`${preflight.stdout}\n${preflight.stderr}`)) {
    const error = new Error('媒体预检发现未解决信息，已停止导入。')
    error.details = `${preflight.stdout}\n${preflight.stderr}`.trim()
    throw error
  }
  const imported = await execFileAsync(command, [script, '--apply'], { cwd: webRoot, maxBuffer: 8 * 1024 * 1024 })
  return `${imported.stdout}\n${imported.stderr}`.trim()
}

const isPathInside = (root, target) => {
  const relative = path.relative(root, target)
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}

const normalizeInboxRelativePath = (value) => {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const target = path.resolve(inboxRoot, value.trim())
  if (!isPathInside(inboxRoot, target)) throw new Error('媒体源文件路径超出投递箱范围。')
  return path.relative(inboxRoot, target).split(path.sep).join('/')
}

const restoreImportedMedia = async (sourcePaths) => {
  if (sourcePaths.length === 0) return []

  const requestedSources = new Set(sourcePaths.map((sourcePath) => sourcePath.toLocaleLowerCase('en-US')))
  const sourceIndex = await readJson(mediaSourceIndexPath, { sourcesById: {} })
  const importedIds = Object.entries(sourceIndex.sourcesById ?? {})
    .filter(([, sources]) => Array.isArray(sources) && sources.some(
      (source) => requestedSources.has(String(source).replaceAll('\\', '/').toLocaleLowerCase('en-US')),
    ))
    .map(([id]) => id)

  if (importedIds.length === 0) {
    throw new Error('文件已经接收，但导入结果没有对应媒体记录。请保留当前页面并查看导入详情。')
  }

  const catalog = await readJson(mediaCatalogPath, { items: [] })
  const itemsById = new Map((Array.isArray(catalog.items) ? catalog.items : []).map((item) => [item.id, item]))
  const importedItems = importedIds.map((id) => itemsById.get(id)).filter(Boolean)
  if (importedItems.length !== importedIds.length) {
    throw new Error('导入索引与媒体目录不一致，已停止刷新页面。')
  }

  const state = normalizeState(await readJson(editorStatePath, emptyState))
  const nextState = {
    ...state,
    mediaOrderByPlace: { ...state.mediaOrderByPlace },
    hiddenMediaIds: state.hiddenMediaIds.filter((id) => !importedIds.includes(id)),
  }

  for (const item of importedItems) {
    if (item.kind !== 'photo') continue
    const currentOrder = nextState.mediaOrderByPlace[item.placeId] ?? []
    nextState.mediaOrderByPlace[item.placeId] = [...currentOrder.filter((id) => id !== item.id), item.id]
  }

  await atomicJsonWrite(editorStatePath, normalizeState(nextState))
  return importedIds
}

const serveUserMedia = async (request, response, pathname) => {
  if (!isLoopbackRequest(request)) {
    response.statusCode = 403
    response.end('Forbidden')
    return
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.statusCode = 405
    response.setHeader('allow', 'GET, HEAD')
    response.end('Method Not Allowed')
    return
  }

  let relativePath
  try {
    relativePath = decodeURIComponent(pathname.slice('/media/user/'.length))
  } catch {
    response.statusCode = 400
    response.end('Bad Request')
    return
  }
  const target = path.resolve(userMediaRoot, relativePath)
  if (!isPathInside(userMediaRoot, target)) {
    response.statusCode = 403
    response.end('Forbidden')
    return
  }

  let fileStats
  try {
    fileStats = await stat(target)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    response.statusCode = 404
    response.end('Not Found')
    return
  }
  if (!fileStats.isFile()) {
    response.statusCode = 404
    response.end('Not Found')
    return
  }

  response.statusCode = 200
  response.setHeader('content-type', userMediaContentTypes.get(path.extname(target).toLowerCase()) ?? 'application/octet-stream')
  response.setHeader('content-length', String(fileStats.size))
  response.setHeader('cache-control', 'no-store')
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  await pipeline(createReadStream(target), response)
}

const removeSidecarEntries = async (sourcePaths) => {
  const removalsBySidecar = new Map()
  for (const sourcePath of sourcePaths) {
    const mediaFolder = path.dirname(sourcePath)
    const placeRoot = path.dirname(mediaFolder)
    const sidecarPath = path.join(placeRoot, 'media.json')
    const relativeKey = path.posix.join(path.basename(mediaFolder), path.basename(sourcePath)).toLocaleLowerCase('en-US')
    removalsBySidecar.set(sidecarPath, new Set([...(removalsBySidecar.get(sidecarPath) ?? []), relativeKey]))
  }

  for (const [sidecarPath, relativeKeys] of removalsBySidecar) {
    if (!await exists(sidecarPath)) continue
    const sidecar = await readJson(sidecarPath, {})
    let changed = false
    for (const key of Object.keys(sidecar)) {
      const normalizedKey = key.replaceAll('\\', '/').toLocaleLowerCase('en-US')
      if (!relativeKeys.has(normalizedKey)) continue
      delete sidecar[key]
      changed = true
    }
    if (changed) await atomicJsonWrite(sidecarPath, sidecar)
  }
}

const deleteHiddenMedia = async (input) => {
  const placeId = typeof input?.placeId === 'string' ? input.placeId.trim() : ''
  const ids = isStringArray(input?.ids) ? [...new Set(input.ids)] : []
  if (!placeId || ids.length === 0) throw new Error('没有可删除的隐藏媒体。')

  const state = normalizeState(await readJson(editorStatePath, emptyState))
  const hiddenIds = new Set(state.hiddenMediaIds)
  const catalog = await readJson(mediaCatalogPath, { items: [] })
  const catalogItems = Array.isArray(catalog.items) ? catalog.items : []
  const itemsById = new Map(catalogItems.map((item) => [item.id, item]))
  for (const id of ids) {
    const item = itemsById.get(id)
    if (!hiddenIds.has(id) || item?.placeId !== placeId) {
      throw new Error('只能彻底删除当前地点中已经隐藏的媒体。')
    }
  }

  let sourceIndex = await readJson(mediaSourceIndexPath, { sourcesById: {} })
  if (ids.some((id) => !Array.isArray(sourceIndex.sourcesById?.[id]))) {
    await runImporter()
    sourceIndex = await readJson(mediaSourceIndexPath, { sourcesById: {} })
  }

  const sourcePaths = []
  for (const id of ids) {
    const relativeSources = sourceIndex.sourcesById?.[id]
    if (!Array.isArray(relativeSources) || relativeSources.length === 0) {
      throw new Error(`找不到媒体 ${id} 对应的投递箱原图，已停止删除。`)
    }
    for (const relativeSource of relativeSources) {
      const sourcePath = path.resolve(inboxRoot, relativeSource)
      if (!isPathInside(inboxRoot, sourcePath)) throw new Error('媒体源文件路径超出投递箱范围，已停止删除。')
      sourcePaths.push(sourcePath)
    }
  }

  let deletedSourceFiles = 0
  for (const sourcePath of sourcePaths) {
    try {
      await unlink(sourcePath)
      deletedSourceFiles += 1
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  await removeSidecarEntries(sourcePaths)

  for (const id of ids) {
    const item = itemsById.get(id)
    const generatedFile = path.resolve(webRoot, 'public', String(item.src).replace(/^\/+/, ''))
    const generatedDirectory = path.dirname(generatedFile)
    if (!isPathInside(userMediaRoot, generatedDirectory)) throw new Error('生成文件路径超出用户媒体目录，已停止删除。')
    await rm(generatedDirectory, { recursive: true, force: true })
  }

  const nextState = normalizeState({
    ...state,
    hiddenMediaIds: state.hiddenMediaIds.filter((id) => !ids.includes(id)),
    mediaOrderByPlace: Object.fromEntries(Object.entries(state.mediaOrderByPlace)
      .map(([key, value]) => [key, value.filter((id) => !ids.includes(id))])),
    coverMediaByPlace: Object.fromEntries(Object.entries(state.coverMediaByPlace)
      .filter(([, mediaId]) => !ids.includes(mediaId))),
  })
  await atomicJsonWrite(editorStatePath, nextState)
  const output = await runImporter()
  return { deletedIds: ids, deletedSourceFiles, output }
}

const allowedOrigins = (request) => {
  const origin = request.headers.origin
  if (!origin) return true
  try {
    const parsed = new URL(origin)
    return (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
      && parsed.protocol === 'http:'
  } catch {
    return false
  }
}

const isLoopbackRequest = (request) => {
  const address = request.socket.remoteAddress ?? ''
  return address === '::1' || address === '127.0.0.1' || address.startsWith('::ffff:127.')
}

const authorizeWrite = (request) => (
  isLoopbackRequest(request)
  && request.headers[editorHeader] === '1'
  && allowedOrigins(request)
)

export function travelAtlasLocalEditor() {
  return {
    name: 'ourworld-local-editor',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1')
        if (url.pathname.startsWith('/media/user/')) {
          try {
            await serveUserMedia(request, response, url.pathname)
          } catch {
            if (!response.headersSent) response.statusCode = 500
            response.end()
          }
          return
        }
        if (!url.pathname.startsWith('/__travelatlas/editor/')) return next()

        try {
          if (request.method === 'GET' && url.pathname === '/__travelatlas/editor/state') {
            if (!isLoopbackRequest(request)) return sendJson(response, 403, { ok: false, error: '仅允许本机编辑会话读取。' })
            const state = normalizeState(await readJson(editorStatePath, emptyState))
            return sendJson(response, 200, { ok: true, state })
          }

          // Content read-back for in-place refresh after saves (loopback only,
          // dev server only; production serves bundled content instead).
          if (request.method === 'GET' && url.pathname === '/__travelatlas/editor/content') {
            if (!isLoopbackRequest(request)) return sendJson(response, 403, { ok: false, error: '仅允许本机编辑会话读取。' })
            const content = await localContentStore.readAll()
            return sendJson(response, 200, { ok: true, content })
          }

          // Import catalog read-back for in-place media refresh after imports
          // (loopback only; the media files themselves stay static in public/).
          if (request.method === 'GET' && url.pathname === '/__travelatlas/editor/media') {
            if (!isLoopbackRequest(request)) return sendJson(response, 403, { ok: false, error: '仅允许本机编辑会话读取。' })
            const catalog = await readJson(mediaCatalogPath, { schemaVersion: 3, items: [] })
            return sendJson(response, 200, { ok: true, catalog })
          }

          if (!authorizeWrite(request)) return sendJson(response, 403, { ok: false, error: '仅允许本机编辑会话写入。' })

          const contentEntityMatch = url.pathname.match(/^\/__travelatlas\/editor\/content\/(places|visits|memories)$/)
          if (request.method === 'POST' && contentEntityMatch) {
            const entity = contentEntityMatch[1]
            const input = await readJsonBody(request)
            try {
              if (input?.op === 'upsert') {
                if (!input.record || typeof input.record !== 'object') throw new Error('缺少要保存的记录。')
                if (entity === 'places') await localContentStore.upsertPlace(input.record)
                else if (entity === 'visits') await localContentStore.upsertVisit(input.record)
                else await localContentStore.upsertMemory(input.record, typeof input.placeId === 'string' ? input.placeId : undefined)
              } else if (input?.op === 'delete') {
                if (typeof input.id !== 'string' || !input.id) throw new Error('缺少要删除的 id。')
                if (entity === 'places') await localContentStore.deletePlace(input.id)
                else if (entity === 'visits') await localContentStore.deleteVisit(input.id)
                else await localContentStore.deleteMemory(input.id)
              } else {
                throw new Error('未知的编辑操作。')
              }
            } catch (error) {
              if (Array.isArray(error?.validation)) {
                return sendJson(response, 422, { ok: false, error: error.message, validation: error.validation })
              }
              throw error
            }
            return sendJson(response, 200, { ok: true })
          }

          if (request.method === 'PUT' && url.pathname === '/__travelatlas/editor/state') {
            const state = normalizeState(await readJsonBody(request))
            await atomicJsonWrite(editorStatePath, state)
            return sendJson(response, 200, { ok: true, state })
          }

          if (request.method === 'POST' && url.pathname === '/__travelatlas/editor/upload') {
            const placeId = url.searchParams.get('placeId') ?? ''
            const kind = url.searchParams.get('kind') ?? 'photo'
            const fileName = url.searchParams.get('fileName') ?? ''
            if (!['photo', 'panorama360', 'aerialPhoto'].includes(kind)) throw new Error('不支持的媒体类型。')

            const location = await getLocation(placeId)
            const countryFolder = safeSegment(location.countryName, '国家名')
            const placeFolder = safeSegment(location.placeName, '地点名')
            const placeRoot = path.join(inboxRoot, countryFolder, placeFolder)
            const mediaFolder = kind === 'photo' ? 'photos' : 'drone'
            const destination = await reserveDestination(path.join(placeRoot, mediaFolder), fileName)
            const extension = path.extname(destination).toLowerCase()
            if (!['.jpg', '.jpeg', '.png', '.webp', '.avif'].includes(extension)) {
              throw new Error('当前网页编辑器只接收 JPG、PNG、WebP 或 AVIF 图片。')
            }
            let droneMetadata
            if (kind !== 'photo') {
              const date = url.searchParams.get('date') ?? ''
              const latText = url.searchParams.get('lat')
              const lngText = url.searchParams.get('lng')
              const lat = latText === null || latText === '' ? undefined : Number(latText)
              const lng = lngText === null || lngText === '' ? undefined : Number(lngText)
              const altitudeText = url.searchParams.get('altitudeMeters')
              const altitudeMeters = altitudeText ? Number(altitudeText) : undefined
              const relativeAltitudeText = url.searchParams.get('relativeAltitudeMeters')
              const relativeAltitudeMeters = relativeAltitudeText ? Number(relativeAltitudeText) : undefined
              if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('无人机影像必须填写有效日期。')
              if ((lat === undefined) !== (lng === undefined)) {
                throw new Error('经纬度需要同时填写，或同时留空。')
              }
              if (
                (lat !== undefined && (!Number.isFinite(lat) || lat < -90 || lat > 90))
                || (lng !== undefined && (!Number.isFinite(lng) || lng < -180 || lng > 180))
              ) {
                throw new Error('经纬度超出有效范围。')
              }
              droneMetadata = {
                kind,
                date,
                lat,
                lng,
                altitudeMeters: Number.isFinite(altitudeMeters) ? altitudeMeters : undefined,
                relativeAltitudeMeters: Number.isFinite(relativeAltitudeMeters) ? relativeAltitudeMeters : undefined,
                titleZh: url.searchParams.get('titleZh') || `${location.placeName}无人机影像`,
                titleEn: url.searchParams.get('titleEn') || `${location.placeName} Drone Media`,
              }
            }

            const imageMetadata = await writeUpload(request, destination, kind)
            if (droneMetadata) await updateDroneSidecar(placeRoot, destination, droneMetadata, imageMetadata)

            const fileStats = await stat(destination)
            return sendJson(response, 201, {
              ok: true,
              fileName: path.basename(destination),
              bytes: fileStats.size,
              sourcePath: path.relative(inboxRoot, destination).split(path.sep).join('/'),
            })
          }

          if (request.method === 'POST' && url.pathname === '/__travelatlas/editor/import') {
            const input = await readJsonBody(request)
            const sourcePaths = isStringArray(input?.sourcePaths)
              ? [...new Set(input.sourcePaths.map(normalizeInboxRelativePath).filter(Boolean))]
              : []
            const output = await runImporter()
            const restoredMediaIds = await restoreImportedMedia(sourcePaths)
            return sendJson(response, 200, { ok: true, output, restoredMediaIds })
          }

          if (request.method === 'POST' && url.pathname === '/__travelatlas/editor/media/delete') {
            const result = await deleteHiddenMedia(await readJsonBody(request))
            return sendJson(response, 200, { ok: true, ...result })
          }

          return sendJson(response, 404, { ok: false, error: '未知的本地编辑接口。' })
        } catch (error) {
          const details = typeof error?.details === 'string' ? error.details : undefined
          return sendJson(response, 400, {
            ok: false,
            error: error instanceof Error ? error.message : '本地编辑操作失败。',
            ...(details ? { details } : {}),
          })
        }
      })
    },
  }
}

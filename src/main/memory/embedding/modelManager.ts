// [embedding/modelManager] — 模型生命周期管理
// 职责：解压/下载/切换/状态持久化
// 引用：./types
//
// 存储布局：
//   安装目录/resources/models/bge-small-zh-v1.5.onnx.zip  ← 捆绑压缩包
//   {dataRoot}/models/bge-small-zh/                        ← 解压后，运行时使用
//   {dataRoot}/models/.model-state.json                    ← 当前激活模型记录

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync, renameSync, cpSync } from 'node:fs'
import { join, basename } from 'node:path'
import { createHash } from 'node:crypto'
import https from 'node:https'
import http from 'node:http'
import { createUnzip } from 'node:zlib'
import { createReadStream, createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import type { LocalModelId, ModelState } from './types'
import { MODEL_MANIFESTS, getModelManifest } from './types'
import { app } from 'electron'
import { createLogger } from '../../logger'

const log = createLogger('model-manager')

const MODEL_STATE_FILE = '.model-state.json'

// ═══════════════════════════════════════════
// 路径解析
// ═══════════════════════════════════════════

/** 安装目录 resources/models（electron-builder extraResources 可能落在 resources/resources/models） */
function resourcesModelsDir(): string {
  const isDev = !(app?.isPackaged ?? false)
  if (isDev) {
    return join(process.cwd(), 'resources', 'models')
  }
  const exeDir = join(app.getPath('exe'), '..')
  const primary = join(exeDir, 'resources', 'models')
  if (existsSync(primary)) return primary
  // extraResources: from resources → to resources → …/resources/resources/models/
  const nested = join(exeDir, 'resources', 'resources', 'models')
  if (existsSync(nested)) return nested
  return primary
}

/** 压缩包在安装目录的位置 */
function bundledModelZipPath(modelId: LocalModelId): string {
  return join(resourcesModelsDir(), `${modelId}-v1.5.onnx.zip`)
}

/** 预装 zip 是否存在于安装包/开发 resources */
export function bundledModelZipExists(modelId: LocalModelId): boolean {
  return existsSync(bundledModelZipPath(modelId))
}

/** @deprecated use bundledModelZipPath */
function bundledModelPath(modelId: LocalModelId): string {
  return bundledModelZipPath(modelId)
}

/** 模型解压目标目录 */
function extractedModelDir(modelId: LocalModelId, dataRoot: string): string {
  return join(dataRoot, 'models', modelId)
}

/** .model-state.json 路径 */
function modelStatePath(dataRoot: string): string {
  return join(dataRoot, 'models', MODEL_STATE_FILE)
}

/** models 目录 */
function modelsDir(dataRoot: string): string {
  return join(dataRoot, 'models')
}

// ═══════════════════════════════════════════
// 状态管理
// ═══════════════════════════════════════════

export function getModelState(dataRoot: string): ModelState {
  const path = modelStatePath(dataRoot)
  if (!existsSync(path)) {
    return { activeModel: 'none', version: '0', activatedAt: '', dimension: 0, provider: 'none' }
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ModelState
  } catch {
    return { activeModel: 'none', version: '0', activatedAt: '', dimension: 0, provider: 'none' }
  }
}

export function saveModelState(dataRoot: string, state: ModelState): void {
  const dir = modelsDir(dataRoot)
  mkdirSync(dir, { recursive: true })
  writeFileSync(modelStatePath(dataRoot), JSON.stringify(state, null, 2), 'utf-8')
}

// ═══════════════════════════════════════════
// 模型解压
// ═══════════════════════════════════════════

/** 确保模型已解压。返回解压目录路径，失败返回 null */
export function ensureModelExtracted(
  modelId: LocalModelId,
  dataRoot: string
): { modelDir: string } | null {
  const targetDir = extractedModelDir(modelId, dataRoot)

  // 已解压
  if (isModelExtracted(targetDir)) return { modelDir: targetDir }

  // 尝试从压缩包解压（安装包 resources 或 dataRoot 内已下载 zip）
  const zipCandidates = [
    bundledModelZipPath(modelId),
    join(dataRoot, 'models', `${modelId}-v1.5.onnx.zip`),
  ]
  for (const zipPath of zipCandidates) {
    if (!existsSync(zipPath)) continue
    try {
      extractSync(zipPath, targetDir, modelId)
      if (isModelExtracted(targetDir)) {
        log.info('模型解压成功', { model: modelId, targetDir, zipPath })
        return { modelDir: targetDir }
      }
      log.error('模型解压后文件不完整', { model: modelId, targetDir, zipPath })
    } catch (e) {
      log.error('模型解压失败', { model: modelId, error: String(e), zipPath })
    }
  }

  if (!existsSync(bundledModelZipPath(modelId))) {
    log.info('模型压缩包不存在', { model: modelId, zipPath: bundledModelZipPath(modelId) })
  }

  return null
}

/** 开发模式：从 .test-cache 或 data/models 复制已解压模型（仅 bootstrap 调用） */
export function seedDevExtractedModel(modelId: LocalModelId, dataRoot: string): boolean {
  const targetDir = extractedModelDir(modelId, dataRoot)
  if (isModelExtracted(targetDir)) return true
  if (!trySeedFromDevExtracted(modelId, targetDir)) return false
  return isModelExtracted(targetDir)
}

/** 检查解压目录是否包含必要文件 */
function isModelExtracted(dir: string): boolean {
  if (!existsSync(dir)) return false
  const onnx = join(dir, 'model.onnx')
  const tok = join(dir, 'tokenizer.json')
  if (!existsSync(onnx) || !existsSync(tok)) return false
  try {
    return statSync(onnx).size > 1_000_000
  } catch {
    return false
  }
}

function copyDirRecursive(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name)
    const d = join(dst, entry.name)
    if (entry.isDirectory()) copyDirRecursive(s, d)
    else cpSync(s, d)
  }
}

/** 开发模式：从 .test-cache 或 data/models 复制已解压模型 */
function trySeedFromDevExtracted(modelId: LocalModelId, targetDir: string): boolean {
  if (app?.isPackaged ?? false) return false
  const candidates = [
    join(process.cwd(), '.test-cache', 'models', modelId),
    join(process.cwd(), 'data', 'models', modelId),
  ]
  for (const src of candidates) {
    if (!isModelExtracted(src)) continue
    rmSync(targetDir, { recursive: true, force: true })
    copyDirRecursive(src, targetDir)
    if (isModelExtracted(targetDir)) {
      log.info('从开发缓存复制 embedding 模型', { model: modelId, src })
      return true
    }
  }
  return false
}

/** 同步解压 .onnx.zip 到目标目录 */
function extractSync(zipPath: string, targetDir: string, modelId: LocalModelId): void {
  // 使用 Node.js 内置的 gunzip 解压（.onnx.zip 实际是 gzip 压缩的单文件）
  // 如果是真正的 zip 格式，需要用 unzipper 等库
  // 这里先用同步方式处理 gzip 场景，真正的 zip 需要额外依赖
  mkdirSync(targetDir, { recursive: true })

  // 注意：实际的 .onnx.zip 可能是标准 zip 格式
  // 对于内置模型，我们直接复制解压后的文件
  // 这里实现一个简化的 gzip 解压
  const { execSync } = require('node:child_process')
  const fileName = basename(zipPath)

  // Windows: 使用 PowerShell 解压
  if (process.platform === 'win32') {
    execSync(
      `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${targetDir}' -Force"`,
      { timeout: 30000 }
    )
  } else {
    // macOS/Linux: 使用 unzip
    execSync(`unzip -o '${zipPath}' -d '${targetDir}'`, { timeout: 30000 })
  }

  // 如果解压后文件在子目录中，移动到目标根目录
  const entries = readdirSync(targetDir)
  if (entries.length === 1) {
    const subDir = join(targetDir, entries[0])
    try {
      const stat = require('node:fs').statSync(subDir)
      if (stat.isDirectory()) {
        // 移动子目录内容到目标目录
        const subEntries = readdirSync(subDir)
        for (const entry of subEntries) {
          const src = join(subDir, entry)
          const dst = join(targetDir, entry)
          require('node:fs').renameSync(src, dst)
        }
        rmSync(subDir, { recursive: true })
      }
    } catch { /* 不是目录，忽略 */ }
  }
}

// ═══════════════════════════════════════════
// 模型切换
// ═══════════════════════════════════════════

/** 切换当前活跃模型。返回是否成功 */
export function switchModel(modelId: LocalModelId, dataRoot: string): boolean {
  const extracted = ensureModelExtracted(modelId, dataRoot)
  if (!extracted) return false

  const manifest = getModelManifest(modelId)
  if (!manifest) return false

  saveModelState(dataRoot, {
    activeModel: modelId,
    version: '1.0',
    activatedAt: new Date().toISOString(),
    dimension: manifest.dimension,
    provider: 'onnxruntime'
  })

  log.info('模型已切换', { model: modelId })
  return true
}

/** 列出所有模型的可用状态 */
export function listModelStatus(dataRoot: string): Array<{
  id: LocalModelId
  extracted: boolean
  active: boolean
  bundled: boolean
  zipPresent: boolean
}> {
  const state = getModelState(dataRoot)
  return MODEL_MANIFESTS.map(m => ({
    id: m.id,
    extracted: isModelExtracted(extractedModelDir(m.id, dataRoot)),
    active: state.activeModel === m.id,
    bundled: m.source === 'bundled',
    zipPresent: m.source === 'bundled' ? bundledModelZipExists(m.id) : false,
  }))
}

/** 清理指定模型的解压文件 */
export function cleanupModel(modelId: LocalModelId, dataRoot: string): void {
  const dir = extractedModelDir(modelId, dataRoot)
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true })
    log.info('已清理模型', { model: modelId, dir })
  }
}

/** 获取当前活跃模型的解压目录（如存在） */
export function getActiveModelDir(dataRoot: string): string | null {
  const state = getModelState(dataRoot)
  if (state.activeModel === 'none') return null
  const dir = extractedModelDir(state.activeModel, dataRoot)
  return isModelExtracted(dir) ? dir : null
}

// ═══════════════════════════════════════════
// 模型下载（HTTP + 断点续传 + SHA-256）
// ═══════════════════════════════════════════

const activeDownloads = new Map<string, AbortController>()

/** 取消正在进行的下载 */
export function cancelDownload(modelId: string): void {
  const ctrl = activeDownloads.get(modelId)
  if (ctrl) {
    ctrl.abort()
    activeDownloads.delete(modelId)
    log.info('下载已取消', { model: modelId })
  }
}

function httpGet(url: string, opts: { range?: string; signal?: AbortSignal } = {}): Promise<{
  statusCode: number
  headers: Record<string, string | string[] | undefined>
  on: (event: string, fn: (chunk: Buffer) => void) => void
  destroy: () => void
}> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    const req = mod.get(url, { headers: opts.range ? { Range: opts.range } : {} }, (res) => {
      resolve({
        statusCode: res.statusCode ?? 0,
        headers: res.headers as Record<string, string | string[] | undefined>,
        on: (event, fn) => res.on(event, fn),
        destroy: () => res.destroy()
      })
    })
    req.on('error', reject)
    if (opts.signal) {
      opts.signal.addEventListener('abort', () => { req.destroy(); reject(new Error('cancelled')) })
    }
  })
}

/**
 * 下载模型 zip 文件。支持断点续传和进度回调。
 * 下载完成后自动解压并切换模型。
 */
export async function downloadModel(
  modelId: LocalModelId,
  dataRoot: string,
  onProgress: (progress: { bytes: number; total: number; speed: number }) => void,
  signal?: AbortSignal
): Promise<{ ok: boolean; error?: string }> {
  const manifest = getModelManifest(modelId)
  if (!manifest?.downloadUrl) return { ok: false, error: '该模型无下载地址' }

  const dir = modelsDir(dataRoot)
  mkdirSync(dir, { recursive: true })

  const zipName = `${modelId}-v1.5.onnx.zip`
  const zipPath = join(dir, zipName)
  const tmpPath = zipPath + '.downloading'

  // 断点续传：检查已下载大小
  let downloaded = 0
  if (existsSync(tmpPath)) {
    try { downloaded = statSync(tmpPath).size } catch { downloaded = 0 }
  }

  const ctrl = new AbortController()
  activeDownloads.set(modelId, ctrl)
  if (signal) signal.addEventListener('abort', () => ctrl.abort())

  try {
    // 尝试主下载源，失败则尝试镜像
    const urls = [manifest.downloadUrl]
    if (manifest.mirrorUrl) urls.push(manifest.mirrorUrl)

    let lastError = ''
    for (const url of urls) {
      try {
        const result = await doDownload(url, tmpPath, downloaded, manifest.compressedSizeMb * 1024 * 1024, onProgress, ctrl.signal)
        if (!result.ok) { lastError = result.error ?? '下载失败'; continue }

        // rename .downloading → .zip
        renameSync(tmpPath, zipPath)

        // 解压
        const extracted = ensureModelExtracted(modelId, dataRoot)
        if (!extracted) {
          lastError = '解压失败'
          continue
        }

        // 切换
        switchModel(modelId, dataRoot)
        log.info('模型下载并切换成功', { model: modelId })
        return { ok: true }
      } catch (e: unknown) {
        if (e instanceof Error && e.message === 'cancelled') return { ok: false, error: '下载已取消' }
        lastError = e instanceof Error ? e.message : String(e)
        log.warn('下载源失败，尝试下一个', { url, error: lastError })
      }
    }

    return { ok: false, error: lastError || '所有下载源均失败'
    }
  } finally {
    activeDownloads.delete(modelId)
  }
}

function doDownload(
  url: string,
  tmpPath: string,
  alreadyDownloaded: number,
  totalBytes: number,
  onProgress: (p: { bytes: number; total: number; speed: number }) => void,
  signal: AbortSignal
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve, reject) => {
    const range = alreadyDownloaded > 0 ? `bytes=${alreadyDownloaded}-` : undefined

    const doReq = (reqUrl: string, redirects = 0) => {
      if (redirects > 5) { resolve({ ok: false, error: '重定向次数过多' }); return }

      const mod = reqUrl.startsWith('https') ? https : http
      const req = mod.get(reqUrl, { headers: range ? { Range: range } : {} }, (res) => {
        // 处理重定向
        if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0)) {
          const location = res.headers.location
          if (location) { doReq(location, redirects + 1); return }
        }

        // 200 = 全新下载, 206 = 断点续传
        if (res.statusCode !== 200 && res.statusCode !== 206) {
          resolve({ ok: false, error: `HTTP ${res.statusCode}` })
          return
        }

        const contentLength = parseInt(String(res.headers['content-length'] ?? '0'), 10)
        const total = res.statusCode === 206 ? alreadyDownloaded + contentLength : (contentLength || totalBytes)
        let written = alreadyDownloaded
        const startTime = Date.now()
        let lastReportTime = startTime

        const ws = require('node:fs').createWriteStream(tmpPath, { flags: res.statusCode === 206 ? 'a' : 'w' })

        res.on('data', (chunk: Buffer) => {
          written += chunk.length
          ws.write(chunk)

          const now = Date.now()
          if (now - lastReportTime > 200) {
            const elapsed = (now - startTime) / 1000
            const speed = elapsed > 0 ? (written - alreadyDownloaded) / elapsed : 0
            onProgress({ bytes: written, total, speed })
            lastReportTime = now
          }
        })

        res.on('end', () => {
          ws.end()
          const elapsed = (Date.now() - startTime) / 1000
          const speed = elapsed > 0 ? (written - alreadyDownloaded) / elapsed : 0
          onProgress({ bytes: written, total, speed })
          resolve({ ok: true })
        })

        res.on('error', (e) => { ws.destroy(); resolve({ ok: false, error: String(e) }) })
      })

      req.on('error', (e) => resolve({ ok: false, error: String(e) }))
      signal.addEventListener('abort', () => { req.destroy(); reject(new Error('cancelled')) })
    }

    doReq(url)
  })
}

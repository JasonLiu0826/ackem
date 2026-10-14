#!/usr/bin/env node
/**
 * 开发环境 embedding 准备：下载 zip → 解压到 data/models 与 .test-cache/models
 * 与 Electron 启动时 bootstrapBundledEmbeddingModels 对齐，避免首次聊天等待解压。
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { join } from 'node:path'
import { execSync, spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { ROOT } from './ackem-env.mjs'

const MODEL_IDS = ['bge-small-zh', 'bge-small-en']

function zipName(id) {
  return `${id}-v1.5.onnx.zip`
}

function isModelDirReady(dir) {
  const onnx = join(dir, 'model.onnx')
  const tok = join(dir, 'tokenizer.json')
  if (!existsSync(onnx) || !existsSync(tok)) return false
  try {
    return statSync(onnx).size > 1_000_000
  } catch {
    return false
  }
}

function flattenExtractDir(targetDir) {
  const entries = readdirSync(targetDir)
  if (entries.length !== 1) return
  const subDir = join(targetDir, entries[0])
  try {
    if (!statSync(subDir).isDirectory()) return
    for (const entry of readdirSync(subDir)) {
      renameSync(join(subDir, entry), join(targetDir, entry))
    }
    rmSync(subDir, { recursive: true })
  } catch {
    /* ignore */
  }
}

function extractZipSync(zipPath, targetDir) {
  mkdirSync(targetDir, { recursive: true })
  if (process.platform === 'win32') {
    const z = zipPath.replace(/'/g, "''")
    const d = targetDir.replace(/'/g, "''")
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${z}' -DestinationPath '${d}' -Force"`,
      { timeout: 180_000, stdio: 'pipe' }
    )
  } else {
    execSync(`unzip -o '${zipPath}' -d '${targetDir}'`, { timeout: 180_000, stdio: 'pipe' })
  }
  flattenExtractDir(targetDir)
}

function copyDirRecursive(src, dst) {
  mkdirSync(dst, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name)
    const d = join(dst, entry.name)
    if (entry.isDirectory()) copyDirRecursive(s, d)
    else cpSync(s, d)
  }
}

function isZipReady(path) {
  if (!existsSync(path)) return false
  try {
    return statSync(path).size > 1_000_000
  } catch {
    return false
  }
}

function ensureZips() {
  const resourcesDir = join(ROOT, 'resources', 'models')
  const missing = MODEL_IDS.filter((id) => !isZipReady(join(resourcesDir, zipName(id))))
  if (missing.length === 0) return true

  console.log('[embedding] 缺少 zip，运行 prepare:embedding-models …')
  const r = spawnSync('npm', ['run', 'prepare:embedding-models'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  })
  return r.status === 0
}

function findZip(id) {
  const candidates = [
    join(ROOT, 'resources', 'models', zipName(id)),
    join(ROOT, 'data', 'models', zipName(id)),
  ]
  return candidates.find(isZipReady) ?? null
}

function ensureExtracted(id, targetDir) {
  if (isModelDirReady(targetDir)) return { ok: true, action: 'ready' }

  const cached = join(ROOT, '.test-cache', 'models', id)
  if (isModelDirReady(cached)) {
    rmSync(targetDir, { recursive: true, force: true })
    copyDirRecursive(cached, targetDir)
    return { ok: isModelDirReady(targetDir), action: 'copied-from-cache' }
  }

  const zipPath = findZip(id)
  if (!zipPath) return { ok: false, action: 'no-zip' }

  const tmp = join(ROOT, '.test-cache', 'extract', id)
  rmSync(tmp, { recursive: true, force: true })
  try {
    extractZipSync(zipPath, tmp)
    if (!isModelDirReady(tmp)) return { ok: false, action: 'extract-invalid' }

    rmSync(targetDir, { recursive: true, force: true })
    copyDirRecursive(tmp, targetDir)

    const cacheDir = join(ROOT, '.test-cache', 'models', id)
    rmSync(cacheDir, { recursive: true, force: true })
    copyDirRecursive(tmp, cacheDir)

    return { ok: isModelDirReady(targetDir), action: 'extracted' }
  } catch (e) {
    console.warn(`[embedding] 解压 ${id} 失败:`, e?.message ?? e)
    return { ok: false, action: 'extract-failed' }
  }
}

/** @returns {{ ready: string[], missing: string[], details: Record<string, string> }} */
export function prepareEmbeddingDev({ quiet = false } = {}) {
  if (!ensureZips()) {
    return { ready: [], missing: [...MODEL_IDS], details: { _zips: 'download-failed' } }
  }

  const dataModels = join(ROOT, 'data', 'models')
  mkdirSync(dataModels, { recursive: true })
  mkdirSync(join(ROOT, '.test-cache', 'models'), { recursive: true })

  const ready = []
  const missing = []
  const details = {}

  for (const id of MODEL_IDS) {
    const target = join(dataModels, id)
    const r = ensureExtracted(id, target)
    details[id] = r.action
    if (r.ok) {
      ready.push(id)
      if (!quiet) console.log(`[embedding] ${id} → ${target} (${r.action})`)
    } else {
      missing.push(id)
      if (!quiet) console.warn(`[embedding] ${id} 未就绪 (${r.action})`)
    }
  }

  return { ready, missing, details }
}

function checkOnnxRuntime() {
  try {
    const mod = join(ROOT, 'node_modules', 'onnxruntime-node')
    if (!existsSync(mod)) return false
    return true
  } catch {
    return false
  }
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  console.log('[Ackem] 准备开发环境 embedding 模型 …')
  const result = prepareEmbeddingDev()
  if (result.missing.length > 0) {
    console.error('\n[Ackem] 部分模型未就绪:', result.missing.join(', '))
    process.exit(1)
  }
  if (!checkOnnxRuntime()) {
    console.warn('[Ackem] 提示: onnxruntime-node 未安装，运行 npm install 后 embedding 才能实机推理。')
  } else {
    console.log('[Ackem] onnxruntime-node 已安装。')
  }
  console.log('[Ackem] embedding 开发环境就绪。')
}

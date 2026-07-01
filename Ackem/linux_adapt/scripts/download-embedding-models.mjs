#!/usr/bin/env node
/**
 * 下载 embedding 模型 zip 到 resources/models/（打包前执行，不依赖 vitest）
 */
import {
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { pipeline } from 'node:stream/promises'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const MODELS = [
  {
    id: 'bge-small-zh',
    urls: [
      'https://github.com/nicepkg/ackem-models/releases/download/v1.0/bge-small-zh-v1.5.onnx.zip',
      'https://gitee.com/nicepkg/ackem-models/releases/download/v1.0/bge-small-zh-v1.5.onnx.zip',
    ],
  },
  {
    id: 'bge-small-en',
    urls: [
      'https://github.com/nicepkg/ackem-models/releases/download/v1.0/bge-small-en-v1.5.onnx.zip',
      'https://gitee.com/nicepkg/ackem-models/releases/download/v1.0/bge-small-en-v1.5.onnx.zip',
    ],
  },
]

function zipName(id) {
  return `${id}-v1.5.onnx.zip`
}

function isZipReady(path) {
  if (!existsSync(path)) return false
  try {
    return statSync(path).size > 1_000_000
  } catch {
    return false
  }
}

async function downloadFile(url, dest) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
  mkdirSync(dirname(dest), { recursive: true })
  await pipeline(res.body, createWriteStream(dest))
}

async function ensureZip(id, urls, dest) {
  if (isZipReady(dest)) {
    console.log(`[ok] ${zipName(id)} already present`)
    return true
  }
  const tmp = dest + '.part'
  for (const url of urls) {
    console.log(`[download] ${id} ← ${url}`)
    try {
      rmSync(tmp, { force: true })
      await downloadFile(url, tmp)
      if (!isZipReady(tmp)) continue
      renameSync(tmp, dest)
      console.log(`[ok] saved ${dest}`)
      return true
    } catch (e) {
      console.warn(`[warn] ${url}: ${e.message}`)
    }
  }
  return false
}

function importEnvDir(envDir, resourcesDir) {
  if (!envDir || !existsSync(envDir)) return
  for (const id of MODELS.map((m) => m.id)) {
    const dest = join(resourcesDir, zipName(id))
    if (isZipReady(dest)) continue
    const from = join(envDir, zipName(id))
    if (isZipReady(from)) {
      cpSync(from, dest)
      console.log(`[ok] copied from ACKEM_EMBEDDING_MODELS_DIR → ${dest}`)
    }
  }
}

async function main() {
  const resourcesDir = join(root, 'resources', 'models')
  mkdirSync(resourcesDir, { recursive: true })

  importEnvDir(process.env.ACKEM_EMBEDDING_MODELS_DIR, resourcesDir)

  let ok = true
  for (const { id, urls } of MODELS) {
    const dest = join(resourcesDir, zipName(id))
    if (!(await ensureZip(id, urls, dest))) ok = false
  }

  if (!ok) {
    console.error('\nFailed to prepare one or more embedding zips.')
    console.error('Place files manually in resources/models/ or set ACKEM_EMBEDDING_MODELS_DIR.')
    process.exit(1)
  }
  console.log('\nAll embedding model zips ready for electron-builder extraResources.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

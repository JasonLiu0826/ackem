import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ORT_REL = join(
  'node_modules',
  'onnxruntime-node',
  'bin',
  'napi-v6',
  process.platform,
  process.arch
)

function resolveOnnxRuntimeBinDir(): string | null {
  const candidates: string[] = []

  if (app.isPackaged) {
    candidates.push(join(process.resourcesPath, 'app.asar.unpacked', ORT_REL))
  }

  const mainDir = dirname(fileURLToPath(import.meta.url))
  candidates.push(join(mainDir, '..', '..', ORT_REL))
  candidates.push(join(process.cwd(), ORT_REL))

  for (const dir of candidates) {
    if (existsSync(join(dir, 'onnxruntime_binding.node'))) return dir
  }
  return null
}

/** Windows：避免加载 System32 里旧版 onnxruntime.dll（与 1.26 绑定不兼容导致闪退） */
export function registerBundledNativeDllPaths(): void {
  if (process.platform !== 'win32') return

  const ortBin = resolveOnnxRuntimeBinDir()
  if (!ortBin) return

  try {
    app.addDllDirectory(ortBin)
  } catch {
    process.env.PATH = `${ortBin};${process.env.PATH ?? ''}`
  }
}

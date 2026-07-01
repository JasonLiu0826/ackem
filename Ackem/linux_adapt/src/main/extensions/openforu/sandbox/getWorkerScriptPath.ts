import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

let cachedWorkerPath: string | null = null

const WORKER_ENTRY_REL = join('src', 'main', 'extensions', 'openforu', 'sandbox', 'workerEntry.ts')
const PREBUILT_NAME = 'upluginSandboxWorker.js'

function moduleDir(): string {
  return dirname(fileURLToPath(import.meta.url))
}

/** 开发：主进程打进 index.js 时 import.meta.url 在 out/main，须回指源码树 */
function findWorkerEntrySource(): string {
  const dir = moduleDir()

  const besideModule = join(dir, 'workerEntry.ts')
  if (existsSync(besideModule)) return besideModule

  const prebuilt = join(dir, PREBUILT_NAME)
  if (existsSync(prebuilt)) return prebuilt

  const roots = [process.cwd(), join(process.cwd(), 'Ackem')]
  for (const root of roots) {
    const src = join(root, WORKER_ENTRY_REL)
    if (existsSync(src)) return src
  }

  throw new Error(
    `找不到 uplugin Worker 入口（曾尝试 ${join(dir, 'workerEntry.ts')} 与 */src/main/.../workerEntry.ts）。请从 Ackem 项目根目录启动 dev。`
  )
}

/** Worker 脚本路径：优先 out/main 旁预构建产物，否则 esbuild 源码到临时目录 */
export async function getWorkerScriptPath(): Promise<string> {
  if (cachedWorkerPath && existsSync(cachedWorkerPath)) {
    return cachedWorkerPath
  }

  const dir = moduleDir()
  const prebuilt = join(dir, PREBUILT_NAME)
  if (existsSync(prebuilt)) {
    cachedWorkerPath = prebuilt
    return prebuilt
  }

  const entry = findWorkerEntrySource()
  if (entry.endsWith('.js') && existsSync(entry)) {
    cachedWorkerPath = entry
    return entry
  }

  const outDir = join(tmpdir(), 'ackem-uplugin-sandbox')
  mkdirSync(outDir, { recursive: true })
  const outfile = join(outDir, `worker-${process.pid}.mjs`)

  try {
    await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile,
      packages: 'bundle',
      sourcemap: false,
      logLevel: 'silent'
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`uplugin Worker 编译失败: ${msg}`)
  }

  cachedWorkerPath = outfile
  return outfile
}

export function resetWorkerScriptCache(): void {
  cachedWorkerPath = null
}

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

/** 寮€鍙戯細涓昏繘绋嬫墦杩?index.js 鏃?import.meta.url 鍦?out/main锛岄』鍥炴寚婧愮爜鏍?*/
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
    `鎵句笉鍒?uplugin Worker 鍏ュ彛锛堟浘灏濊瘯 ${join(dir, 'workerEntry.ts')} 涓?*/src/main/.../workerEntry.ts锛夈€傝浠?Ackem 椤圭洰鏍圭洰褰曞惎鍔?dev銆俙
  )
}

/** Worker 鑴氭湰璺緞锛氫紭鍏?out/main 鏃侀鏋勫缓浜х墿锛屽惁鍒?esbuild 婧愮爜鍒颁复鏃剁洰褰?*/
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

  const outDir = join(tmpdir(), 'Ackem-uplugin-sandbox')
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
    throw new Error(`uplugin Worker 缂栬瘧澶辫触: ${msg}`)
  }

  cachedWorkerPath = outfile
  return outfile
}

export function resetWorkerScriptCache(): void {
  cachedWorkerPath = null
}

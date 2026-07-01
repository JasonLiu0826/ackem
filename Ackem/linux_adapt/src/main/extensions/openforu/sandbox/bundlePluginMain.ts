import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as esbuild from 'esbuild'

export type BundleResult =
  | { ok: true; code: string }
  | { ok: false; errors: string[] }

/** 将 uplugin main.ts 打成单文件 CJS，供 worker 内 vm 加载 */
export async function bundlePluginMainTs(pluginDir: string): Promise<BundleResult> {
  const entry = join(pluginDir, 'main.ts')
  if (!existsSync(entry)) {
    return { ok: false, errors: ['main.ts 不存在'] }
  }

  try {
    const result = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      write: false,
      packages: 'external',
      sourcemap: false,
      logLevel: 'silent'
    })
    const out = result.outputFiles?.[0]?.text
    if (!out?.trim()) {
      return { ok: false, errors: ['esbuild 未产出代码'] }
    }
    return { ok: true, code: out }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, errors: [msg] }
  }
}

export async function bundlePluginMainSource(
  mainTsSource: string,
  pluginDir: string
): Promise<BundleResult> {
  try {
    const result = await esbuild.build({
      stdin: {
        contents: mainTsSource,
        sourcefile: join(pluginDir, 'main.ts'),
        loader: 'ts'
      },
      bundle: true,
      platform: 'node',
      format: 'cjs',
      write: false,
      packages: 'external',
      absWorkingDir: pluginDir,
      sourcemap: false,
      logLevel: 'silent'
    })
    const out = result.outputFiles?.[0]?.text
    if (!out?.trim()) {
      return { ok: false, errors: ['esbuild 未产出代码'] }
    }
    return { ok: true, code: out }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, errors: [msg] }
  }
}

export function readMainTsSource(pluginDir: string): string | null {
  const entry = join(pluginDir, 'main.ts')
  if (!existsSync(entry)) return null
  return readFileSync(entry, 'utf-8')
}

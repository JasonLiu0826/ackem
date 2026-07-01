import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ExtensionLifecycleHooks } from '../../protocols'
import type { PluginManifest, PluginPermission } from '../../plugins/types'
import { createUpluginLifecycleHooks, type UpluginMeta } from '../upluginRuntime'
import { readMainTsSource } from './bundlePluginMain'
import { staticScan } from './staticScan'
import type { UpluginSandboxHost } from './upluginSandboxHost'

export type UpluginHooksResolution =
  | { ok: true; hooks: ExtensionLifecycleHooks; mode: 'worker' | 'inject' }
  | { ok: false; error: string }

/**
 * 双轨：main.ts + static + worker 优先；否则 plugin.meta injectTemplate（OF-06）。
 */
export async function resolveUpluginHooks(
  pluginDir: string,
  manifest: PluginManifest,
  meta: UpluginMeta | undefined,
  grantedPermissions: PluginPermission[],
  sandboxHost: UpluginSandboxHost
): Promise<UpluginHooksResolution> {
  const mainPath = join(pluginDir, 'main.ts')
  if (existsSync(mainPath)) {
    const source = readMainTsSource(pluginDir)
    if (!source) {
      return { ok: false, error: 'main.ts 无法读取' }
    }
    const scanErrors = staticScan(source)
    if (scanErrors.length) {
      return { ok: false, error: scanErrors.join('; ') }
    }
    try {
      const hooks = await sandboxHost.loadAndGetHooks(pluginDir, manifest, grantedPermissions)
      return { ok: true, hooks, mode: 'worker' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (meta?.injectTemplate?.trim()) {
        return {
          ok: true,
          hooks: createUpluginLifecycleHooks(manifest, meta),
          mode: 'inject'
        }
      }
      return { ok: false, error: `Worker 沙箱加载失败: ${msg}` }
    }
  }

  if (meta?.injectTemplate?.trim()) {
    return {
      ok: true,
      hooks: createUpluginLifecycleHooks(manifest, meta),
      mode: 'inject'
    }
  }

  return { ok: false, error: 'uplugin 需要 main.ts（worker）或 plugin.meta.json injectTemplate' }
}

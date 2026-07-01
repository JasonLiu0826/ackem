import vm from 'node:vm'
import type { ExtensionLifecycleHooks, EngineSnapshot } from '../../protocols'
import type { PluginSandboxApi } from '../../plugins/types'
import type { SandboxLoadContext } from './sandboxTypes'

export type WorkerRuntimeState = {
  hooks: ExtensionLifecycleHooks | null
  logs: string[]
  api: PluginSandboxApi
}

export function createWorkerSandboxApi(
  ctx: SandboxLoadContext,
  onApiRequest: (method: string, args: unknown[]) => Promise<unknown>
): PluginSandboxApi {
  const logBuffer: string[] = []

  const call = async <T>(method: string, args: unknown[]): Promise<T> => {
    return (await onApiRequest(method, args)) as T
  }

  return {
    getEngineSnapshot: () => call<EngineSnapshot | null>('getEngineSnapshot', []),
    emitEvent: (event) => {
      void call('emitEvent', [event])
    },
    readOwnFile: (relativePath) => call('readOwnFile', [relativePath]),
    writeOwnFile: (relativePath, content) => call('writeOwnFile', [relativePath, content]),
    log: (level, message) => {
      logBuffer.push(`[${level}] ${message}`)
      void call('log', [level, message])
    },
    notify: (title, body, opts) => call('notify', [title, body, opts]),
    fetch: (url, init) => call('fetch', [url, init]),
    getDataDir: () => ctx.dataDir
  }
}

/** 在 worker 内加载 CJS bundle 并实例化 factory(api) */
export function loadHooksFromBundle(
  bundledCode: string,
  api: PluginSandboxApi,
  timeoutMs: number
): ExtensionLifecycleHooks {
  const mod = { exports: {} as Record<string, unknown> }
  const sandbox: Record<string, unknown> = {
    module: mod,
    exports: mod.exports,
    require: undefined,
    process: undefined,
    global: undefined,
    globalThis: undefined,
    Buffer: undefined,
    __dirname: '',
    __filename: 'sandbox-plugin.cjs'
  }

  const script = new vm.Script(bundledCode, { filename: 'sandbox-plugin.cjs' })
  script.runInNewContext(sandbox, { timeout: timeoutMs })

  const factory = (mod.exports.default ?? mod.exports) as
    | ((api: PluginSandboxApi) => ExtensionLifecycleHooks | Promise<ExtensionLifecycleHooks>)
    | ExtensionLifecycleHooks

  if (typeof factory === 'function' && factory.length <= 1) {
    const hooks = factory(api)
    if (hooks && typeof (hooks as Promise<ExtensionLifecycleHooks>).then === 'function') {
      throw new Error('factory 不得返回 Promise（请使用 async hooks）')
    }
    return hooks as ExtensionLifecycleHooks
  }
  if (typeof factory === 'object' && factory !== null) {
    return factory as ExtensionLifecycleHooks
  }
  throw new Error('main.ts 必须 export default factory(api) 或 hooks 对象')
}

export async function probeHooks(
  hooks: ExtensionLifecycleHooks,
  timeoutMs: number
): Promise<{ ok: boolean; errors: string[] }> {
  if (!hooks.beforeUserMessage) {
    return { ok: true, errors: [] }
  }
  const minimalSnapshot = {
    totalTurns: 0,
    personality: { presetId: 'sandbox-probe' },
    emotion: { aff: 50, sec: 50, aro: 50, dom: 50, primaryLabel: 'neutral' },
    relationship: { trust: 50, stage: 'FAMILIAR' }
  }

  const run = hooks.beforeUserMessage('__sandbox_probe__', minimalSnapshot as never)
  const result = await Promise.race([
    run,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('probe 执行超时')), timeoutMs)
    )
  ])
  if (!result || !Array.isArray(result.contextInjections)) {
    return { ok: false, errors: ['beforeUserMessage 必须返回 { contextInjections: string[] }'] }
  }
  return { ok: true, errors: [] }
}

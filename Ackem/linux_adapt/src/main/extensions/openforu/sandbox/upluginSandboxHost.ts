import { Worker } from 'node:worker_threads'
import type { ExtensionLifecycleHooks, EngineSnapshot } from '../../protocols'
import type { PluginManifest, PluginPermission } from '../../plugins/types'
import { DEFAULT_SANDBOX_CONFIG, type UpluginSandboxConfig } from '../types'
import { bundlePluginMainSource, bundlePluginMainTs, readMainTsSource } from './bundlePluginMain'
import { getWorkerScriptPath } from './getWorkerScriptPath'
import { handleSandboxApiRequest, ensurePluginDataDir } from './sandboxApiBridge'
import { staticScan } from './staticScan'
import type {
  HostToWorkerMessage,
  SandboxHostDeps,
  SandboxLoadContext,
  SandboxProbeResult,
  WorkerToHostMessage
} from './sandboxTypes'

type ActiveWorker = {
  worker: Worker
  pluginId: string
  maxInvokeMs: number
  pendingInvokes: Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>
}

export class UpluginSandboxHost {
  private dataRoot: string
  private deps: SandboxHostDeps
  private workers = new Map<string, ActiveWorker>()

  constructor(dataRoot: string, deps: SandboxHostDeps = {}) {
    this.dataRoot = dataRoot
    this.deps = deps
  }

  async probe(mainTsSource: string, manifest: PluginManifest, pluginDir: string): Promise<SandboxProbeResult> {
    const start = Date.now()
    const scanErrors = staticScan(mainTsSource)
    if (scanErrors.length) {
      return { ok: false, errors: scanErrors, logs: [], durationMs: Date.now() - start }
    }

    const bundled = await bundlePluginMainSource(mainTsSource, pluginDir)
    if (!bundled.ok) {
      return { ok: false, errors: bundled.errors, logs: [], durationMs: Date.now() - start }
    }

    const context = this.buildContext(manifest, pluginDir, bundled.code, ['readonly', 'engine_read'])
    const workerPath = await getWorkerScriptPath()
    const worker = new Worker(workerPath, { workerData: {} })

    try {
      const result = await this.runProbeWorker(worker, context)
      return { ...result, durationMs: Date.now() - start }
    } finally {
      await this.stopWorkerInstance(worker)
    }
  }

  async loadAndGetHooks(
    pluginDir: string,
    manifest: PluginManifest,
    grantedPermissions: PluginPermission[],
    config: UpluginSandboxConfig = DEFAULT_SANDBOX_CONFIG
  ): Promise<ExtensionLifecycleHooks> {
    this.terminate(manifest.id)

    const source = readMainTsSource(pluginDir)
    if (!source) {
      throw new Error('main.ts 不存在')
    }
    const scanErrors = staticScan(source)
    if (scanErrors.length) {
      throw new Error(scanErrors.join('; '))
    }

    const bundled = await bundlePluginMainTs(pluginDir)
    if (!bundled.ok) {
      throw new Error(bundled.errors.join('; '))
    }

    const context = this.buildContext(manifest, pluginDir, bundled.code, grantedPermissions, config)
    const workerPath = await getWorkerScriptPath()
    const worker = new Worker(workerPath, { workerData: {} })
    const active: ActiveWorker = {
      worker,
      pluginId: manifest.id,
      maxInvokeMs: context.config.maxExecutionMs,
      pendingInvokes: new Map()
    }
    this.workers.set(manifest.id, active)

    this.attachWorkerHandlers(active, context)

    await new Promise<void>((resolve, reject) => {
      const onMessage = (msg: WorkerToHostMessage) => {
        if (msg.type === 'ready') {
          worker.off('message', onMessage)
          resolve()
        }
      }
      const onError = (err: Error) => {
        worker.off('message', onMessage)
        reject(err)
      }
      worker.on('message', onMessage)
      worker.on('error', onError)
      worker.postMessage({ type: 'init', context } satisfies HostToWorkerMessage)
    })

    return this.createProxyHooks(manifest.id)
  }

  terminate(pluginId: string): void {
    const active = this.workers.get(pluginId)
    if (!active) return
    void active.worker.postMessage({ type: 'terminate' } satisfies HostToWorkerMessage)
    void this.stopWorkerInstance(active.worker)
    this.workers.delete(pluginId)
  }

  private async dispatchApiRequest(
    active: ActiveWorker,
    context: SandboxLoadContext,
    requestId: string,
    method: string,
    args: unknown[]
  ): Promise<void> {
    try {
      const result = await handleSandboxApiRequest(
        method,
        args,
        context.pluginId,
        context.dataDir,
        context.manifest,
        context.grantedPermissions,
        this.deps
      )
      active.worker.postMessage({
        type: 'apiResponse',
        requestId,
        result
      } satisfies HostToWorkerMessage)
    } catch (err) {
      active.worker.postMessage({
        type: 'apiResponse',
        requestId,
        error: err instanceof Error ? err.message : String(err)
      } satisfies HostToWorkerMessage)
    }
  }

  private async dispatchApiRequestForWorker(
    worker: Worker,
    context: SandboxLoadContext,
    requestId: string,
    method: string,
    args: unknown[]
  ): Promise<void> {
    try {
      const result = await handleSandboxApiRequest(
        method,
        args,
        context.pluginId,
        context.dataDir,
        context.manifest,
        context.grantedPermissions,
        this.deps
      )
      worker.postMessage({
        type: 'apiResponse',
        requestId,
        result
      } satisfies HostToWorkerMessage)
    } catch (err) {
      worker.postMessage({
        type: 'apiResponse',
        requestId,
        error: err instanceof Error ? err.message : String(err)
      } satisfies HostToWorkerMessage)
    }
  }

  private buildContext(
    manifest: PluginManifest,
    pluginDir: string,
    bundledCode: string,
    grantedPermissions: PluginPermission[],
    config: UpluginSandboxConfig = DEFAULT_SANDBOX_CONFIG
  ): SandboxLoadContext {
    return {
      pluginId: manifest.id,
      pluginDir,
      dataDir: ensurePluginDataDir(this.dataRoot, manifest.id),
      manifest,
      grantedPermissions,
      config,
      bundledCode
    }
  }

  private attachWorkerHandlers(active: ActiveWorker, context: SandboxLoadContext): void {
    active.worker.on('message', (msg: WorkerToHostMessage) => {
      if (msg.type === 'apiRequest') {
        void this.dispatchApiRequest(active, context, msg.requestId, msg.method, msg.args)
        return
      }

      if (msg.type === 'invokeResult') {
        const pending = active.pendingInvokes.get(msg.requestId)
        if (!pending) return
        active.pendingInvokes.delete(msg.requestId)
        if (msg.ok) pending.resolve(msg.result)
        else pending.reject(new Error(msg.error ?? 'invoke 失败'))
      }
    })

    active.worker.on('exit', () => {
      for (const [, pending] of active.pendingInvokes) {
        pending.reject(new Error('uplugin worker 已终止（超时或崩溃）'))
      }
      active.pendingInvokes.clear()
      this.workers.delete(context.pluginId)
    })
  }

  private createProxyHooks(pluginId: string): ExtensionLifecycleHooks {
    type HookName = 'beforeUserMessage' | 'afterAssistantMessage' | 'onEngineUpdate' | 'onLoad' | 'onUnload'
    const invoke = async (hook: HookName, args: unknown[]) => {
      const active = this.workers.get(pluginId)
      if (!active) {
        throw new Error(`uplugin worker 未加载: ${pluginId}`)
      }
      const requestId = `inv-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const timeoutMs = Math.min(active.maxInvokeMs, 30_000)
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          active.pendingInvokes.delete(requestId)
          reject(new Error(`uplugin ${hook} 超时（${timeoutMs}ms）`))
        }, timeoutMs)
        active.pendingInvokes.set(requestId, {
          resolve: (v) => {
            clearTimeout(timer)
            resolve(v)
          },
          reject: (e) => {
            clearTimeout(timer)
            reject(e)
          }
        })
        active.worker.postMessage({
          type: 'invoke',
          requestId,
          hook,
          args
        } satisfies HostToWorkerMessage)
      })
    }

    return {
      onLoad: async (snapshot) => (await invoke('onLoad', [snapshot])) as { ok: boolean },
      onUnload: async () => (await invoke('onUnload', [])) as { ok: boolean },
      onEngineUpdate: async (snapshot) => (await invoke('onEngineUpdate', [snapshot])) as { ok: boolean },
      beforeUserMessage: async (userMessage, snapshot) =>
        (await invoke('beforeUserMessage', [userMessage, snapshot])) as {
          contextInjections: string[]
        },
      afterAssistantMessage: async (assistantMessage, snapshot) =>
        (await invoke('afterAssistantMessage', [assistantMessage, snapshot])) as { ok: boolean }
    }
  }

  private runProbeWorker(worker: Worker, context: SandboxLoadContext): Promise<SandboxProbeResult> {
    return new Promise((resolve, reject) => {
      const pendingApi = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

      const onMessage = (msg: WorkerToHostMessage) => {
        if (msg.type === 'apiRequest') {
          void this.dispatchApiRequestForWorker(worker, context, msg.requestId, msg.method, msg.args)
          return
        }
        if (msg.type === 'probeResult') {
          worker.off('message', onMessage)
          resolve({
            ok: msg.ok,
            errors: msg.errors,
            logs: msg.logs,
            durationMs: msg.durationMs
          })
        }
      }

      worker.on('message', onMessage)
      worker.on('error', reject)
      worker.postMessage({ type: 'probe', context } satisfies HostToWorkerMessage)
    })
  }

  private async stopWorkerInstance(worker: Worker): Promise<void> {
    try {
      await worker.terminate()
    } catch {
      // ignore
    }
  }
}

let defaultHost: UpluginSandboxHost | null = null

export function getDefaultUpluginSandboxHost(dataRoot: string, deps?: SandboxHostDeps): UpluginSandboxHost {
  if (!defaultHost) {
    defaultHost = new UpluginSandboxHost(dataRoot, deps)
  }
  return defaultHost
}

export function resetDefaultUpluginSandboxHost(): void {
  defaultHost = null
}

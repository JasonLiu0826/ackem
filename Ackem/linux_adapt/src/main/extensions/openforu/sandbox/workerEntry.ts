import { parentPort } from 'node:worker_threads'
import type { ExtensionLifecycleHooks } from '../../protocols'
import type { HostToWorkerMessage, SandboxLoadContext, WorkerToHostMessage } from './sandboxTypes'
import { createWorkerSandboxApi, loadHooksFromBundle, probeHooks } from './workerRuntime'

let hooks: ExtensionLifecycleHooks | null = null

function post(msg: WorkerToHostMessage): void {
  parentPort?.postMessage(msg)
}

const apiWaiters = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

parentPort?.on('message', async (raw: HostToWorkerMessage) => {
  if (raw.type === 'apiResponse') {
    const waiter = apiWaiters.get(raw.requestId)
    if (waiter) {
      apiWaiters.delete(raw.requestId)
      if (raw.error) waiter.reject(new Error(raw.error))
      else waiter.resolve(raw.result)
    }
    return
  }

  try {
    switch (raw.type) {
      case 'probe': {
        const start = Date.now()
        await loadContext(raw.context)
        const probe = await probeHooks(hooks!, raw.context.config.maxExecutionMs)
        post({
          type: 'probeResult',
          ok: probe.ok,
          errors: probe.errors,
          logs: [],
          durationMs: Date.now() - start
        })
        break
      }
      case 'init': {
        await loadContext(raw.context)
        post({ type: 'ready' })
        break
      }
      case 'invoke': {
        if (!hooks) {
          post({ type: 'invokeResult', requestId: raw.requestId, ok: false, error: 'worker 未初始化' })
          break
        }
        const fn = hooks[raw.hook as keyof ExtensionLifecycleHooks]
        if (typeof fn !== 'function') {
          post({
            type: 'invokeResult',
            requestId: raw.requestId,
            ok: true,
            result:
              raw.hook === 'beforeUserMessage' ? { contextInjections: [] } : { ok: true }
          })
          break
        }
        const result = await (fn as (...a: unknown[]) => Promise<unknown>).apply(hooks, raw.args)
        post({ type: 'invokeResult', requestId: raw.requestId, ok: true, result })
        break
      }
      case 'terminate':
        process.exit(0)
        break
      default:
        break
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (raw.type === 'probe') {
      post({ type: 'probeResult', ok: false, errors: [message], logs: [], durationMs: 0 })
    } else if (raw.type === 'invoke') {
      post({ type: 'invokeResult', requestId: raw.requestId, ok: false, error: message })
    }
  }
})

async function loadContext(ctx: SandboxLoadContext): Promise<void> {
  const timeoutMs = Math.min(ctx.config.maxExecutionMs, 5000)
  const api = createWorkerSandboxApi(ctx, (method, args) => {
    const requestId = `api-${Date.now()}-${Math.random().toString(36).slice(2)}`
    return new Promise((resolve, reject) => {
      apiWaiters.set(requestId, { resolve, reject })
      post({ type: 'apiRequest', requestId, method, args })
    })
  })
  hooks = loadHooksFromBundle(ctx.bundledCode, api, timeoutMs)
}

import type { PluginManifest, PluginPermission } from '../../plugins/types'
import type { EngineSnapshot, ExtensionEvent } from '../../protocols'
import type { UpluginSandboxConfig } from '../types'

export type SandboxProbeResult = {
  ok: boolean
  errors: string[]
  logs: string[]
  durationMs: number
}

export type SandboxLoadContext = {
  pluginId: string
  pluginDir: string
  dataDir: string
  manifest: PluginManifest
  grantedPermissions: PluginPermission[]
  config: UpluginSandboxConfig
  bundledCode: string
}

export type WorkerInitMessage = {
  type: 'init'
  context: SandboxLoadContext
}

export type WorkerProbeMessage = {
  type: 'probe'
  context: SandboxLoadContext
}

export type WorkerInvokeMessage = {
  type: 'invoke'
  requestId: string
  hook: 'beforeUserMessage' | 'afterAssistantMessage' | 'onEngineUpdate' | 'onLoad' | 'onUnload'
  args: unknown[]
}

export type WorkerTerminateMessage = { type: 'terminate' }

export type HostApiResponseMessage = {
  type: 'apiResponse'
  requestId: string
  result?: unknown
  error?: string
}

export type HostToWorkerMessage =
  | WorkerInitMessage
  | WorkerProbeMessage
  | WorkerInvokeMessage
  | WorkerTerminateMessage
  | HostApiResponseMessage

export type WorkerReadyMessage = { type: 'ready' }

export type WorkerProbeResultMessage = {
  type: 'probeResult'
  ok: boolean
  errors: string[]
  logs: string[]
  durationMs: number
}

export type WorkerInvokeResultMessage = {
  type: 'invokeResult'
  requestId: string
  ok: boolean
  result?: unknown
  error?: string
}

export type WorkerApiRequestMessage = {
  type: 'apiRequest'
  requestId: string
  method: string
  args: unknown[]
}

export type WorkerToHostMessage =
  | WorkerReadyMessage
  | WorkerProbeResultMessage
  | WorkerInvokeResultMessage
  | WorkerApiRequestMessage

export type SandboxHostDeps = {
  getEngineSnapshot?: () => EngineSnapshot | null
  emitEvent?: (event: ExtensionEvent) => void
  showNotification?: (opts: { title: string; body: string; silent?: boolean }) => void
  /** Notification 不可用时的 in-app toast 降级 */
  broadcastNotify?: (text: string) => void
}

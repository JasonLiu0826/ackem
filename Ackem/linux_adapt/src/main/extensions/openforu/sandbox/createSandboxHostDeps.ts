import type { EngineSnapshot, ExtensionEvent } from '../../protocols'
import type { SandboxHostDeps } from './sandboxTypes'
import { broadcastToRenderers } from '../../../rendererBroadcast'

export type CreateSandboxHostDepsInput = {
  getEngineSnapshot: () => EngineSnapshot | null
  emitEvent: (event: ExtensionEvent) => void
}

function lazyBroadcastNotify(text: string): void {
  try {
    broadcastToRenderers('openforu:notify', { text })
  } catch {
    /* vitest / headless */
  }
}

/** 主进程 uplugin 沙箱依赖（通知 · 事件队列 · 引擎快照） */
export function createSandboxHostDeps(input: CreateSandboxHostDepsInput): SandboxHostDeps {
  return {
    getEngineSnapshot: input.getEngineSnapshot,
    emitEvent: input.emitEvent,
    showNotification: ({ title, body, silent }) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { Notification } = require('electron') as typeof import('electron')
        if (Notification.isSupported()) {
          const n = new Notification({ title, body, silent: silent ?? false })
          n.show()
          return
        }
      } catch {
        /* vitest / headless */
      }
      lazyBroadcastNotify(`${title}: ${body}`)
    },
    broadcastNotify: lazyBroadcastNotify
  }
}

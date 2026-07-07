/**
 * JE-3c / OID锛欵xtension Surface 涓撶敤 preload 鈥?IR 绐?API
 */
import { contextBridge, ipcRenderer } from 'electron'

export type SurfaceContext = {
  extensionId: string
  title: string
}

type StateListener = (state: Record<string, unknown>) => void

const stateListeners = new Set<StateListener>()
let stateSubscribed = false

function ensureStateSubscription(): void {
  if (stateSubscribed) return
  stateSubscribed = true
  ipcRenderer.on('surface:state-update', (_event, state: Record<string, unknown>) => {
    for (const fn of stateListeners) {
      try {
        fn(state)
      } catch {
        /* ignore listener errors */
      }
    }
  })
}

contextBridge.exposeInMainWorld('Ackem', {
  extension: {
    getContext: (): Promise<SurfaceContext | null> =>
      ipcRenderer.invoke('surface:getContext') as Promise<SurfaceContext | null>,
    close: (): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('surface:close') as Promise<{ ok: boolean }>
  },
  surface: {
    invoke: (action: string, payload?: unknown): Promise<{ ok: boolean; state?: Record<string, unknown> }> =>
      ipcRenderer.invoke('surface:invoke', { action, data: payload }) as Promise<{
        ok: boolean
        state?: Record<string, unknown>
      }>,
    getState: (): Promise<Record<string, unknown> | null> =>
      ipcRenderer.invoke('surface:getState') as Promise<Record<string, unknown> | null>,
    subscribeState: (listener: StateListener): (() => void) => {
      ensureStateSubscription()
      stateListeners.add(listener)
      return () => {
        stateListeners.delete(listener)
      }
    }
  }
})

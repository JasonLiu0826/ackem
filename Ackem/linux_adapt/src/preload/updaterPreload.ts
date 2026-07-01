import { contextBridge, ipcRenderer } from 'electron'
import type { UpdateJob, UpdateProgressEvent } from '../shared/updateTypes'

contextBridge.exposeInMainWorld('ackemUpdater', {
  getJobPath: (): Promise<string> => ipcRenderer.invoke('updater:getJobPath'),
  readJob: (): Promise<UpdateJob> => ipcRenderer.invoke('updater:readJob'),
  start: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('updater:start'),
  launchAckem: (): Promise<void> => ipcRenderer.invoke('updater:launchAckem'),
  openRelease: (): Promise<void> => ipcRenderer.invoke('updater:openRelease'),
  quit: (): Promise<void> => ipcRenderer.invoke('updater:quit'),
  onProgress: (fn: (ev: UpdateProgressEvent) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: UpdateProgressEvent) => fn(payload)
    ipcRenderer.on('updater:progress', handler)
    return () => ipcRenderer.removeListener('updater:progress', handler)
  }
})

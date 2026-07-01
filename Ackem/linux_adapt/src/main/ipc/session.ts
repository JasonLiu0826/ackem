// [ipc/session] — 多会话 list/create/switch/delete

import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import { saveState, defaultFullState } from '../engine/state-persistence'
import { defaultPersonalitySlice } from '../personalityPresets'
import {
  currentDataRoot,
  currentSessionId,
  ensureDataLayout,
  loadSessionsFile,
  loadSettings,
  saveSessionsFile,
  saveSettings
} from './shared'

export function registerSessionIpc(): void {
  ipcMain.handle('session:list', () => {
    const root = currentDataRoot()
    ensureDataLayout(root)
    return loadSessionsFile(root)
  })

  ipcMain.handle('session:create', (_e, name: string) => {
    const root = currentDataRoot()
    ensureDataLayout(root)
    const id = `session-${Date.now()}`
    const now = new Date().toISOString()
    const sessions = loadSessionsFile(root)
    sessions.push({ id, name: name || `会话 ${sessions.length + 1}`, createdAt: now, lastActive: now })
    saveSessionsFile(root, sessions)

    const settings = loadSettings()
    const freshState = defaultFullState(defaultPersonalitySlice(settings))
    saveState(root, freshState, id)
    return { id, sessions }
  })

  ipcMain.handle('session:switch', (_e, sessionId: string) => {
    const root = currentDataRoot()
    ensureDataLayout(root)
    const sessions = loadSessionsFile(root)
    const session = sessions.find((s) => s.id === sessionId)
    if (!session) return { ok: false, error: '会话不存在' }

    const next = saveSettings({ activeSessionId: sessionId })
    session.lastActive = new Date().toISOString()
    saveSessionsFile(root, sessions)
    return { ok: true, sessionId, settings: next }
  })

  ipcMain.handle('session:delete', (_e, sessionId: string) => {
    const root = currentDataRoot()
    ensureDataLayout(root)
    let sessions = loadSessionsFile(root)
    if (sessions.length <= 1) return { ok: false, error: '至少保留一个会话' }

    sessions = sessions.filter((s) => s.id !== sessionId)
    saveSessionsFile(root, sessions)

    const statePath = join(root, 'companion', `state-${sessionId}.json`)
    try {
      if (existsSync(statePath)) rmSync(statePath)
    } catch {
      /* ignore */
    }

    return { ok: true, sessions }
  })
}

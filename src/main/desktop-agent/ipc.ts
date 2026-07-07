import { ipcMain } from 'electron'
import { broadcastToRenderers } from '../rendererBroadcast'
import {
  cancelAllDesktopAgentConfirms,
  configureDesktopAgentConfirmGate,
  resolveDesktopAgentConfirm
} from './confirm/confirmService'
import { clearDesktopAgentSessionAutoApprove, setDesktopAgentSessionAutoApprove, setTaskPlanDeleteAutoApprove } from './confirmBypass'
import {
  getDesktopAgentChatMode,
  setDesktopAgentChatMode,
  clearDesktopAgentChatModeForAllSessions
} from './sessionMode'
import { generateDesktopAgentOpening } from './opening'
import { auditLogPath } from './auditLog'
import { readFileSync, existsSync } from 'node:fs'
import {
  currentDataRoot,
  currentSessionId,
  ensureDataLayout,
  loadSettings,
  mergeEngineState
} from '../ipc/shared'
import { isDesktopAgentPipelineOpen } from '../../shared/desktopAgentFeature'
import { isDesktopAgentSettingsReady } from '../../shared/desktopAgent'
import {
  getMachineMapStatus,
  maybeRefreshMachineMap,
  scheduleMachineMapIndex
} from './machine-map/service'
import { invalidateDesktopAgentCapabilityRouteIndex } from './routing/resolveCapability'

export function registerDesktopAgentIpc(): void {
  configureDesktopAgentConfirmGate((channel, payload) => {
    broadcastToRenderers(channel, payload)
  })

  ipcMain.handle('desktop-agent:confirm:allow', (_e, args: { requestId: string }) => {
    return resolveDesktopAgentConfirm(args.requestId, 'allowed')
  })

  ipcMain.handle('desktop-agent:confirm:allowSession', (_e, args: { requestId: string; sessionId?: string }) => {
    const root = currentDataRoot()
    const sid = args.sessionId || currentSessionId()
    setDesktopAgentSessionAutoApprove(root, sid)
    return resolveDesktopAgentConfirm(args.requestId, 'allowed')
  })

  ipcMain.handle('desktop-agent:confirm:deny', (_e, args: { requestId: string }) => {
    return resolveDesktopAgentConfirm(args.requestId, 'denied')
  })

  ipcMain.handle(
    'desktop-agent:confirm:allowTaskDeletes',
    (_e, args: { requestId: string; taskPlanId: string }) => {
      if (args.taskPlanId) setTaskPlanDeleteAutoApprove(args.taskPlanId)
      return resolveDesktopAgentConfirm(args.requestId, 'allowed')
    }
  )

  ipcMain.handle('desktop-agent:sessionMode:get', (_e, sessionId?: string) => {
    const root = currentDataRoot()
    const sid = sessionId || currentSessionId()
    if (!isDesktopAgentPipelineOpen()) {
      return { enabled: false, settingsReady: false, previewOnly: true }
    }
    const settings = loadSettings()
    if (!isDesktopAgentSettingsReady(settings)) {
      return { enabled: false, settingsReady: false, previewOnly: false }
    }
    return {
      enabled: getDesktopAgentChatMode(root, sid),
      settingsReady: true,
      previewOnly: false
    }
  })

  ipcMain.handle('desktop-agent:sessionMode:set', (_e, args: { sessionId: string; enabled: boolean }) => {
    if (!isDesktopAgentPipelineOpen()) {
      return { ok: false, error: '鐢佃剳鍔╂墜鍔熻兘灏氭湭寮€鏀撅紝鏁鏈熷緟' }
    }
    const root = currentDataRoot()
    ensureDataLayout(root)
    const settings = loadSettings()
    if (!isDesktopAgentSettingsReady(settings)) {
      return { ok: false, error: '璇峰厛鍦ㄨ缃腑鍚敤鐢佃剳鍔╂墜骞剁‘璁ら闄? }
    }
    if (!args.enabled) {
      cancelAllDesktopAgentConfirms('denied')
      clearDesktopAgentSessionAutoApprove(root, args.sessionId)
    } else {
      maybeRefreshMachineMap(root, 'chat_mode_enable')
    }
    const enabled = setDesktopAgentChatMode(root, args.sessionId, args.enabled)
    return { ok: true, enabled }
  })

  ipcMain.handle('desktop-agent:opening', async () => {
    const settings = loadSettings()
    if (!isDesktopAgentSettingsReady(settings)) {
      return { ok: false, error: '鐢佃剳鍔╂墜鏈惎鐢? }
    }
    const root = currentDataRoot()
    const state = mergeEngineState(root, settings)
    const text = await generateDesktopAgentOpening({
      settings,
      state,
      companionName: settings.companionName || 'Ackem'
    })
    return { ok: true, text }
  })

  ipcMain.handle('desktop-agent:audit:recent', (_e, limit = 50) => {
    const path = auditLogPath(currentDataRoot())
    if (!existsSync(path)) return []
    const lines = readFileSync(path, 'utf-8').trim().split('\n').filter(Boolean)
    return lines.slice(-Math.max(1, Math.min(200, Number(limit) || 50))).map((line) => {
      try {
        return JSON.parse(line) as unknown
      } catch {
        return { raw: line }
      }
    })
  })

  ipcMain.handle('machine-map:status', () => {
    return getMachineMapStatus(currentDataRoot())
  })

  ipcMain.handle('machine-map:reindex', () => {
    const root = currentDataRoot()
    scheduleMachineMapIndex(root, 'manual')
    return { ok: true }
  })
}

export function onDesktopAgentSettingsSaved(
  dataRoot: string,
  prev: ReturnType<typeof loadSettings>,
  next: ReturnType<typeof loadSettings>
): void {
  if (isDesktopAgentSettingsReady(prev) && !isDesktopAgentSettingsReady(next)) {
    clearDesktopAgentChatModeForAllSessions(dataRoot)
    clearDesktopAgentSessionAutoApprove(dataRoot)
    cancelAllDesktopAgentConfirms('denied')
  }

  const becameReady = !isDesktopAgentSettingsReady(prev) && isDesktopAgentSettingsReady(next)
  if (becameReady) {
    scheduleMachineMapIndex(dataRoot, 'settings_enable')
  } else if (isDesktopAgentSettingsReady(next)) {
    maybeRefreshMachineMap(dataRoot, 'settings_save')
  }
  invalidateDesktopAgentCapabilityRouteIndex(dataRoot)
}

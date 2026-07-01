// [ipcDesktopCompanion] — 桌面陪伴 IPC 处理器
// 职责：时间感知、在场状态、主动消息、配置管理

import { ipcMain, Notification } from 'electron'
import { createLogger } from '../../../../logger'
import { getTimeContext, formatTimeContextBlock, DesktopCompanion, DEFAULT_PROACTIVE_CONFIG } from './desktop-companion'
import type { ProactiveMessageConfig, PresenceState, TimeContext, TimeOfDay } from './desktop-companion'

const log = createLogger('ipc-desktop-companion')

let companionInstance: DesktopCompanion | null = null

export function setCompanionInstance(c: DesktopCompanion): void {
  companionInstance = c
}

export function registerDesktopCompanionIpc(): void {
  // 获取当前时段上下文
  ipcMain.handle('companion:timeContext', () => {
    return getTimeContext()
  })

  // 获取在场状态
  ipcMain.handle('companion:presence', () => {
    if (!companionInstance) {
      return { mode: 'active', lastInteractionMs: Date.now(), idleDurationMs: 0, timeOfDay: getTimeContext().timeOfDay } as PresenceState
    }
    return companionInstance.getPresence()
  })

  // 用户交互通知（UI 中点击/输入时调用）
  ipcMain.handle('companion:touch', () => {
    companionInstance?.touch()
    return { ok: true }
  })

  // 获取陪伴状态文本
  ipcMain.handle('companion:statusText', () => {
    if (!companionInstance) return '在你身边'
    return companionInstance.getCompanionStatusText()
  })

  // 获取配置
  ipcMain.handle('companion:getConfig', () => {
    if (!companionInstance) return { ...DEFAULT_PROACTIVE_CONFIG }
    return companionInstance.getConfig()
  })

  // 更新配置
  ipcMain.handle('companion:setConfig', (_e, patch: Partial<ProactiveMessageConfig>) => {
    companionInstance?.updateConfig(patch)
    log.info('config updated', patch)
    return { ok: true }
  })

  // 手动触发主动消息生成（用于测试/调试）
  ipcMain.handle('companion:tryProactive', async (_e, relationship: import('../../../../engine/types').L1State, emotion: import('../../../../engine/types').EmotionState) => {
    if (!companionInstance) return null
    return await companionInstance.tryGenerateProactive(relationship, emotion)
  })

  // 发送桌面通知
  ipcMain.handle('companion:notify', (_e, title: string, body: string) => {
    try {
      const n = new Notification({ title, body, silent: false })
      n.show()
      return { ok: true }
    } catch (e) {
      log.error('notification failed', e)
      return { ok: false, error: String(e) }
    }
  })
}

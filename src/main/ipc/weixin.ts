import { ipcMain } from 'electron'
import { isEmbeddingReadyForChat } from '../embedding/embeddingReadiness'
import { loadSettings, saveSettings } from '../settings'
import { resolveDataRoot } from '../paths'
import {
  disconnectWeixin,
  pollWeixinLogin,
  startWeixinLogin
} from '../channels/weixin/auth'
import {
  getWeixinChannelStatus,
  onWeixinAccountSaved,
  applyWeixinProactiveEnabled,
  restartWeixinChannelIfNeeded,
  setWeixinChannelEnabled,
  startWeixinChannel,
  stopWeixinChannel
} from '../channels/weixin/index'
import {
  loadWeixinAccount,
  setPendingWeixinBoundAgent,
  setWeixinBoundAgent
} from '../channels/weixin/store'
import { PRIMARY_AGENT_ID } from '../social/agents/agentPaths'
import { broadcastToRenderers } from '../rendererBroadcast'

function normalizeAgentId(raw?: string): string {
  const t = typeof raw === 'string' ? raw.trim() : ''
  return t.length > 0 ? t : PRIMARY_AGENT_ID
}

function finalizeWeixinLogin(dataRoot: string, result: Awaited<ReturnType<typeof pollWeixinLogin>>) {
  if (result.ok && result.account) {
    onWeixinAccountSaved(dataRoot, result.account)
    const settings = saveSettings({ weixinChannelEnabled: true })
    setWeixinChannelEnabled(true)
    return settings
  }
  return loadSettings()
}

export function registerWeixinIpc(): void {
  ipcMain.handle('weixin:getStatus', () => {
    const root = resolveDataRoot(loadSettings())
    return {
      ...getWeixinChannelStatus(root),
      embeddingReady: isEmbeddingReadyForChat()
    }
  })

  ipcMain.handle('weixin:startLogin', async (_e, args?: { agentId?: string }) => {
    const root = resolveDataRoot(loadSettings())
    const agentId = normalizeAgentId(args?.agentId)
    setPendingWeixinBoundAgent(root, agentId)
    return startWeixinLogin(root)
  })

  ipcMain.handle(
    'weixin:pollLogin',
    async (_e, args: { qrcode: string; verifyCode?: string; baseUrl?: string }) => {
      const root = resolveDataRoot(loadSettings())
      const result = await pollWeixinLogin(root, args.qrcode, args.verifyCode, args.baseUrl)
      finalizeWeixinLogin(root, result)
      return result
    }
  )

  ipcMain.handle('weixin:submitVerifyCode', async (_e, args: { qrcode: string; verifyCode: string }) => {
    const root = resolveDataRoot(loadSettings())
    const result = await pollWeixinLogin(root, args.qrcode, args.verifyCode)
    finalizeWeixinLogin(root, result)
    return result
  })

  ipcMain.handle('weixin:setBoundAgent', async (_e, args: { agentId?: string }) => {
    const root = resolveDataRoot(loadSettings())
    const agentId = normalizeAgentId(args?.agentId)
    setWeixinBoundAgent(root, agentId)
    const status = {
      ...getWeixinChannelStatus(root),
      embeddingReady: isEmbeddingReadyForChat()
    }
    broadcastToRenderers('weixin:status-changed', status)
    return status
  })

  ipcMain.handle('weixin:disconnect', async () => {
    const root = resolveDataRoot(loadSettings())
    await stopWeixinChannel(root)
    disconnectWeixin(root)
    saveSettings({ weixinChannelEnabled: false })
    setWeixinChannelEnabled(false)
    return { ok: true }
  })

  ipcMain.handle('weixin:setEnabled', async (_e, enabled: boolean) => {
    const settings = saveSettings({ weixinChannelEnabled: enabled })
    setWeixinChannelEnabled(enabled)
    const root = resolveDataRoot(settings)
    if (enabled && loadWeixinAccount(root)) {
      await startWeixinChannel(root)
    } else {
      await stopWeixinChannel(root)
    }
    return getWeixinChannelStatus(root)
  })

  ipcMain.handle('weixin:setProactiveEnabled', async (_e, enabled: boolean) => {
    const settings = saveSettings({ weixinProactiveEnabled: enabled })
    const root = resolveDataRoot(settings)
    applyWeixinProactiveEnabled(root, enabled)
    return getWeixinChannelStatus(root)
  })

  ipcMain.handle('weixin:restart', async () => {
    await restartWeixinChannelIfNeeded()
    const root = resolveDataRoot(loadSettings())
    return getWeixinChannelStatus(root)
  })
}

export async function bootWeixinChannelOnReady(): Promise<void> {
  const settings = loadSettings()
  const root = resolveDataRoot(settings)
  const account = loadWeixinAccount(root)
  if (!account) return

  // 已绑定账号时默认开启监听（除非用户显式关闭）
  const enabled = settings.weixinChannelEnabled !== false
  setWeixinChannelEnabled(enabled)
  if (!enabled) return

  await startWeixinChannel(root)
}

export async function shutdownWeixinChannel(): Promise<void> {
  const root = resolveDataRoot(loadSettings())
  await stopWeixinChannel(root)
}

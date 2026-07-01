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
  markWeixinTokenExpired,
  onWeixinAccountSaved,
  applyWeixinProactiveEnabled,
  restartWeixinChannelIfNeeded,
  setWeixinChannelEnabled,
  startWeixinChannel,
  stopWeixinChannel
} from '../channels/weixin/index'
import { loadWeixinAccount } from '../channels/weixin/store'

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

  ipcMain.handle('weixin:startLogin', async () => {
    const root = resolveDataRoot(loadSettings())
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

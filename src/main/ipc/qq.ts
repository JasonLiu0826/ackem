// [qq] — QQ 渠道 IPC
//
// 与 ipc/weixin.ts 的差别：
// - 登录仍发生在 NapCat 侧，但设置页可以通过 NapCat WebUI 接口直接取登录二维码
//   （qq:login:*），不用再打开浏览器进 6099 后台
// - 增加 probe 接口，设置页可以反复点「测试连接」而不影响已运行的监听

import { ipcMain } from 'electron'
import { isEmbeddingReadyForChat } from '../embedding/embeddingReadiness'
import { loadSettings, saveSettings } from '../settings'
import { resolveDataRoot } from '../paths'
import { probeQqConnection, type QqConnectionInput } from '../channels/qq/auth'
import { loadQqWebuiConfig, saveQqWebuiConfig } from '../channels/qq/webuiConfig'
import { pollQqLogin, refreshQqLogin, startQqLogin } from '../channels/qq/loginQr'
import {
  getQqChannelStatus,
  onQqAccountSaved,
  restartQqChannelIfNeeded,
  setQqChannelEnabled,
  startQqChannel,
  stopQqChannel
} from '../channels/qq/index'
import { clearQqAccount, loadQqAccount, saveQqAccount } from '../channels/qq/store'
import { ONEBOT_DEFAULT_HTTP_BASE, ONEBOT_DEFAULT_WS_URL } from '../channels/qq/types'
import { startQzoneAutomation, stopQzoneAutomation } from '../channels/qq/qzone'
import { startQqProactiveScheduler, stopQqProactiveScheduler } from '../channels/qq/proactive'
import { getQqClient } from '../channels/qq/index'

/**
 * 主动搭话调度：只在有账号 + 有活连接时挂上。tick 内部每次重新读设置，
 * 所以开关变化不需要重启调度器。
 */
function syncQqProactiveScheduler(root: string): void {
  const account = loadQqAccount(root)
  const client = getQqClient()
  if (!account || !client) {
    stopQqProactiveScheduler()
    return
  }
  startQqProactiveScheduler(() => {
    const liveClient = getQqClient()
    const liveAccount = loadQqAccount(root)
    if (!liveClient || !liveAccount) return null
    return { client: liveClient, dataRoot: root, selfId: liveAccount.selfId }
  })
}

export function registerQqIpc(): void {
  ipcMain.handle('qq:getStatus', () => {
    const root = resolveDataRoot(loadSettings())
    return {
      ...getQqChannelStatus(root),
      embeddingReady: isEmbeddingReadyForChat()
    }
  })

  /** 只探测，不落盘、不影响正在运行的监听 */
  ipcMain.handle('qq:probe', async (_e, input: QqConnectionInput) => {
    // 设置页的 token 框不回显：留空时沿用已保存的 token，否则重启后「测试连接」会误报
    const root = resolveDataRoot(loadSettings())
    const existing = loadQqAccount(root)
    const typedToken = input.accessToken?.trim()
    return probeQqConnection({
      ...input,
      accessToken: typedToken || existing?.accessToken
    })
  })

  /** 保存连接参数并启动监听 */
  ipcMain.handle('qq:connect', async (_e, input: QqConnectionInput) => {
    const root = resolveDataRoot(loadSettings())
    // token 输入框不回显明文；留空表示沿用已保存的 token，而不是把它清掉
    const existing = loadQqAccount(root)
    const typedToken = input.accessToken?.trim()
    const accessToken = typedToken || existing?.accessToken || undefined

    const probe = await probeQqConnection({ ...input, accessToken })
    if (!probe.ok) return { ok: false as const, error: probe.error }

    const account = {
      selfId: probe.selfId,
      nickname: probe.nickname,
      // 与 normalizeQqConnection 保持一致：留空时落默认 3001，而不是存空串
      httpBaseUrl: ((input.httpBaseUrl ?? '').trim() || ONEBOT_DEFAULT_HTTP_BASE).replace(/\/+$/, ''),
      wsUrl: (input.wsUrl ?? '').trim() || ONEBOT_DEFAULT_WS_URL,
      accessToken
    }
    saveQqAccount(root, account)
    // 先打开全局开关再启动监听：如果之前是关闭状态，startQqChannel 会被 enabled=false 直接挡掉
    const settings = saveSettings({ qqChannelEnabled: true })
    setQqChannelEnabled(true)
    onQqAccountSaved(root, account)
    syncQqProactiveScheduler(root)
    return { ok: true as const, settings, status: getQqChannelStatus(root) }
  })

  ipcMain.handle('qq:disconnect', async () => {
    const root = resolveDataRoot(loadSettings())
    await stopQqChannel(root)
    stopQzoneAutomation()
    stopQqProactiveScheduler()
    clearQqAccount(root)
    saveSettings({ qqChannelEnabled: false })
    setQqChannelEnabled(false)
    return { ok: true, status: getQqChannelStatus(root) }
  })

  ipcMain.handle('qq:setEnabled', async (_e, enabled: boolean) => {
    const settings = saveSettings({ qqChannelEnabled: enabled })
    setQqChannelEnabled(enabled)
    const root = resolveDataRoot(settings)
    if (enabled && loadQqAccount(root)) {
      await startQqChannel(root)
      startQzoneAutomation()
      syncQqProactiveScheduler(root)
    } else {
      await stopQqChannel(root)
      stopQzoneAutomation()
      stopQqProactiveScheduler()
    }
    return getQqChannelStatus(root)
  })

  ipcMain.handle('qq:restart', async () => {
    await restartQqChannelIfNeeded()
    const root = resolveDataRoot(loadSettings())
    return getQqChannelStatus(root)
  })

  /** 好友列表：用于设置页预览「她认识谁」，也便于排查账号是否正常 */
  ipcMain.handle('qq:listFriends', async () => {
    const root = resolveDataRoot(loadSettings())
    const account = loadQqAccount(root)
    if (!account) return { ok: false as const, error: '未配置 QQ 连接' }
    const { buildQqClient } = await import('../channels/qq/auth')
    const client = buildQqClient(account)
    const res = await client.call<Array<{ user_id?: number; nickname?: string; remark?: string }>>(
      'get_friend_list',
      {},
      10_000
    )
    if (!res.ok) return { ok: false as const, error: res.error }
    const list = (res.data ?? []).map((f) => ({
      userId: String(f.user_id ?? ''),
      nickname: f.remark || f.nickname || String(f.user_id ?? '')
    }))
    return { ok: true as const, friends: list }
  })

  /** 读取 WebUI 连接配置（令牌只回传「是否已保存」，不把明文送回渲染进程） */
  ipcMain.handle('qq:webui:get', () => {
    const root = resolveDataRoot(loadSettings())
    const cfg = loadQqWebuiConfig(root)
    return { baseUrl: cfg.baseUrl, hasToken: Boolean(cfg.token) }
  })

  /** 一键生成登录二维码：保存 WebUI 配置 → 向 NapCat 要二维码 */
  ipcMain.handle(
    'qq:login:start',
    async (_e, input: { baseUrl?: string; token?: string; totpCode?: string } = {}) => {
      const root = resolveDataRoot(loadSettings())
      let cfg
      try {
        cfg = saveQqWebuiConfig(root, { baseUrl: input.baseUrl, token: input.token })
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : String(error)
        }
      }
      if (!cfg.token) {
        return {
          ok: false as const,
          error: '先填 NapCat WebUI 令牌（WEBUI_TOKEN），再生成二维码'
        }
      }
      return startQqLogin(cfg, input.totpCode)
    }
  )

  /** 轮询扫码状态（等待扫码 / 已扫码待确认 / 登录成功） */
  ipcMain.handle('qq:login:poll', async () => {
    const cfg = loadQqWebuiConfig(resolveDataRoot(loadSettings()))
    if (!cfg.token) {
      return { ok: false as const, error: '还没保存 NapCat WebUI 令牌，请先生成二维码' }
    }
    return pollQqLogin(cfg)
  })

  /** 刷新二维码（过期或 NapCat 被踢后重启登录服务） */
  ipcMain.handle('qq:login:refresh', async () => {
    const cfg = loadQqWebuiConfig(resolveDataRoot(loadSettings()))
    if (!cfg.token) {
      return { ok: false as const, error: '还没保存 NapCat WebUI 令牌，请先生成二维码' }
    }
    return refreshQqLogin(cfg)
  })
}

export async function bootQqChannelOnReady(): Promise<void> {
  const settings = loadSettings()
  const root = resolveDataRoot(settings)
  const account = loadQqAccount(root)
  if (!account) return

  // 已绑定账号时默认开启监听（除非用户显式关闭）
  const enabled = settings.qqChannelEnabled !== false
  setQqChannelEnabled(enabled)
  if (!enabled) return

  await startQqChannel(root)
  // 空间自主发表与主动搭话随 QQ 通道一起起停；通道没连上时 tick 会自动跳过
  startQzoneAutomation()
  syncQqProactiveScheduler(root)
}

export async function shutdownQqChannel(): Promise<void> {
  stopQqProactiveScheduler()
  stopQzoneAutomation()
  const root = resolveDataRoot(loadSettings())
  await stopQqChannel(root)
}

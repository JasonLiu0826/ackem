// [qq/qzone] — QQ 空间自主发表（生命周期 / 状态 / 手动发表）
//
// 一条主线：定时 tick → 判断该不该发（scheduler 纯函数）→ 生成文案（composer）
// → 走 OneBot 扩展动作发表（actions）→ 落库 + 广播状态 + 可选在 QQ 里提一句。
//
// 安全默认（对齐大肥鱼「总开关关、试运行开」）：
// - qzoneAutoEnabled 默认 false
// - qzoneDryRun 默认 true：只在本地生成并记录，不真正发到空间
// - 协议后端不支持空间动作时明确报错，不静默失败

import { readFileSync } from 'node:fs'
import type { AppSettings } from '../../../settings'
import { loadSettings } from '../../../settings'
import { resolveDataRoot } from '../../../paths'
import { createLogger } from '../../../logger'
import { broadcastToRenderers } from '../../../rendererBroadcast'
import { loadQqAccount, listQqPeers } from '../store'
import { loadState } from '../../../engine/state-persistence'
import { getQqClient } from '../index'
import { buildQqClient } from '../auth'
import { emotionToMemeMood, memeLibraryStats, pickMeme } from '../memes'
import { QzoneActions } from './actions'
import { composeQzonePost } from './composer'
import { runQzoneInteraction } from './interact'
import {
  computeNextInteractAt,
  computeNextPublishAt,
  QZONE_TICK_MS,
  decideQzonePublish,
  localDateKey
} from './scheduler'
import {
  deleteQzonePost as deletePostRow,
  getQzonePost,
  insertQzonePost,
  listQzonePosts,
  loadQzonePlan,
  saveQzonePlan
} from './store'
import {
  QZONE_MAX_TEXT,
  QZONE_UGC_RIGHT,
  type QzoneCapabilities,
  type QzoneDraft,
  type QzoneInteractionSummary,
  type QzonePostRow,
  type QzonePublishInput,
  type QzonePublishResult,
  type QzoneStatus
} from './types'

const log = createLogger('qq-qzone')

const CAPS_TTL_MS = 10 * 60_000
const MEME_MAX_BYTES = 2 * 1024 * 1024

let tickTimer: ReturnType<typeof setTimeout> | null = null
let ticking = false
let capsCache: { selfId: string; at: number; caps: QzoneCapabilities } | null = null
let lastError: string | null = null

type QzoneContext = {
  settings: AppSettings
  root: string
  selfId: string
  client: NonNullable<ReturnType<typeof getQqClient>>
  /** true = 用的是正在监听的连接；false = 临时建的（只有 HTTP 或临时 WS） */
  live: boolean
}

/**
 * 自动发表必须走正在监听的连接（说明通道是活的）；
 * 手动发表 / 探测允许临时建一个只走 HTTP 的客户端，这样即使通道被临时关掉也能手动发一条。
 */
function resolveContext(
  requireLive = true
): { ok: true; ctx: QzoneContext } | { ok: false; error: string } {
  const settings = loadSettings()
  const root = resolveDataRoot(settings)
  const account = loadQqAccount(root)
  if (!account?.selfId) return { ok: false, error: '还没绑定 QQ，先在「协议端连接」里连上再发说说。' }
  const live = getQqClient()
  if (live) return { ok: true, ctx: { settings, root, selfId: account.selfId, client: live, live: true } }
  if (requireLive) return { ok: false, error: 'QQ 通道没有在监听，先启用通道。' }
  return {
    ok: true,
    ctx: { settings, root, selfId: account.selfId, client: buildQqClient(account), live: false }
  }
}

function emptyCaps(error?: string): QzoneCapabilities {
  return {
    publish: false,
    list: false,
    feeds: false,
    like: false,
    comment: false,
    delete: false,
    ...(error ? { error } : {})
  }
}

function currentCaps(selfId: string): QzoneCapabilities {
  if (capsCache && capsCache.selfId === selfId && Date.now() - capsCache.at < CAPS_TTL_MS) {
    return capsCache.caps
  }
  return emptyCaps('还没探测过空间接口，点「检测空间接口」。')
}

async function ensureCaps(ctx: QzoneContext): Promise<QzoneCapabilities> {
  const cached = capsCache
  if (cached && cached.selfId === ctx.selfId && Date.now() - cached.at < CAPS_TTL_MS) {
    return cached.caps
  }
  const caps = await new QzoneActions(ctx.client, ctx.selfId).probe()
  capsCache = { selfId: ctx.selfId, at: Date.now(), caps }
  return caps
}

function memeBase64Uri(path: string): string | null {
  try {
    const buf = readFileSync(path)
    if (!buf.byteLength || buf.byteLength > MEME_MAX_BYTES) return null
    return `base64://${buf.toString('base64')}`
  } catch {
    return null
  }
}

function updatePlanAfterPublish(root: string, settings: AppSettings, selfId: string, now: Date): void {
  const plan = loadQzonePlan(root, selfId)
  const today = localDateKey(now)
  const count = plan.dailyDate === today ? plan.dailyCount : 0
  saveQzonePlan(root, {
    selfId,
    dailyDate: today,
    dailyCount: count + 1,
    lastPublishAt: now.toISOString(),
    nextPublishAt: computeNextPublishAt(settings, now),
    nextInteractAt: plan.nextInteractAt ?? computeNextInteractAt(now)
  })
}

function scheduleRetry(root: string, selfId: string, now: Date, delayMs = 30 * 60_000): void {
  const plan = loadQzonePlan(root, selfId)
  saveQzonePlan(root, {
    ...plan,
    nextPublishAt: new Date(now.getTime() + delayMs).toISOString()
  })
}

function maybeSyncToChat(root: string, settings: AppSettings, text: string): void {
  if (!settings.qzoneSyncToChat) return
  const client = getQqClient()
  const peer = listQqPeers(root, 1)[0]
  if (!client || !peer?.peerId) return
  const preview = text.length > 26 ? `${text.slice(0, 26)}…` : text
  void client
    .sendPrivateMessage(peer.peerId, [
      { type: 'text', data: { text: `我刚在空间发了条说说：「${preview}」` } }
    ])
    .then((res) => {
      if (!res.ok) log.warn('qzone sync to chat failed', { error: res.error })
    })
}

function broadcastStatus(root: string): void {
  try {
    broadcastToRenderers('qzone:status-changed', getQzoneStatus(root))
  } catch {
    /* 渲染器可能还没就绪 */
  }
}

export function getQzoneStatus(dataRoot?: string): QzoneStatus {
  const settings = loadSettings()
  const root = dataRoot ?? resolveDataRoot(settings)
  const account = loadQqAccount(root)
  const selfId = account?.selfId ?? ''
  const plan = selfId ? loadQzonePlan(root, selfId) : null
  const today = localDateKey(new Date())
  const dailyCount = plan && plan.dailyDate === today ? plan.dailyCount : 0
  let memeCount = 0
  try {
    memeCount = memeLibraryStats(root).total
  } catch {
    memeCount = 0
  }

  return {
    connected: Boolean(account?.httpBaseUrl),
    selfId: account?.selfId || undefined,
    nickname: account?.nickname,
    enabled: settings.qzoneAutoEnabled === true,
    dryRun: settings.qzoneDryRun !== false,
    dailyLimit: Math.max(0, Math.trunc(settings.qzoneDailyLimit ?? 2)),
    dailyCount,
    minIntervalMinutes: Math.max(1, Math.trunc(settings.qzoneMinIntervalMinutes ?? 150)),
    activeHours: {
      start: Math.min(23, Math.max(0, Math.trunc(settings.qzoneActiveStartHour ?? 9))),
      end: Math.min(23, Math.max(0, Math.trunc(settings.qzoneActiveEndHour ?? 23)))
    },
    visibility: settings.qzoneVisibility ?? 'public',
    style: settings.qzoneStyle ?? 'auto',
    withImage: settings.qzoneWithImage === true,
    syncToChat: settings.qzoneSyncToChat === true,
    interactEnabled: settings.qzoneInteractEnabled === true,
    likeProb: settings.qzoneLikeProb ?? 0.25,
    commentProb: settings.qzoneCommentProb ?? 0.05,
    nextPublishAt: plan?.nextPublishAt ?? null,
    lastPublishedAt: plan?.lastPublishAt ?? null,
    caps: selfId ? currentCaps(selfId) : emptyCaps('还没绑定 QQ'),
    memeCount,
    lastError
  }
}

export async function probeQzone(): Promise<QzoneCapabilities> {
  const resolved = resolveContext(false)
  if (!resolved.ok) return emptyCaps(resolved.error)
  const ctx = resolved.ctx
  // 通道没在监听时临时起一条连接：只开 HTTP 端口的后端也能探测到
  if (!ctx.live) ctx.client.start()
  let caps: QzoneCapabilities
  try {
    if (!ctx.live) {
      for (let i = 0; i < 15 && !ctx.client.isConnected(); i += 1) {
        await new Promise((r) => setTimeout(r, 200))
      }
    }
    caps = await new QzoneActions(ctx.client, ctx.selfId).probe()
  } finally {
    if (!ctx.live) ctx.client.stop()
  }
  capsCache = { selfId: ctx.selfId, at: Date.now(), caps }
  lastError = caps.error ?? null
  broadcastStatus(ctx.root)
  return caps
}

export async function composeQzoneDraftNow(style?: AppSettings['qzoneStyle']): Promise<
  { ok: true; draft: QzoneDraft } | { ok: false; error: string }
> {
  const resolved = resolveContext(false)
  if (!resolved.ok) return { ok: false, error: resolved.error }
  const { ctx } = resolved
  const draft = await composeQzonePost({
    dataRoot: ctx.root,
    settings: ctx.settings,
    selfId: ctx.selfId,
    ...(style ? { style } : {})
  })
  if (!draft) return { ok: false, error: '这次没写出来，再点一次试试。' }
  return { ok: true, draft }
}

/** 手动发表：跳过节奏调度，但仍记录历史与今日计数 */
export async function publishQzoneNow(input: QzonePublishInput): Promise<QzonePublishResult> {
  const resolved = resolveContext(false)
  if (!resolved.ok) return { ok: false, error: resolved.error }
  const { ctx } = resolved
  const text = (input.content ?? '').trim()
  if (!text) return { ok: false, error: '说说内容是空的。' }
  if (text.length > QZONE_MAX_TEXT) {
    return { ok: false, error: `正文太长（${text.length} 字），上限 ${QZONE_MAX_TEXT} 字。` }
  }

  const visibility = input.visibility ?? ctx.settings.qzoneVisibility ?? 'public'
  const ugcRight = QZONE_UGC_RIGHT[visibility] ?? QZONE_UGC_RIGHT.public
  const dryRun = input.dryRun ?? ctx.settings.qzoneDryRun !== false
  const withImage = input.withImage ?? ctx.settings.qzoneWithImage === true
  const source = input.source ?? 'manual'
  const now = new Date()

  const images: string[] = []
  if (withImage) {
    const state = loadState(ctx.root, ctx.settings.activeSessionId || 'default')
    const mood = emotionToMemeMood(state?.emotion.aro ?? 0, state?.emotion.aff ?? 0, text)
    const meme = pickMeme({ dataRoot: ctx.root, mood })
    const uri = meme ? memeBase64Uri(meme.path) : null
    if (uri) images.push(uri)
  }

  if (dryRun) {
    const post = insertQzonePost(ctx.root, {
      selfId: ctx.selfId,
      content: text,
      imageCount: images.length,
      ugcRight,
      source,
      status: 'dry_run'
    })
    updatePlanAfterPublish(ctx.root, ctx.settings, ctx.selfId, now)
    broadcastStatus(ctx.root)
    log.info('qzone dry run recorded', { len: text.length, source })
    return { ok: true, dryRun: true, post }
  }

  const caps = await ensureCaps(ctx)
  if (!caps.publish) return { ok: false, error: caps.error ?? '当前协议后端不支持发说说。' }

  const res = await new QzoneActions(ctx.client, ctx.selfId).publish({
    content: text,
    images,
    ugcRight
  })

  if (!res.ok) {
    const post = insertQzonePost(ctx.root, {
      selfId: ctx.selfId,
      content: text,
      imageCount: images.length,
      ugcRight,
      source,
      status: 'failed',
      error: res.error
    })
    lastError = res.error
    scheduleRetry(ctx.root, ctx.selfId, now)
    broadcastStatus(ctx.root)
    return { ok: false, error: res.error, post }
  }

  const post = insertQzonePost(ctx.root, {
    selfId: ctx.selfId,
    tid: res.tid ?? null,
    content: text,
    imageCount: images.length,
    ugcRight,
    source,
    status: 'published'
  })
  updatePlanAfterPublish(ctx.root, ctx.settings, ctx.selfId, now)
  lastError = null
  maybeSyncToChat(ctx.root, ctx.settings, text)
  broadcastStatus(ctx.root)
  log.info('qzone published', { tid: res.tid, len: text.length, images: images.length, source })
  return { ok: true, tid: res.tid, post }
}

export function listQzoneHistory(limit = 20): QzonePostRow[] {
  try {
    const settings = loadSettings()
    const root = resolveDataRoot(settings)
    const account = loadQqAccount(root)
    if (!account?.selfId) return []
    return listQzonePosts(root, account.selfId, limit)
  } catch {
    return []
  }
}

/** 删除本地记录；已发表且拿到 tid 时顺带删空间里的那条 */
export async function removeQzonePost(id: number): Promise<{ ok: boolean; error?: string }> {
  const settings = loadSettings()
  const root = resolveDataRoot(settings)
  const row = getQzonePost(root, id)
  if (!row) return { ok: false, error: '记录不存在。' }

  let remoteError: string | undefined
  if (row.tid && row.status === 'published') {
    const account = loadQqAccount(root)
    const client = getQqClient()
    if (account?.selfId && client) {
      const res = await new QzoneActions(client, account.selfId).delete(row.tid)
      if (!res.ok) remoteError = res.error
    }
  }

  deletePostRow(root, id)
  broadcastStatus(root)
  return remoteError ? { ok: true, error: `本地已删除，空间里那条没删掉：${remoteError}` } : { ok: true }
}

export async function runQzoneInteractionNow(): Promise<QzoneInteractionSummary> {
  const resolved = resolveContext(false)
  if (!resolved.ok) return { liked: 0, commented: 0, replied: 0, skipped: 0, error: resolved.error }
  const { ctx } = resolved
  const summary = await runQzoneInteraction({
    dataRoot: ctx.root,
    settings: ctx.settings,
    actions: new QzoneActions(ctx.client, ctx.selfId),
    selfId: ctx.selfId,
    dryRun: ctx.settings.qzoneDryRun !== false
  })
  const plan = loadQzonePlan(ctx.root, ctx.selfId)
  saveQzonePlan(ctx.root, { ...plan, nextInteractAt: computeNextInteractAt(new Date()) })
  broadcastStatus(ctx.root)
  return summary
}

async function maybeRunInteraction(settings: AppSettings, ctx: QzoneContext): Promise<void> {
  if (!settings.qzoneInteractEnabled) return
  const plan = loadQzonePlan(ctx.root, ctx.selfId)
  const now = new Date()
  if (plan.nextInteractAt) {
    const due = new Date(plan.nextInteractAt)
    if (Number.isFinite(due.getTime()) && now.getTime() < due.getTime()) return
  }
  try {
    const summary = await runQzoneInteraction({
      dataRoot: ctx.root,
      settings,
      actions: new QzoneActions(ctx.client, ctx.selfId),
      selfId: ctx.selfId,
      dryRun: settings.qzoneDryRun !== false
    })
    log.info('qzone interaction tick', summary)
  } catch (e) {
    log.warn('qzone interaction failed', e)
  } finally {
    const latest = loadQzonePlan(ctx.root, ctx.selfId)
    saveQzonePlan(ctx.root, { ...latest, nextInteractAt: computeNextInteractAt(now) })
  }
}

async function tick(): Promise<void> {
  if (ticking) return
  ticking = true
  try {
    const settings = loadSettings()
    if (!settings.qzoneAutoEnabled) return
    const resolved = resolveContext()
    if (!resolved.ok) return
    const { ctx } = resolved
    const now = new Date()

    await maybeRunInteraction(settings, ctx)

    const plan = loadQzonePlan(ctx.root, ctx.selfId)
    const decision = decideQzonePublish({ now, settings, plan })
    if (!decision.publish) {
      const next = decision.nextPublishAt ?? null
      if (next && next !== plan.nextPublishAt) {
        saveQzonePlan(ctx.root, { ...plan, nextPublishAt: next })
        broadcastStatus(ctx.root)
      }
      return
    }

    const draft = await composeQzonePost({
      dataRoot: ctx.root,
      settings,
      selfId: ctx.selfId
    })
    if (!draft) {
      lastError = '文案生成失败，稍后重试。'
      scheduleRetry(ctx.root, ctx.selfId, now, 20 * 60_000)
      return
    }

    const result = await publishQzoneNow({
      content: draft.text,
      source: 'auto',
      withImage: settings.qzoneWithImage === true,
      dryRun: settings.qzoneDryRun !== false
    })
    if (!result.ok) {
      lastError = result.error ?? '发表失败'
      log.warn('qzone auto publish failed', { error: result.error })
    }
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e)
    log.warn('qzone tick failed', e)
  } finally {
    ticking = false
  }
}

function scheduleTick(delayMs = QZONE_TICK_MS): void {
  if (tickTimer) {
    clearTimeout(tickTimer)
    tickTimer = null
  }
  tickTimer = setTimeout(() => {
    tickTimer = null
    void tick().finally(() => {
      if (loadSettings().qzoneAutoEnabled) scheduleTick()
    })
  }, delayMs)
  tickTimer.unref?.()
}

export function syncQzoneAutomation(): void {
  if (tickTimer) {
    clearTimeout(tickTimer)
    tickTimer = null
  }
  if (!loadSettings().qzoneAutoEnabled) {
    log.debug('qzone automation disabled')
    return
  }
  // 首轮延后 20 秒：避开启动时的 embedding / 模型预热，也给 QQ 通道留出连接时间
  scheduleTick(20_000)
  log.info('qzone automation armed')
}

export function startQzoneAutomation(): void {
  syncQzoneAutomation()
}

export function stopQzoneAutomation(): void {
  if (tickTimer) {
    clearTimeout(tickTimer)
    tickTimer = null
  }
  capsCache = null
}

/** 设置页改了空间相关项时，重排下一轮触发（不改则不动定时器） */
export function qzoneSettingsChanged(prev: AppSettings, next: AppSettings): boolean {
  const keys: Array<keyof AppSettings> = [
    'qzoneAutoEnabled',
    'qzoneDryRun',
    'qzoneDailyLimit',
    'qzoneMinIntervalMinutes',
    'qzoneActiveStartHour',
    'qzoneActiveEndHour',
    'qzoneVisibility',
    'qzoneStyle',
    'qzoneWithImage',
    'qzoneSyncToChat',
    'qzoneInteractEnabled',
    'qzoneLikeProb',
    'qzoneCommentProb'
  ]
  return keys.some((key) => prev[key] !== next[key])
}

// [qq] — NapCat WebUI 扫码登录
//
// 链路（已按 NapCat 4.x WebUI 源码核对）：
//   1. POST /api/auth/login  { hash: sha256(token + ".napcat") }  → Credential
//   2. POST /api/QQLogin/GetQQLoginQrcode   → { qrcode: "<扫码内容>" }
//   3. 本地用 qrcode 库把扫码内容画成图片
//   4. POST /api/QQLogin/CheckLoginStatus   → isLogin / loginPhase / loginError
//   5. POST /api/QQLogin/RefreshQRcode      → 刷新二维码
//
// NapCat 返回的是「扫码内容」而不是图片；图片由 ACKEM 本地生成，所以不引入新的网络依赖。

import { createHash } from 'node:crypto'
import QRCode from 'qrcode'

import { createLogger } from '../../logger'
import type { QqWebuiConfig } from './webuiConfig'

const log = createLogger('qq-login-qr')

const API_TIMEOUT_MS = 12_000
/** Credential 服务端 1 小时有效，这里提前 10 分钟失效，避免边界失败 */
const CREDENTIAL_TTL_MS = 50 * 60 * 1000

type NapCatEnvelope<T> = {
  code: number
  message?: string
  data?: T
}

type AuthData = {
  Credential?: string
  /** 极旧版本的字段名 */
  token?: string
  require2FA?: boolean
}

type LoginQrData = {
  qrcode?: string
}

type RefreshQrData = {
  qrcodeurl?: string
  restarting?: boolean
}

type CheckLoginData = {
  isLogin?: boolean
  isOffline?: boolean
  loginPhase?: string
  qrLoginAccepted?: boolean
  coreReady?: boolean
  qrcodeurl?: string
  loginError?: string
}

export type QqLoginStatus = {
  isLogin: boolean
  isOffline: boolean
  /** waiting_qrcode / generating_qrcode / qrcode_scanned / initializing / ready / offline / reconnecting */
  phase: string
  qrLoginAccepted: boolean
  coreReady: boolean
  qrcode: string
  loginError?: string
}

export type QqLoginQrResult =
  | { ok: true; alreadyLoggedIn: true; status: QqLoginStatus }
  | { ok: true; alreadyLoggedIn: false; restarting?: boolean; qrDataUrl: string; phase: string }
  | { ok: false; need2FA?: boolean; error: string }

export type QqLoginPollResult =
  | { ok: true; status: QqLoginStatus }
  | { ok: false; need2FA?: boolean; error: string }

type CredentialCacheEntry = { credential: string; expiresAt: number }

const credentialCache = new Map<string, CredentialCacheEntry>()

/** 只用于内部信号，不把英文服务端错误直接抛给用户 */
class Need2FAError extends Error {
  constructor() {
    super('napcat-need-2fa')
    this.name = 'Need2FAError'
  }
}

/** NapCat 的登录密码哈希：sha256(token + ".napcat") */
export function hashWebuiToken(token: string): string {
  return createHash('sha256').update(`${token}.napcat`).digest('hex')
}

/**
 * 把 NapCat 返回的二维码内容转成 <img> 可用的 data URL。
 * 兼容三种形态：data URL、base64 PNG/JPEG（旧版）、扫码字符串（新版）。
 */
export async function toQrDataUrl(content: string): Promise<string> {
  const raw = (content ?? '').trim()
  if (!raw) throw new Error('二维码内容为空')

  if (raw.startsWith('data:image/')) return raw
  if (/^iVBOR/i.test(raw)) return `data:image/png;base64,${raw}`
  if (/^\/9j\//i.test(raw)) return `data:image/jpeg;base64,${raw}`

  return QRCode.toDataURL(raw, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 300,
    color: { dark: '#000000', light: '#ffffff' }
  })
}

function describeFetchCause(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause
    if (cause instanceof Error) return `${error.message}: ${cause.message}`
    if (typeof cause === 'string' && cause) return `${error.message}: ${cause}`
    return error.message
  }
  return String(error)
}

async function postNapcat<T>(
  cfg: QqWebuiConfig,
  path: string,
  body: Record<string, unknown>,
  credential?: string
): Promise<NapCatEnvelope<T>> {
  const url = `${cfg.baseUrl}/api${path}`
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(credential ? { authorization: `Bearer ${credential}` } : {})
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(API_TIMEOUT_MS)
    })
  } catch (error) {
    throw new Error(`fetch failed: ${describeFetchCause(error)}`)
  }

  const text = await response.text()
  let json: NapCatEnvelope<T>
  try {
    json = JSON.parse(text) as NapCatEnvelope<T>
  } catch {
    throw new Error(`NapCat 返回了非 JSON 响应（HTTP ${response.status}）`)
  }

  if (!response.ok) {
    throw new Error(`NapCat HTTP ${response.status}：${json.message ?? text.slice(0, 120)}`)
  }
  return json
}

async function loginWebui(
  cfg: QqWebuiConfig,
  totpCode?: string
): Promise<{ credential: string }> {
  const hash = hashWebuiToken(cfg.token)
  const body: Record<string, unknown> = { hash }
  if (totpCode?.trim()) body.totpCode = totpCode.trim()

  let result = await postNapcat<AuthData>(cfg, '/auth/login', body)

  // 极旧版本 NapCat 直接收明文 token；只在明确报 token 不匹配时回退，避免掩盖真正的问题
  if (result.code !== 0 && /token is invalid|token is empty/i.test(result.message ?? '')) {
    const legacyBody: Record<string, unknown> = { token: cfg.token }
    if (totpCode?.trim()) legacyBody.totpCode = totpCode.trim()
    result = await postNapcat<AuthData>(cfg, '/auth/login', legacyBody)
  }

  if (result.code !== 0) throw new Error(result.message || 'WebUI 登录失败')
  if (result.data?.require2FA) throw new Need2FAError()

  // 兼容极旧版本：data 直接就是凭证字符串
  if (typeof (result.data as unknown) === 'string') {
    const raw = (result.data as unknown as string).trim()
    if (raw) return { credential: raw }
  }

  const credential = (result.data?.Credential ?? result.data?.token ?? '').trim()
  if (!credential) throw new Error('WebUI 登录成功但没有返回 Credential')
  return { credential }
}

function credentialKey(cfg: QqWebuiConfig): string {
  return `${cfg.baseUrl}|${hashWebuiToken(cfg.token)}`
}

async function getCredential(cfg: QqWebuiConfig, totpCode?: string): Promise<string> {
  const key = credentialKey(cfg)
  const hit = credentialCache.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.credential

  const { credential } = await loginWebui(cfg, totpCode)
  credentialCache.set(key, { credential, expiresAt: Date.now() + CREDENTIAL_TTL_MS })
  return credential
}

async function authedPost<T>(
  cfg: QqWebuiConfig,
  path: string,
  body: Record<string, unknown>,
  totpCode?: string
): Promise<NapCatEnvelope<T>> {
  let credential = await getCredential(cfg, totpCode)
  let result: NapCatEnvelope<T>
  try {
    result = await postNapcat<T>(cfg, path, body, credential)
  } catch (error) {
    // 反向代理/旧版本可能直接回 401，而不是 200 + code=-1
    if (!/HTTP 401|unauthorized/i.test(error instanceof Error ? error.message : String(error))) {
      throw error
    }
    credentialCache.delete(credentialKey(cfg))
    credential = await getCredential(cfg, totpCode)
    return postNapcat<T>(cfg, path, body, credential)
  }

  // Credential 过期或 NapCat 重启后，自动重登一次再试
  if (result.code !== 0 && /unauthorized|authorization failed/i.test(result.message ?? '')) {
    credentialCache.delete(credentialKey(cfg))
    credential = await getCredential(cfg, totpCode)
    result = await postNapcat<T>(cfg, path, body, credential)
  }
  return result
}

/** 读取 NapCat 侧登录状态（不启动任何东西） */
export async function checkQqLoginStatus(
  cfg: QqWebuiConfig,
  totpCode?: string
): Promise<QqLoginStatus> {
  const result = await authedPost<CheckLoginData>(
    cfg,
    '/QQLogin/CheckLoginStatus',
    {},
    totpCode
  )
  if (result.code !== 0) throw new Error(result.message || '读取登录状态失败')

  const data = result.data ?? {}
  return {
    isLogin: data.isLogin === true,
    isOffline: data.isOffline === true,
    phase: typeof data.loginPhase === 'string' ? data.loginPhase : 'unknown',
    qrLoginAccepted: data.qrLoginAccepted === true,
    coreReady: data.coreReady === true,
    qrcode: typeof data.qrcodeurl === 'string' ? data.qrcodeurl : '',
    loginError: typeof data.loginError === 'string' ? data.loginError : undefined
  }
}

type RefreshQrOutcome = { qrcode: string; restarting: boolean }

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isQqLoggedInError(error: unknown): boolean {
  return /QQ Is Logined/i.test(error instanceof Error ? error.message : String(error))
}

/**
 * 强制让 NapCat 刷新二维码。
 * 被踢/容器刚重启后，GetQQLoginQrcode 经常返回 "QRCode Get Error"，
 * 但先调用 RefreshQRcode 就能把登录服务推回扫码模式（2026-11 实测）。
 */
async function forceRefreshQr(
  cfg: QqWebuiConfig,
  totpCode?: string
): Promise<RefreshQrOutcome> {
  const result = await authedPost<RefreshQrData>(cfg, '/QQLogin/RefreshQRcode', {}, totpCode)
  if (result.code !== 0) throw new Error(result.message || '刷新二维码失败')
  if (result.data?.restarting) return { qrcode: '', restarting: true }

  const value = (result.data?.qrcodeurl ?? '').trim()
  if (value) return { qrcode: value, restarting: false }

  const status = await checkQqLoginStatus(cfg, totpCode)
  if (status.isLogin) throw new Error('QQ Is Logined')
  return { qrcode: status.qrcode, restarting: false }
}

/** 生成/获取登录二维码；已登录时直接返回状态 */
export async function startQqLogin(
  cfg: QqWebuiConfig,
  totpCode?: string
): Promise<QqLoginQrResult> {
  try {
    // 容器刚重启时 WebUI 可能短暂连不上；只对网络类错误重试，token/2FA 错误要立刻报出来
    let status: QqLoginStatus | null = null
    let lastError: unknown = null
    for (let attempt = 0; attempt < 4 && !status; attempt++) {
      if (attempt > 0) await sleep(1200)
      try {
        status = await checkQqLoginStatus(cfg, totpCode)
      } catch (error) {
        lastError = error
        const message = error instanceof Error ? error.message : String(error)
        const transient = /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timeout|aborted|socket hang up|network|HTTP 5\d\d/i.test(
          message
        )
        if (!transient) throw error
      }
    }
    if (!status) throw lastError ?? new Error('读取 NapCat 登录状态失败')
    if (status.isLogin) return { ok: true, alreadyLoggedIn: true, status }

    let value = ''
    let via: 'get' | 'refresh' = 'get'

    // 1) 先要现有二维码
    const first = await authedPost<LoginQrData>(cfg, '/QQLogin/GetQQLoginQrcode', {}, totpCode)
    if (first.code === 0) {
      value = (first.data?.qrcode ?? '').trim()
    } else if (isQqLoggedInError(first.message)) {
      const latest = await checkQqLoginStatus(cfg, totpCode)
      return { ok: true, alreadyLoggedIn: true, status: latest }
    }

    // 2) 关键修复：Get 失败/为空时先 RefreshQRcode。
    //    NapCat 被踢后不会自动回到扫码态，必须刷新一次才会生成新码。
    for (let attempt = 0; attempt < 4 && !value; attempt++) {
      if (attempt > 0) await sleep(1200)
      try {
        const refreshed = await forceRefreshQr(cfg, totpCode)
        if (refreshed.restarting) continue
        if (refreshed.qrcode) {
          value = refreshed.qrcode
          via = 'refresh'
          break
        }
      } catch (error) {
        if (isQqLoggedInError(error)) {
          const latest = await checkQqLoginStatus(cfg, totpCode)
          return { ok: true, alreadyLoggedIn: true, status: latest }
        }
      }

      // 有些版本刷新后要再读一次 Get
      try {
        const again = await authedPost<LoginQrData>(cfg, '/QQLogin/GetQQLoginQrcode', {}, totpCode)
        if (again.code === 0) {
          value = (again.data?.qrcode ?? '').trim()
        } else if (isQqLoggedInError(again.message)) {
          const latest = await checkQqLoginStatus(cfg, totpCode)
          return { ok: true, alreadyLoggedIn: true, status: latest }
        }
      } catch {
        // 单次失败继续下一轮
      }
    }

    if (!value) {
      const hint = status.loginError ? `：${status.loginError}` : ''
      throw new Error(
        `NapCat 没有生成二维码${hint}。请在 NapCat WebUI 完成验证/退出当前账号，或点「立即刷新二维码」重试`
      )
    }

    log.info('qq login qrcode ready', { via })
    return {
      ok: true,
      alreadyLoggedIn: false,
      qrDataUrl: await toQrDataUrl(value),
      phase: status.phase
    }
  } catch (error) {
    log.warn('qq login qrcode failed', {
      error: error instanceof Error ? error.message : String(error)
    })
    return mapLoginError(error, cfg)
  }
}

/** 轮询登录状态；扫码、确认、登录成功都在这里体现 */
export async function pollQqLogin(cfg: QqWebuiConfig): Promise<QqLoginPollResult> {
  try {
    return { ok: true, status: await checkQqLoginStatus(cfg) }
  } catch (error) {
    return mapLoginError(error, cfg)
  }
}

/** 刷新过期二维码；NapCat 被踢后重启登录服务时返回 restarting */
export async function refreshQqLogin(cfg: QqWebuiConfig): Promise<QqLoginQrResult> {
  try {
    const refreshed = await forceRefreshQr(cfg)
    if (refreshed.restarting) {
      return {
        ok: true,
        alreadyLoggedIn: false,
        restarting: true,
        qrDataUrl: '',
        phase: 'reconnecting'
      }
    }
    if (!refreshed.qrcode) throw new Error('NapCat 没有返回新的二维码')

    log.info('qq login qrcode refreshed')
    return {
      ok: true,
      alreadyLoggedIn: false,
      qrDataUrl: await toQrDataUrl(refreshed.qrcode),
      phase: 'waiting_qrcode'
    }
  } catch (error) {
    if (isQqLoggedInError(error)) {
      const status = await checkQqLoginStatus(cfg)
      return { ok: true, alreadyLoggedIn: true, status }
    }
    log.warn('qq login qrcode refresh failed', {
      error: error instanceof Error ? error.message : String(error)
    })
    return mapLoginError(error, cfg)
  }
}

function mapLoginError(
  error: unknown,
  cfg: QqWebuiConfig
): { ok: false; need2FA?: boolean; error: string } {
  if (error instanceof Need2FAError) {
    return { ok: false, need2FA: true, error: 'WebUI 开启了两步验证，请输入 6 位动态码' }
  }
  return { ok: false, error: describeNapcatError(error, cfg.baseUrl) }
}

/** 把底层错误翻译成新手能照着排查的中文提示 */
export function describeNapcatError(error: unknown, baseUrl: string): string {
  const raw = error instanceof Error ? error.message : String(error)

  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timeout|aborted|socket hang up|network/i.test(raw)) {
    return `连不上 NapCat WebUI（${baseUrl}）：确认容器在运行、6099 端口已映射到本机`
  }
  if (/HTTP 401|unauthorized|authorization failed/i.test(raw)) {
    return 'WebUI 令牌不对或已过期。检查 compose 里的 WEBUI_TOKEN；如果 NapCat 自动生成过密码，用 docker compose logs napcat 找 token'
  }
  if (/token is invalid|token is empty/i.test(raw)) {
    return 'WebUI 令牌不对：检查 compose 里的 WEBUI_TOKEN 是否和当前 NapCat 一致'
  }
  if (/login rate limit/i.test(raw)) {
    return 'WebUI 登录尝试太频繁，请等 1 分钟再试'
  }
  if (/invalid or expired code/i.test(raw)) {
    return '两步验证码不对或已过期，请重新输入'
  }
  if (/server token not initialized/i.test(raw)) {
    return 'NapCat WebUI 还没初始化完，等几秒再试'
  }
  if (/QQ Is Logined/i.test(raw)) {
    return 'NapCat 里已经登录了 QQ，无需扫码'
  }
  if (/QRCode Get Error/i.test(raw)) {
    return 'NapCat 还没拿到二维码，稍等几秒再试；一直失败就重启容器'
  }
  if (/二维码内容为空|没有返回二维码内容|没有返回新的二维码/i.test(raw)) {
    return 'NapCat 没有返回二维码内容，稍等几秒再试'
  }
  return raw
}

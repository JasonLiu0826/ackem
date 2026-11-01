// [qq] — 语音回复：调本机 IndexTTS 服务，把一条文字变成 QQ 语音（silk v3）
//
// 为什么在 ACKEM 侧做：
// - 音色/情绪/拆条逻辑都在 ACKEM 里，语音只是换一种"说出"方式；
// - NapCat 只负责协议转发，不该背着 8GB 的模型服务；
// - 合成失败可以就地降级成文字，用户无感。
//
// 服务端（~/ackem/tts_server.py）已经做了 WAV → silk v3 转换，
// 这里只发一次 HTTP、拿回 silk 字节，不再 spawn python 进程。
//
// 发送方式默认 base64：NapCat 常常跑在 Docker 里，看不到 Mac 上的绝对路径。

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createLogger } from '../../logger'

const log = createLogger('qq-voice')

export const QQ_VOICE_DEFAULT_TTS_URL = 'http://127.0.0.1:8770'
const VOICE_CONFIG_FILE = 'channels/qq-voice.json'
const SILK_DIR = 'qq-voice-cache'
/** 缓存文件保留时长：超过就清掉，避免长期聊天把磁盘塞满 */
const CACHE_TTL_MS = 2 * 60 * 60 * 1000
/** 健康检查结果缓存，避免每条消息都探一次 */
const HEALTH_TTL_MS = 30 * 1000

export type QqVoiceSendMode = 'base64' | 'file'

export type QqVoiceConfig = {
  /** 总开关：关掉就完全退化成纯文字 */
  enabled: boolean
  /** 一条回复发语音的概率（0~1），默认 0.3 */
  probability: number
  /** 单条语音的字数上限；更长的文本会在句末标点处切成多条语音 */
  maxChars: number
  /** 少于这个字数也不发（"嗯""哦"这种没必要合成） */
  minChars: number
  /** 本机 TTS 服务地址 */
  ttsUrl: string
  /** 单次合成的基础超时（毫秒）；实际超时按字数动态放宽（见 estimateTimeoutMs） */
  timeoutMs: number
  /** QQ 单条语音上限 60 秒，留 5 秒余量；合成出来超过这个秒数就退化成文字 */
  maxSeconds: number
  /** record 段用 base64 还是本地绝对路径（NapCat 在 Docker 里时必须用 base64） */
  sendMode: QqVoiceSendMode
}

export const QQ_VOICE_DEFAULTS: QqVoiceConfig = {
  enabled: true,
  probability: 0.3,
  // 约 4 字/秒 × 55 秒 ≈ 220 字；再长就分段
  maxChars: 220,
  minChars: 2,
  ttsUrl: QQ_VOICE_DEFAULT_TTS_URL,
  timeoutMs: 45000,
  maxSeconds: 55,
  sendMode: 'base64'
}

/** 中文语音的粗略时长换算：实测约 4 字/秒（含标点停顿） */
export const CHARS_PER_SECOND = 4

function configPath(dataRoot: string): string {
  return join(dataRoot, VOICE_CONFIG_FILE)
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

/** 读取配置；文件不存在或损坏时用默认值（默认开着，概率 30%） */
export function loadQqVoiceConfig(dataRoot: string): QqVoiceConfig {
  const path = configPath(dataRoot)
  try {
    if (existsSync(path)) {
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<QqVoiceConfig>
      return {
        enabled: raw.enabled !== false,
        probability: clamp(Number(raw.probability), 0, 1, QQ_VOICE_DEFAULTS.probability),
        maxChars: Math.round(clamp(Number(raw.maxChars), 5, 600, QQ_VOICE_DEFAULTS.maxChars)),
        minChars: Math.round(clamp(Number(raw.minChars), 1, 20, QQ_VOICE_DEFAULTS.minChars)),
        ttsUrl: (raw.ttsUrl || QQ_VOICE_DEFAULTS.ttsUrl).replace(/\/+$/, ''),
        timeoutMs: Math.round(clamp(Number(raw.timeoutMs), 5000, 120000, QQ_VOICE_DEFAULTS.timeoutMs)),
        maxSeconds: Math.round(clamp(Number(raw.maxSeconds), 10, 59, QQ_VOICE_DEFAULTS.maxSeconds)),
        sendMode: raw.sendMode === 'file' ? 'file' : 'base64'
      }
    }
  } catch {
    /* 坏文件按默认值处理，下次保存会覆盖 */
  }
  return { ...QQ_VOICE_DEFAULTS }
}

/** 局部更新配置（只写传进来的字段），返回最新完整配置 */
export function saveQqVoiceConfig(dataRoot: string, patch: Partial<QqVoiceConfig>): QqVoiceConfig {
  const next = loadQqVoiceConfig(dataRoot)
  const merged: QqVoiceConfig = { ...next, ...patch }
  merged.probability = clamp(Number(merged.probability), 0, 1, QQ_VOICE_DEFAULTS.probability)
  merged.maxChars = Math.round(clamp(Number(merged.maxChars), 5, 600, QQ_VOICE_DEFAULTS.maxChars))
  merged.minChars = Math.round(clamp(Number(merged.minChars), 1, 20, QQ_VOICE_DEFAULTS.minChars))
  merged.ttsUrl = (merged.ttsUrl || QQ_VOICE_DEFAULTS.ttsUrl).replace(/\/+$/, '')
  merged.timeoutMs = Math.round(clamp(Number(merged.timeoutMs), 5000, 120000, QQ_VOICE_DEFAULTS.timeoutMs))
  merged.maxSeconds = Math.round(clamp(Number(merged.maxSeconds), 10, 59, QQ_VOICE_DEFAULTS.maxSeconds))
  merged.sendMode = merged.sendMode === 'file' ? 'file' : 'base64'

  const path = configPath(dataRoot)
  mkdirSync(join(dataRoot, 'channels'), { recursive: true })
  writeFileSync(path, JSON.stringify(merged, null, 2), 'utf-8')
  return merged
}

// ---------------------------------------------------------------- 健康检查

let healthCache: { url: string; ok: boolean; at: number } | null = null

/** TTS 服务是否活着（结果缓存 30 秒，失败也缓存，避免每条消息都等超时） */
export async function isTtsHealthy(ttsUrl: string, timeoutMs = 2000): Promise<boolean> {
  const now = Date.now()
  if (healthCache && healthCache.url === ttsUrl && now - healthCache.at < HEALTH_TTL_MS) {
    return healthCache.ok
  }
  let ok = false
  try {
    const res = await fetch(`${ttsUrl}/health`, { signal: AbortSignal.timeout(timeoutMs) })
    ok = res.ok
  } catch {
    ok = false
  }
  healthCache = { url: ttsUrl, ok, at: now }
  return ok
}

/**
 * 按字数估个超时：本机实测约 0.7 秒/字（含 MPS 冷启动抖动），留 2 倍余量。
 * 220 字的长段落可能合成 2–3 分钟，30 秒的固定超时必然失败。
 */
export function estimateTimeoutMs(text: string, cfg: QqVoiceConfig): number {
  const chars = text.trim().length
  // 本机实测 0.7–1.5 秒/字（MPS + 内存交换时更慢），按 1.6 秒/字 + 45 秒底噪给
  return Math.min(600000, Math.max(cfg.timeoutMs, 25000 + chars * 1600))
}

/**
 * 把一段长文本切成若干条语音，每条不超过 maxChars 字。
 * 优先在句末标点切，其次逗号，最后硬切——避免把一句话劈成两半。
 */
export function splitForVoice(text: string, maxChars: number): string[] {
  const clean = text.trim()
  if (!clean) return []
  if (clean.length <= maxChars) return [clean]
  const sents = clean.match(/[^。！？!?；;]*[。！？!?；;]+|[^。！？!?；;]+$/g) ?? [clean]
  const pieces: string[] = []
  let buf = ''
  const push = (): void => {
    if (buf.trim()) pieces.push(buf.trim())
    buf = ''
  }
  for (const s of sents) {
    if (!s) continue
    if (buf.length + s.length <= maxChars) {
      buf += s
      continue
    }
    push()
    if (s.length <= maxChars) {
      buf = s
      continue
    }
    // 单句超长：先按逗号切，仍超长就硬切
    let rest = s
    while (rest.length > maxChars) {
      const cut = rest.lastIndexOf('，', maxChars)
      const at = cut > 0 ? cut + 1 : maxChars
      pieces.push(rest.slice(0, at).trim())
      rest = rest.slice(at)
    }
    buf = rest
  }
  push()
  return pieces
}

/** 仅供测试：清掉健康检查缓存 */
export function resetTtsHealthCache(): void {
  healthCache = null
}

// ---------------------------------------------------------------- 合成

const SILK_MAGIC = Buffer.from([0x02, 0x23, 0x21, 0x53, 0x49, 0x4c, 0x4b, 0x5f, 0x56, 0x33])

/** 校验回来的是不是 silk v3（腾讯头 0x02 + "#!SILK_V3"） */
export function looksLikeSilk(buf: Buffer): boolean {
  return buf.length > SILK_MAGIC.length && buf.subarray(0, SILK_MAGIC.length).equals(SILK_MAGIC)
}

/** 清理过期缓存文件；顺手建目录 */
function prepareCacheDir(dataRoot: string): string {
  const dir = join(dataRoot, SILK_DIR)
  mkdirSync(dir, { recursive: true })
  const now = Date.now()
  try {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.silk')) continue
      const file = join(dir, name)
      try {
        if (now - statSync(file).mtimeMs > CACHE_TTL_MS) rmSync(file, { force: true })
      } catch {
        /* 单个文件删不掉不影响主流程 */
      }
    }
  } catch {
    /* 目录读不了就让主流程继续，后面写文件时会报出来 */
  }
  return dir
}

export type QqVoiceResult = {
  /** 文件绝对路径 */
  path: string
  /** silk 字节数 */
  bytes: number
  /** 音频秒数（服务端从合成结果推的） */
  seconds: number
  /** 合成耗时（秒） */
  genSeconds: number
}

/**
 * 合成一条语音，落盘成 silk。
 * 失败返回 null，调用方应降级成文字发送。
 */
export async function synthesizeSilk(args: {
  dataRoot: string
  text: string
  cfg?: QqVoiceConfig
}): Promise<QqVoiceResult | null> {
  const cfg = args.cfg ?? loadQqVoiceConfig(args.dataRoot)
  const text = args.text.trim()
  if (!text) return null

  try {
    const res = await fetch(`${cfg.ttsUrl}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, format: 'silk' }),
      signal: AbortSignal.timeout(estimateTimeoutMs(text, cfg))
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      log.warn('tts service error', { status: res.status, body: body.slice(0, 160) })
      return null
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (!looksLikeSilk(buf)) {
      log.warn('tts returned non-silk payload', { bytes: buf.length })
      return null
    }
    const dir = prepareCacheDir(args.dataRoot)
    const name = `${createHash('sha1').update(text).digest('hex').slice(0, 16)}.silk`
    const path = join(dir, name)
    writeFileSync(path, buf)

    return {
      path,
      bytes: buf.length,
      seconds: Number(res.headers.get('X-Audio-Seconds') || 0),
      genSeconds: Number(res.headers.get('X-Gen-Seconds') || 0)
    }
  } catch (e) {
    // 超时 / 服务没起 / 端口不通，都走这里
    log.warn('tts synth failed', { error: e instanceof Error ? e.message : String(e) })
    return null
  }
}

// ---------------------------------------------------------------- 决策

export type VoiceDecision = { speak: true } | { speak: false; reason: string }

/**
 * 这条气泡该不该发语音。
 * 判断顺序：开关 → 字数 → 随机概率。随机数放最后，前面的判断不影响随机分布。
 */
export function shouldSpeak(args: {
  text: string
  cfg: QqVoiceConfig
  random?: () => number
}): VoiceDecision {
  const random = args.random ?? Math.random
  if (!args.cfg.enabled) return { speak: false, reason: 'disabled' }
  const len = args.text.trim().length
  if (len < args.cfg.minChars) return { speak: false, reason: 'too-short' }
  // 长文本不再拒绝：上层会按句末标点切成多条语音（见 splitForVoice）
  if (len > args.cfg.maxChars * 4) return { speak: false, reason: 'too-long' }
  // 纯符号 / 纯表情不算字数，合成出来是"嗯"一声，没意义
  if (!/[\u4e00-\u9fa5a-zA-Z0-9]/.test(args.text)) return { speak: false, reason: 'no-speech-content' }
  if (random() >= args.cfg.probability) return { speak: false, reason: 'probability' }
  return { speak: true }
}

/** 把 silk 拼成 OneBot record 段要的 file 值 */
export function recordFileValue(result: QqVoiceResult, mode: QqVoiceSendMode): string {
  if (mode === 'base64') {
    return `base64://${readFileSync(result.path).toString('base64')}`
  }
  return `file://${result.path}`
}

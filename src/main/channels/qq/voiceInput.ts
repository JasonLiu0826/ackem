// [qq/voiceInput] — 入站语音转文字
// NapCat 给的是 amr/silk 引用；用 OneBot get_record(out_format=wav) 让协议端转码，
// 再交给本机 voice-service 的 ASR（/transcribe/raw）出文字。
import { existsSync, readFileSync } from 'node:fs'
import { voiceService } from '../../extensions/plugins/builtin/tool/tts-voice/pythonService'
import { createLogger } from '../../logger'
import type { OneBotClient } from './onebot'

const log = createLogger('qq-voice-input')

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

async function loadAudioBuffer(raw: string): Promise<Buffer | null> {
  const s = raw.trim()
  if (!s) return null
  if (s.startsWith('base64://')) return Buffer.from(s.slice('base64://'.length), 'base64')
  if (/^https?:\/\//i.test(s)) {
    const res = await fetch(s, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  }
  if (existsSync(s)) return readFileSync(s)
  if (s.length > 200 && /^[A-Za-z0-9+/=\s]+$/.test(s)) return Buffer.from(s.replace(/\s/g, ''), 'base64')
  return null
}

/** 把一条 QQ 语音转成文字；失败返回 null（调用方回退到"看不了"文案） */
export async function transcribeRecord(client: OneBotClient, ref: string): Promise<string | null> {
  try {
    if (voiceService.currentState !== 'ready') {
      const started = await voiceService.start()
      if (!started) return null
    }
    const res = await client.call<{ file?: string; base64?: string; url?: string }>(
      'get_record',
      { file: ref, out_format: 'wav' },
      25_000
    )
    if (!res.ok) {
      log.warn('get_record failed', { error: res.error })
      return null
    }
    const data = res.data ?? {}
    const raw = data.base64 || data.file || data.url || ''
    const buf = await loadAudioBuffer(raw)
    if (!buf || buf.length === 0) {
      log.warn('record audio empty')
      return null
    }
    const out = await voiceService.transcribe(toArrayBuffer(buf))
    const text = out?.text?.trim()
    return text && text.length > 0 ? text : null
  } catch (e) {
    log.warn('transcribe record failed', { error: e instanceof Error ? e.message : String(e) })
    return null
  }
}

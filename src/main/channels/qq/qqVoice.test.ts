// [qq] — 语音模块测试
//
// 分两层：
// 1) 纯逻辑（配置读写 / 是否该发语音 / silk 头校验）—— 不依赖外部服务，永远跑；
// 2) 真实链路（连本机 TTS 服务合成一句）—— 服务没起就自动跳过，避免 CI 红。

import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  QQ_VOICE_DEFAULTS,
  estimateTimeoutMs,
  isTtsHealthy,
  splitForVoice,
  loadQqVoiceConfig,
  looksLikeSilk,
  recordFileValue,
  saveQqVoiceConfig,
  shouldSpeak,
  synthesizeSilk
} from './qqVoice'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ackem-qq-voice-'))
  tempRoots.push(root)
  return root
}

describe('配置读写', () => {
  it('没有配置文件时用默认值（默认开启、30% 概率）', () => {
    const cfg = loadQqVoiceConfig(tempRoot())
    expect(cfg.enabled).toBe(true)
    expect(cfg.probability).toBe(QQ_VOICE_DEFAULTS.probability)
    expect(cfg.sendMode).toBe('base64')
  })

  it('保存后能读回，并把越界值夹到合法区间', () => {
    const root = tempRoot()
    saveQqVoiceConfig(root, { probability: 3, maxChars: 999, minChars: 0, maxSeconds: 999 })
    const cfg = loadQqVoiceConfig(root)
    expect(cfg.probability).toBe(1)
    expect(cfg.maxChars).toBe(600)
    expect(cfg.minChars).toBe(1)
    expect(cfg.maxSeconds).toBe(59)
    expect(existsSync(join(root, 'channels', 'qq-voice.json'))).toBe(true)
  })

  it('坏文件不抛错，回退默认值', () => {
    const root = tempRoot()
    saveQqVoiceConfig(root, {})
    const path = join(root, 'channels', 'qq-voice.json')
    require('node:fs').writeFileSync(path, '{ 这不是 json')
    expect(loadQqVoiceConfig(root).enabled).toBe(true)
  })
})

describe('shouldSpeak', () => {
  const base = { ...QQ_VOICE_DEFAULTS, probability: 1 }

  it('关掉开关就永远不发', () => {
    expect(shouldSpeak({ text: '在的', cfg: { ...base, enabled: false } })).toEqual({
      speak: false,
      reason: 'disabled'
    })
  })

  it('太短不发，超长（> 4 倍上限）才不发', () => {
    expect(shouldSpeak({ text: '嗯', cfg: base })).toMatchObject({ speak: false, reason: 'too-short' })
    // 80 字在 220 字上限内：允许（会切成多条语音）
    expect(shouldSpeak({ text: '啊'.repeat(80), cfg: base }).speak).toBe(true)
    expect(shouldSpeak({ text: '啊'.repeat(1000), cfg: base })).toMatchObject({
      speak: false,
      reason: 'too-long'
    })
  })

  it('纯表情不发', () => {
    expect(shouldSpeak({ text: '😂😂😂', cfg: base })).toMatchObject({
      speak: false,
      reason: 'no-speech-content'
    })
  })

  it('概率 0 时不发，概率 1 时发', () => {
    const text = '在的，你说吧。'
    expect(shouldSpeak({ text, cfg: { ...base, probability: 0 }, random: () => 0 }).speak).toBe(false)
    expect(shouldSpeak({ text, cfg: { ...base, probability: 1 }, random: () => 0.99 }).speak).toBe(true)
  })
})

describe('长句分段', () => {
  it('短句不分段', () => {
    expect(splitForVoice('在的，你说吧。', 220)).toEqual(['在的，你说吧。'])
  })

  it('按句末标点切成不超过上限的片段', () => {
    const text = '第一句。第二句！第三句？第四句；第五句。'
    const pieces = splitForVoice(text, 8)
    expect(pieces.length).toBeGreaterThan(1)
    for (const p of pieces) expect(p.length).toBeLessThanOrEqual(8)
    expect(pieces.join('')).toBe(text)
  })

  it('单句超长时按逗号切，再不行硬切', () => {
    const text = '啊'.repeat(500)
    const pieces = splitForVoice(text, 100)
    expect(pieces).toHaveLength(5)
    for (const p of pieces) expect(p.length).toBeLessThanOrEqual(100)
  })

  it('全部分段拼起来等于原文（不丢字）', () => {
    const text = '今天天气不错。我们出去走走吧！顺便买点东西；回来做饭，好不好？'
    expect(splitForVoice(text, 10).join('')).toBe(text)
  })
})

describe('超时估算', () => {
  it('长文本按字数放宽，短文本用基础超时', () => {
    const cfg = { ...QQ_VOICE_DEFAULTS, timeoutMs: 30000 }
    expect(estimateTimeoutMs('在的', cfg)).toBe(30000)
    const long = estimateTimeoutMs('字'.repeat(200), cfg)
    expect(long).toBeGreaterThan(300000)
    expect(long).toBeLessThanOrEqual(600000)
  })
})

describe('silk 校验', () => {
  it('腾讯头 0x02 + #!SILK_V3 才算 silk', () => {
    const good = Buffer.concat([
      Buffer.from([0x02]),
      Buffer.from('#!SILK_V3'),
      Buffer.alloc(8)
    ])
    expect(looksLikeSilk(good)).toBe(true)
    expect(looksLikeSilk(Buffer.from('#!SILK_V3'))).toBe(false)
    expect(looksLikeSilk(Buffer.from('RIFF....WAVE'))).toBe(false)
  })
})

describe('真实链路（需要本机 TTS 服务）', () => {
  it('合成一句 → 得到合法 silk 文件', async () => {
    const cfg = loadQqVoiceConfig(tempRoot())
    const healthy = await isTtsHealthy(cfg.ttsUrl, 1500)
    if (!healthy) {
      console.warn('TTS 服务未启动，跳过真实链路测试（bash ~/ackem/start_tts.sh）')
      return
    }
    const root = tempRoot()
    const result = await synthesizeSilk({ dataRoot: root, text: '在的，你说吧。', cfg })
    expect(result).not.toBeNull()
    expect(result!.bytes).toBeGreaterThan(1000)
    expect(result!.seconds).toBeGreaterThan(0.5)
    const head = readFileSync(result!.path).subarray(0, 10)
    expect(head[0]).toBe(0x02)
    expect(head.subarray(1).toString()).toBe('#!SILK_V3')
  }, 120000)

  it('recordFileValue 在 base64 模式下给出 base64:// 前缀', async () => {
    const cfg = loadQqVoiceConfig(tempRoot())
    if (!(await isTtsHealthy(cfg.ttsUrl, 1500))) return
    const root = tempRoot()
    const result = await synthesizeSilk({ dataRoot: root, text: '晚安，明天见。', cfg })
    expect(result).not.toBeNull()
    const value = recordFileValue(result!, 'base64')
    expect(value.startsWith('base64://')).toBe(true)
    expect(value.length).toBeGreaterThan(2000)
  }, 120000)
})

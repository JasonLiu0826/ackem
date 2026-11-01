// [qq] — 出站序列的语音分支测试
//
// 用一个假的 OneBotClient 记录实际发出的消息段，验证：
// - 语音开关打开 + 概率 100% 时，发出去的是 record 段（且是 base64 的 silk）；
// - 概率 0 时仍然发文字，不能把文字弄丢。

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { sendQqOutboundSequence, type QqBubble } from './outboundSequence'
import { isTtsHealthy, loadQqVoiceConfig, saveQqVoiceConfig } from './qqVoice'
import type { OneBotSegment } from './types'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ackem-qq-seq-'))
  tempRoots.push(root)
  return root
}

type Captured = OneBotSegment[][]

function fakeClient(sent: Captured) {
  return {
    isConnected: () => true,
    sendPrivateMessage: async (_userId: string, segments: OneBotSegment[]) => {
      sent.push(segments)
      return { ok: true }
    },
    sendGroupMessage: async (_groupId: string, segments: OneBotSegment[]) => {
      sent.push(segments)
      return { ok: true }
    }
  } as never
}

const target = { kind: 'private' as const, userId: '10001' }

describe('sendQqOutboundSequence 语音分支', () => {
  it('语音开启且概率 100% 时发 record 段', async () => {
    const root = tempRoot()
    saveQqVoiceConfig(root, { enabled: true, probability: 1, maxChars: 60, minChars: 2 })
    const cfg = loadQqVoiceConfig(root)
    if (!(await isTtsHealthy(cfg.ttsUrl, 1500))) {
      console.warn('TTS 服务未启动，跳过该用例')
      return
    }
    const sent: Captured = []
    const bubbles: QqBubble[] = [{ kind: 'text', body: '在的，你说吧。', delayBeforeMs: 0 }]
    const outcome = await sendQqOutboundSequence({
      client: fakeClient(sent),
      target,
      bubbles,
      voice: { dataRoot: root }
    })
    expect(outcome.voices).toBe(1)
    expect(outcome.sent).toBe(1)
    expect(sent).toHaveLength(1)
    expect(sent[0][0].type).toBe('record')
    const file = String(sent[0][0].data.file)
    expect(file.startsWith('base64://')).toBe(true)
  }, 120000)

  it('概率 0 时仍然发文字', async () => {
    const root = tempRoot()
    saveQqVoiceConfig(root, { enabled: true, probability: 0 })
    const sent: Captured = []
    const bubbles: QqBubble[] = [{ kind: 'text', body: '晚安，明天见。', delayBeforeMs: 0 }]
    const outcome = await sendQqOutboundSequence({
      client: fakeClient(sent),
      target,
      bubbles,
      voice: { dataRoot: root }
    })
    expect(outcome.voices).toBe(0)
    expect(outcome.sent).toBe(1)
    expect(sent[0][0].type).toBe('text')
  }, 30000)

  it('forceLongVoice：短配置也把长段整条发成语音', async () => {
    const root = tempRoot()
    // maxChars 很小、概率 0：正常路径绝不会发语音
    saveQqVoiceConfig(root, { enabled: true, probability: 0, maxChars: 20, minChars: 2, maxSeconds: 55 })
    const cfg = loadQqVoiceConfig(root)
    if (!(await isTtsHealthy(cfg.ttsUrl, 1500))) {
      console.warn('TTS 服务未启动，跳过该用例')
      return
    }
    const sent: Captured = []
    const longText =
      '我听见雨滴落在青青草地，我听见远方下课钟声响起。可是我没有听见你的声音，认真呼唤我姓名。'
    const bubbles: QqBubble[] = [{ kind: 'text', body: longText, delayBeforeMs: 0 }]
    const outcome = await sendQqOutboundSequence({
      client: fakeClient(sent),
      target,
      bubbles,
      voice: { dataRoot: root },
      forceLongVoice: true
    })
    expect(outcome.voices).toBe(1)
    expect(sent).toHaveLength(1)
    expect(sent[0][0].type).toBe('record')
  }, 300000)

  it('不带 voice 参数时退化为纯文字（老调用点不受影响）', async () => {
    const sent: Captured = []
    const bubbles: QqBubble[] = [{ kind: 'text', body: '在的。', delayBeforeMs: 0 }]
    const outcome = await sendQqOutboundSequence({ client: fakeClient(sent), target, bubbles })
    expect(outcome.voices).toBe(0)
    expect(sent[0][0].type).toBe('text')
  }, 30000)
})

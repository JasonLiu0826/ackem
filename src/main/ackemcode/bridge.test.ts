import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { detectCodeIntent } from './intent'

describe('detectCodeIntent', () => {
  it('显式 /code 前缀一定命中，并去掉前缀', () => {
    expect(detectCodeIntent('/code 帮我看看这个报错')).toEqual({
      matched: true,
      prompt: '帮我看看这个报错',
      mode: 'explicit'
    })
    expect(detectCodeIntent('代码：跑一下 npm test').prompt).toBe('跑一下 npm test')
  })

  it('只有前缀没有内容不算任务', () => {
    expect(detectCodeIntent('/code   ').matched).toBe(false)
  })

  it('动作 + 工程对象 → 命中', () => {
    expect(detectCodeIntent('帮我把这个脚本改一下').matched).toBe(true)
    expect(detectCodeIntent('修复一下这个 bug').matched).toBe(true)
    expect(detectCodeIntent('在 ~/proj 里跑一下测试').matched).toBe(true)
    expect(detectCodeIntent('把 config.json 里的端口改成 3000').matched).toBe(true)
  })

  it('陪伴类写作不误判', () => {
    expect(detectCodeIntent('帮我写一首诗').matched).toBe(false)
    expect(detectCodeIntent('陪我聊会儿').matched).toBe(false)
    expect(detectCodeIntent('今天心情不错').matched).toBe(false)
  })

  it('只提到名词但没有动作 → 不命中', () => {
    expect(detectCodeIntent('这个文件里写了什么').matched).toBe(false)
    expect(detectCodeIntent('你觉得代码重要吗').matched).toBe(false)
  })
})

const LIVE = process.env.ACKEMCODE_LIVE === '1'

describe.runIf(LIVE)('Ackem Code 端到端（真实模型）', () => {
  let dataDir = ''
  let stop: () => Promise<void> = async () => {}

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'ackemcode-test-'))
    // 复用本机已有的模型配置，测试里不落任何密钥到仓库
    const seed = join(homedir(), '.ackemcode', 'data', 'settings.standalone.json')
    if (existsSync(seed)) cpSync(seed, join(dataDir, 'settings.standalone.json'))
    process.env.ACKEMCODE_ROOT = resolve('parts/ackemcode')
    process.env.ACKEMCODE_DATA_DIR = dataDir
    process.env.ACKEMCODE_PORT = process.env.ACKEMCODE_TEST_PORT || '8796'
    const mod = await import('./index')
    stop = mod.stopAckemCodeDaemon
  }, 60_000)

  afterAll(async () => {
    await stop()
    if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  })

  it('跑一轮真实代码任务并拿到最终文本', async () => {
    const { runCodeTurn } = await import('./index')
    const result = await runCodeTurn({
      chatSessionId: 'vitest',
      text: '只回复两个字母：pong。不要调用任何工具。',
      cwd: dataDir,
      permissionMode: 'bypassPermissions'
    })
    expect(result.ok).toBe(true)
    expect(result.text.length).toBeGreaterThan(0)
  }, 120_000)

  it('三端共用的 dispatch 能把 /code 指令交给 Ackem Code', async () => {
    const { maybeRunCodeTask } = await import('./dispatch')
    const result = await maybeRunCodeTask({
      chatSessionId: 'vitest-dispatch',
      text: '/code 只回复两个字母：ok，不要调用任何工具。',
      channel: 'qq',
      cwd: dataDir
    })
    expect(result.handled).toBe(true)
    if (result.handled) {
      expect(result.ok).toBe(true)
      expect(result.text.length).toBeGreaterThan(0)
    }
  }, 120_000)
})

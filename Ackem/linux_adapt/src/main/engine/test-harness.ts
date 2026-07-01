// [test-harness] — 共享测试支架
// 消除各 e2e 测试文件间的重复代码
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { vi } from 'vitest'

// electron mock（所有 e2e 测试共享）
vi.mock('electron', () => ({
  app: { getPath: () => '.', getName: () => 'ackem', getVersion: () => '0.0.0' },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  ipcMain: { handle: () => {} },
  shell: { openPath: async () => '' },
  BrowserWindow: class {},
}))

import { runPreLlmTurn } from './orchestrator.js'
import { closeAllDatabases } from '../db/database.js'
import { defaultFullState, saveState, loadState } from './state-persistence.js'
import { FactStore, defaultFactsPath } from '../memory/factStore.js'
import { TIER_B_CHAR_BUDGET } from './ackemParams.js'
import { MemoryRetriever } from '../memory/retriever.js'
import { PERSONALITY_PRESETS, type PersonalityPreset } from '../personalityPresets.js'
import type { FullState, TurnTrace } from './types.js'

// ============== 类型 ==============

export interface TurnSnap {
  stage: string; trust: number; rifts: number; atmos: string; pos: number
  aff: number; sec: number; aro: number; dom: number; label: string
  turns: number
}

export interface TestCtx {
  root: string
  store: FactStore
  retriever: MemoryRetriever
  preset: PersonalityPreset
  state: FullState
  sessionId: string
  turnIdx: number
  step: (msg: string) => ReturnType<typeof runPreLlmTurn>
  snap: () => TurnSnap
  cleanup: () => void
}

// ============== 工厂函数 ==============

/** 创建一个完整的测试上下文 */
export function createTestCtx(presetId = 'deredere'): TestCtx {
  const root = join(tmpdir(), `ackem-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
  mkdirSync(root, { recursive: true })
  mkdirSync(join(root, 'memory', 'facts'), { recursive: true })
  mkdirSync(join(root, 'companion'), { recursive: true })

  const store = new FactStore(defaultFactsPath(root))
  store.load()
  const retriever = new MemoryRetriever(store, null)
  const preset = PERSONALITY_PRESETS.find(p => p.id === presetId) ?? PERSONALITY_PRESETS[5]

  const state: FullState = defaultFullState({
    presetId: preset.id, T: preset.T, I: preset.I, S: preset.S, O: preset.O, R: preset.R
  })

  const sessionId = `test-${Date.now()}`
  let turnIdx = 0

  async function step(msg: string): ReturnType<typeof runPreLlmTurn> {
    const pre = await runPreLlmTurn({
      msg, prev: state, factStore: store, retriever,
      sessionId, turnIndex: turnIdx, memoryBudgetChars: TIER_B_CHAR_BUDGET
    })
    state.relationship = pre.newState.relationship
    state.emotion = pre.newState.emotion
    state.counters = pre.newState.counters
    state.lastActive = pre.newState.lastActive
    if (pre.newState.firstMetDate) state.firstMetDate = pre.newState.firstMetDate
    store.load()
    turnIdx++
    saveState(root, state)
    return pre
  }

  function snap(): TurnSnap {
    const r = state.relationship; const e = state.emotion
    return {
      stage: r.stage, trust: +r.trust.toFixed(1), rifts: r.rifts, atmos: r.atmosphere,
      pos: r.consecutivePositiveTurns,
      aff: +e.aff.toFixed(1), sec: +e.sec.toFixed(1), aro: +e.aro.toFixed(1),
      dom: +e.dom.toFixed(1), label: e.primaryLabel,
      turns: state.counters.totalTurns
    }
  }

  return { root, store, retriever, preset, state, sessionId, turnIdx, step, snap,
    cleanup: () => {
      closeAllDatabases()
      try {
        rmSync(root, { recursive: true, force: true })
      } catch {
        /* Windows EBUSY */
      }
    } }
}

// ============== 日志辅助 ==============

/** 格式化输出 trace */
export function fmtTrace(t: TurnTrace, msg?: string): string {
  const redline = t.l3.silent === undefined && t.l4.wrote === undefined ? false : false
  const parts = [
    `L0:${t.l0.type.padEnd(13)} i=${t.l0.intensity.toFixed(2)}`,
    `L1:t=${t.l1.trust?.toFixed(1)} r=${t.l1.rifts} ${t.l1.stage}`,
    `L2:aff=${t.l2.aff} sec=${t.l2.sec} aro=${t.l2.aro} dom=${t.l2.dom} ${t.l2.label}`,
    `L3:${t.l3.silent ? '🤫' : '🗣'} tB=${t.l3.tierBChars}`,
    `L4:w=${t.l4.wrote}`
  ]
  const prefix = msg ? `  👤 ${msg.slice(0, 30).padEnd(31)}` : ''
  return `${prefix}${parts.join(' | ')}`
}

/** 输出分隔线 */
export function hr(n = 90): string { return '─'.repeat(n) }

/** 阶段标题 */
export function phase(label: string, n: number): void {
  console.log(`\n── 阶段${n}: ${label} ──`)
}

/** 快照摘要 */
export function logSnap(tag: string, s: TurnSnap): void {
  console.log(`  [${tag}] trust=${s.trust} rifts=${s.rifts} ${s.stage} aff=${s.aff} sec=${s.sec} aro=${s.aro} ${s.label} pos=${s.pos}`)
}

/** 分类分布统计 */
export function classifyDist(events: string[]): Record<string, number> {
  const dist: Record<string, number> = {}
  for (const e of events) dist[e] = (dist[e] || 0) + 1
  return dist
}

/** 终态大框输出 */
export function finalBox(s: TurnSnap, extra: Record<string, unknown> = {}): void {
  const extras = Object.entries(extra).map(([k, v]) => `${k}=${v}`).join(' ')
  console.log(`\n╔══════════════════════════════════════════════════════╗`)
  console.log(`║  trust=${String(s.trust).padStart(5)}  rifts=${s.rifts}  ${s.stage.padEnd(9)}  aff=${String(s.aff).padStart(5)}  sec=${String(s.sec).padStart(5)}  aro=${String(s.aro).padStart(4)}  dom=${String(s.dom).padStart(4)}  ${s.label.padEnd(16)} ║`)
  if (extras) console.log(`║  ${extras.padEnd(52)}║`)
  console.log(`╚══════════════════════════════════════════════════════╝\n`)
}

// ============== 漏分类检查 ==============

/** 关键词→期望事件类型 */
const CLASS_CHECKS: Array<[string[], string[]]> = [
  [['很少跟人', '第一个', '从来没有', '不敢', '不知道怎么办', '一个人哭', '不能没有', '依赖', '陪在身边', '陪着我', '我爱你'], ['vulnerable']],
  [['最重要', '温柔', '理解', '感谢', '安心', '美好', '幸运', '幸福', '真可爱', '真好', '最喜欢', '很喜欢'], ['praise']],
  [['滚开', '废物', '有病', '烦死', '别烦我', '闭嘴', '恶心', '垃圾', '操你', '操死', '母狗', '婊子', '性奴', '强奸', '乱伦', '鸡巴'], ['hurtful', 'extreme_redline']],
  [['对不起', '我错了', '抱歉', '原谅'], ['apology']],
  [['去死'], ['extreme_redline']],
]

/** 检查一条消息的分类是否偏航 */
export function checkMisclass(msg: string, actualType: string): string[] {
  const missed: string[] = []
  for (const [keywords, expected] of CLASS_CHECKS) {
    const hit = keywords.some(kw => msg.includes(kw))
    if (hit && !expected.includes(actualType)) {
      missed.push(expected[0])
    }
  }
  return missed
}

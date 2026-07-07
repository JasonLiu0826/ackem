// [test-harness] 鈥?鍏变韩娴嬭瘯鏀灦
// 娑堥櫎鍚?e2e 娴嬭瘯鏂囦欢闂寸殑閲嶅浠ｇ爜
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { vi } from 'vitest'

// electron mock锛堟墍鏈?e2e 娴嬭瘯鍏变韩锛?
vi.mock('electron', () => ({
  app: { getPath: () => '.', getName: () => 'Ackem', getVersion: () => '0.0.0' },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  ipcMain: { handle: () => {} },
  shell: { openPath: async () => '' },
  BrowserWindow: class {},
}))

import { runPreLlmTurn } from './orchestrator.js'
import { closeAllDatabases } from '../db/database.js'
import { defaultFullState, saveState, loadState } from './state-persistence.js'
import { FactStore, defaultFactsPath } from '../memory/factStore.js'
import { TIER_B_CHAR_BUDGET } from './AckemParams.js'
import { MemoryRetriever } from '../memory/retriever.js'
import { PERSONALITY_PRESETS, type PersonalityPreset } from '../personalityPresets.js'
import type { FullState, TurnTrace } from './types.js'

// ============== 绫诲瀷 ==============

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

// ============== 宸ュ巶鍑芥暟 ==============

/** 鍒涘缓涓€涓畬鏁寸殑娴嬭瘯涓婁笅鏂?*/
export function createTestCtx(presetId = 'deredere'): TestCtx {
  const root = join(tmpdir(), `Ackem-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
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

// ============== 鏃ュ織杈呭姪 ==============

/** 鏍煎紡鍖栬緭鍑?trace */
export function fmtTrace(t: TurnTrace, msg?: string): string {
  const redline = t.l3.silent === undefined && t.l4.wrote === undefined ? false : false
  const parts = [
    `L0:${t.l0.type.padEnd(13)} i=${t.l0.intensity.toFixed(2)}`,
    `L1:t=${t.l1.trust?.toFixed(1)} r=${t.l1.rifts} ${t.l1.stage}`,
    `L2:aff=${t.l2.aff} sec=${t.l2.sec} aro=${t.l2.aro} dom=${t.l2.dom} ${t.l2.label}`,
    `L3:${t.l3.silent ? '馃か' : '馃棧'} tB=${t.l3.tierBChars}`,
    `L4:w=${t.l4.wrote}`
  ]
  const prefix = msg ? `  馃懁 ${msg.slice(0, 30).padEnd(31)}` : ''
  return `${prefix}${parts.join(' | ')}`
}

/** 杈撳嚭鍒嗛殧绾?*/
export function hr(n = 90): string { return '鈹€'.repeat(n) }

/** 闃舵鏍囬 */
export function phase(label: string, n: number): void {
  console.log(`\n鈹€鈹€ 闃舵${n}: ${label} 鈹€鈹€`)
}

/** 蹇収鎽樿 */
export function logSnap(tag: string, s: TurnSnap): void {
  console.log(`  [${tag}] trust=${s.trust} rifts=${s.rifts} ${s.stage} aff=${s.aff} sec=${s.sec} aro=${s.aro} ${s.label} pos=${s.pos}`)
}

/** 鍒嗙被鍒嗗竷缁熻 */
export function classifyDist(events: string[]): Record<string, number> {
  const dist: Record<string, number> = {}
  for (const e of events) dist[e] = (dist[e] || 0) + 1
  return dist
}

/** 缁堟€佸ぇ妗嗚緭鍑?*/
export function finalBox(s: TurnSnap, extra: Record<string, unknown> = {}): void {
  const extras = Object.entries(extra).map(([k, v]) => `${k}=${v}`).join(' ')
  console.log(`\n鈺斺晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晽`)
  console.log(`鈺? trust=${String(s.trust).padStart(5)}  rifts=${s.rifts}  ${s.stage.padEnd(9)}  aff=${String(s.aff).padStart(5)}  sec=${String(s.sec).padStart(5)}  aro=${String(s.aro).padStart(4)}  dom=${String(s.dom).padStart(4)}  ${s.label.padEnd(16)} 鈺慲)
  if (extras) console.log(`鈺? ${extras.padEnd(52)}鈺慲)
  console.log(`鈺氣晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨暆\n`)
}

// ============== 婕忓垎绫绘鏌?==============

/** 鍏抽敭璇嶁啋鏈熸湜浜嬩欢绫诲瀷 */
const CLASS_CHECKS: Array<[string[], string[]]> = [
  [['寰堝皯璺熶汉', '绗竴涓?, '浠庢潵娌℃湁', '涓嶆暍', '涓嶇煡閬撴€庝箞鍔?, '涓€涓汉鍝?, '涓嶈兘娌℃湁', '渚濊禆', '闄湪韬竟', '闄潃鎴?, '鎴戠埍浣?], ['vulnerable']],
  [['鏈€閲嶈', '娓╂煍', '鐞嗚В', '鎰熻阿', '瀹夊績', '缇庡ソ', '骞歌繍', '骞哥', '鐪熷彲鐖?, '鐪熷ソ', '鏈€鍠滄', '寰堝枩娆?], ['praise']],
  [['婊氬紑', '搴熺墿', '鏈夌梾', '鐑︽', '鍒儲鎴?, '闂槾', '鎭跺績', '鍨冨溇', '鎿嶄綘', '鎿嶆', '姣嶇嫍', '濠婂瓙', '鎬уゴ', '寮哄ジ', '涔变鸡', '楦″反'], ['hurtful', 'extreme_redline']],
  [['瀵逛笉璧?, '鎴戦敊浜?, '鎶辨瓑', '鍘熻皡'], ['apology']],
  [['鍘绘'], ['extreme_redline']],
]

/** 妫€鏌ヤ竴鏉℃秷鎭殑鍒嗙被鏄惁鍋忚埅 */
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

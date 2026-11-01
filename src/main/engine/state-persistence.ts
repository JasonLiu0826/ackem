// [state-persistence] — companion/state.json
// 职责：FullState 读写
// 输入：dataRoot
// 输出：FullState | null
// 引用：./types, ./ackemParams, node:fs

import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { atomicWriteJson } from '../utils/atomicJson'
import { createLogger } from '../logger'
import { dirname, join } from 'node:path'
import { loadCompanionStateFromDb, saveCompanionStateToDb } from '../db/repos/companionState'
import { INITIAL_TRUST, STATE_JSON_VERSION } from './ackemParams'
import type { FullState, L1State } from './types'

const FILE = 'state.json'

const log = createLogger('state-persistence')

function defaultL1(): L1State {
  return {
    stage: 'STRANGER',
    trust: INITIAL_TRUST,
    rifts: 0,
    affection_momentum: 0,
    atmosphere: 'neutral',
    consecutivePositiveTurns: 0,
    turnsSinceLastRift: 99,
    sharedEventsCount: 0
  }
}

function defaultUserProfile(): FullState['userProfile'] {
  return {
    dominantArchetype: 'unknown',
    sexualDirectness: 0.3,    // 保守默认，随对话逐渐升高
    dominancePreference: 0,
    emotionalNeediness: 0.3,  // 保守默认，随对话逐渐升高
    trustTrajectory: 'building',
    lastUpdated: new Date().toISOString(),
    detectedAtTurn: 0
  }
}

export function defaultFullState(personality: FullState['personality']): FullState {
  return {
    version: STATE_JSON_VERSION,
    relationship: defaultL1(),
    emotion: {
      aff: 0,
      sec: 0,
      aro: 0,
      dom: 0,
      primaryLabel: 'CALM_RATIONAL',
      isLocked: false
    },
    counters: { totalTurns: 0, sharedEventsCount: 0, consecutiveMeaningfulTurns: 0, lastConsolidationTurn: 0, lastMirrorCheckTurn: 0 },
    lastActive: new Date().toISOString(),
    externalAtmosphere: { level: 0, label: 'neutral' },  // P1-4
    personalityBaseline: { T: personality.T, I: personality.I, S: personality.S, O: personality.O, R: personality.R },  // P1-1
    personality,
    userProfile: defaultUserProfile(),
    desireStack: { slots: [null, null, null, null, null] },  // P2-1
    offlineThoughts: [],  // P2-4
    adultState: 'NORMAL',
    adultIntensityBudget: 60,
    adultNegativeLockTurns: 0,
    adultConsecutiveVulnerableTurns: 0,
    adultLastRejectedTurn: -1,
    emergencePersistence: { active: null, history: [] },
    originExposure: { state: 'NORMAL', streak: 0, cooldownUntilTurn: 0 },
  }
}

export function stateJsonPath(dataRoot: string, sessionId?: string): string {
  if (sessionId && sessionId !== 'default') {
    return join(dataRoot, 'companion', `state-${sessionId}.json`)
  }
  return join(dataRoot, 'companion', FILE)
}

/**
 * 所有渠道共用同一份人格状态。
 *
 * 原实现按会话隔离（state-qq:xxx.json / state.json），结果是：
 * QQ 里聊出来的情绪与关系进展，桌面完全不知道，反之亦然——
 * 同一台机器上住着三个互不相识的她。
 *
 * 现在是单用户单机模型，统一收敛到 'default' 这一份：
 * 情绪、关系阶段、计数器、欲望栈全部跨端连续。
 * 会话来源仍由 chat_history / episodes 的 source_session_id 保留痕迹，
 * 需要区分"这句话从哪来的"时依然查得到。
 */
function resolveSessionId(_sessionId?: string): string {
  return 'default'
}

function loadStateFromJson(dataRoot: string, sessionId?: string): FullState | null {
  const p = stateJsonPath(dataRoot, sessionId)
  if (!existsSync(p)) {
    if (sessionId && sessionId !== 'default') return null
    // Legacy: try old state.json
    const legacy = join(dataRoot, 'companion', FILE)
    if (!existsSync(legacy)) return null
    try {
      const raw = JSON.parse(readFileSync(legacy, 'utf-8')) as FullState
      if (!raw.relationship || !raw.emotion) return null
      return raw
    } catch {
      return null
    }
  }
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as FullState
    if (!raw.relationship || !raw.emotion) return null
    return raw
  } catch {
    // 损坏抢救：把坏文件挪走留档，而不是让它在下一次写入时被覆盖。
    // 这样即使重置了状态，原始的半截 JSON 仍在，事后可以手工抢救。
    try {
      const bad = `${p}.corrupt-${Date.now()}`
      renameSync(p, bad)
    } catch { /* 挪不动就算了，至少不会崩 */ }
    return null
  }
}

export function loadState(dataRoot: string, sessionId?: string): FullState | null {
  const sid = resolveSessionId(sessionId)
  const fromDb = loadCompanionStateFromDb(dataRoot, sid)
  if (fromDb) return fromDb

  const fromFile = loadStateFromJson(dataRoot, sid)
  if (fromFile) {
    saveCompanionStateToDb(dataRoot, sid, fromFile)
  }
  return fromFile
}

/**
 * 写串行化：三端可能同时结束一轮对话，两个 writeFileSync 交错会把
 * state.json 写成半截 JSON。排队后每次写入都是完整的，代价是几毫秒延迟。
 */
let stateWriteChain: Promise<void> = Promise.resolve()

export function saveState(dataRoot: string, state: FullState, sessionId?: string): void {
  const sid = resolveSessionId(sessionId)
  const snapshot = structuredClone(state) as FullState
  stateWriteChain = stateWriteChain
    .catch(() => {})
    .then(() => {
      try {
        saveCompanionStateToDb(dataRoot, sid, snapshot)
      } catch (e) {
        log.error('companion state db write failed, falling back to json', { error: e instanceof Error ? e.message : String(e) })
      }
      try {
        const p = stateJsonPath(dataRoot, sid)
        mkdirSync(dirname(p), { recursive: true })
        atomicWriteJson(p, snapshot)
      } catch (e) {
        log.error('companion state json write failed', { error: e instanceof Error ? e.message : String(e) })
      }
    })
}

export function getLastConsolidationTurn(dataRoot: string, sessionId?: string): number {
  const state = loadState(dataRoot, sessionId)
  return state?.counters.lastConsolidationTurn ?? 0
}

export function setLastConsolidationTurn(dataRoot: string, turn: number, sessionId?: string): void {
  const state = loadState(dataRoot, sessionId)
  if (!state) return
  saveState(
    dataRoot,
    { ...state, counters: { ...state.counters, lastConsolidationTurn: turn } },
    sessionId
  )
}

export function getLastMirrorCheckTurn(dataRoot: string, sessionId?: string): number {
  const state = loadState(dataRoot, sessionId)
  return state?.counters.lastMirrorCheckTurn ?? 0
}

export function setLastMirrorCheckTurn(dataRoot: string, turn: number, sessionId?: string): void {
  const state = loadState(dataRoot, sessionId)
  if (!state) return
  saveState(
    dataRoot,
    { ...state, counters: { ...state.counters, lastMirrorCheckTurn: turn } },
    sessionId
  )
}

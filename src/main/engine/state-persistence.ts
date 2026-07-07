// [state-persistence] 鈥?companion/state.json
// 鑱岃矗锛欶ullState 璇诲啓
// 杈撳叆锛歞ataRoot
// 杈撳嚭锛欶ullState | null
// 寮曠敤锛?/types, ./AckemParams, node:fs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { loadCompanionStateFromDb, saveCompanionStateToDb } from '../db/repos/companionState'
import { INITIAL_TRUST, STATE_JSON_VERSION } from './AckemParams'
import type { FullState, L1State } from './types'

const FILE = 'state.json'

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
    sexualDirectness: 0.3,    // 淇濆畧榛樿锛岄殢瀵硅瘽閫愭笎鍗囬珮
    dominancePreference: 0,
    emotionalNeediness: 0.3,  // 淇濆畧榛樿锛岄殢瀵硅瘽閫愭笎鍗囬珮
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

function resolveSessionId(sessionId?: string): string {
  return sessionId && sessionId.length > 0 ? sessionId : 'default'
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
    return null
  }
}

export function loadState(dataRoot: string, sessionId?: string): FullState | null {
  const sid = resolveSessionId(sessionId)
  const fromDb = loadCompanionStateFromDb(dataRoot, sid)
  if (fromDb) return fromDb

  const fromFile = loadStateFromJson(dataRoot, sessionId)
  if (fromFile) {
    saveCompanionStateToDb(dataRoot, sid, fromFile)
  }
  return fromFile
}

export function saveState(dataRoot: string, state: FullState, sessionId?: string): void {
  const sid = resolveSessionId(sessionId)
  saveCompanionStateToDb(dataRoot, sid, state)
  const p = stateJsonPath(dataRoot, sessionId)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(state, null, 2), 'utf-8')
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

// [factStore.decayLambda] — 巩固只应减速、不应加速
//
// 回归：先前 λ 被无条件替换为 CONSOLIDATED_DECAY_LAMBDA(0.003)，
// 使 λ=0 的 COMMITMENTS（承诺永不遗忘）在巩固后开始衰减。

import { describe, expect, it } from 'vitest'
import { CATEGORY_META } from './taxonomy'
import { FactStore, defaultFactsPath, effectiveDecayLambda } from './factStore'
import type { MemoryFact } from './semantic/types'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach } from 'vitest'

const DAY = 86400000
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function factAt(ageDays: number, overrides: Partial<MemoryFact> = {}): MemoryFact {
  const created = new Date(Date.now() - ageDays * DAY).toISOString()
  return {
    id: 'f1',
    summary: '用户承诺不再熬夜',
    subject: '用户',
    domain: 'TEMPORAL',
    subcategory: 'COMMITMENTS',
    weight: 2,
    confidence: 1,
    status: 'active',
    emotionalContext: { valence: 0, intensity: 0, relStage: 'FAMILIAR', trust: 50, atmosphere: 'neutral' },
    selfRelevance: 1,
    triggers: [],
    updateTrail: [],
    sourceSessionId: 'main',
    sourceTurnIndex: 1,
    createdAt: created,
    updatedAt: created,
    ...overrides
  }
}

describe('effectiveDecayLambda', () => {
  it('never accelerates decay when a fact is consolidated', () => {
    for (const base of [0, 0.001, 0.002, 0.003, 0.005, 0.02, 0.05, 0.1]) {
      expect(effectiveDecayLambda('consolidated', base)).toBeLessThanOrEqual(base)
    }
  })

  it('keeps zero-decay categories at zero (commitments never fade)', () => {
    expect(effectiveDecayLambda('consolidated', 0)).toBe(0)
    // 未巩固时不受影响
    expect(effectiveDecayLambda('raw', 0)).toBe(0)
    expect(effectiveDecayLambda(undefined, 0)).toBe(0)
  })

  it('still slows fast-decaying categories down to the consolidated half-life', () => {
    expect(effectiveDecayLambda('consolidated', 0.1)).toBeCloseTo(0.003, 10)
    expect(effectiveDecayLambda('raw', 0.1)).toBe(0.1)
  })
})

describe('FactStore.scoreRelevance', () => {
  function store(): FactStore {
    const root = mkdtempSync(join(tmpdir(), 'ackem-decay-lambda-'))
    roots.push(root)
    return new FactStore(defaultFactsPath(root))
  }

  it('a consolidated commitment stays as strong as a raw one', () => {
    const s = store()
    const now = Date.now()
    // 2000 天前许下的承诺：若被误加速到 0.003，衰减因子会是 e^-6 ≈ 0.0025
    const raw = s.scoreRelevance(factAt(2000), now)
    const consolidated = s.scoreRelevance(factAt(2000, { factLayer: 'consolidated' }), now)
    expect(consolidated).toBeCloseTo(raw, 10)
    expect(consolidated).toBeGreaterThan(raw * 0.99)
  })

  it('a consolidated volatile mood survives longer than a raw one', () => {
    const s = store()
    const now = Date.now()
    const mood = { subcategory: 'MOOD' as const, domain: 'INNER_WORLD' }
    const raw = s.scoreRelevance(factAt(200, mood), now)
    const consolidated = s.scoreRelevance(factAt(200, { ...mood, factLayer: 'consolidated' }), now)
    // λ 0.05 → 0.003：巩固后衰减明显更慢
    expect(consolidated).toBeGreaterThan(raw)
  })

  it('sanity: the taxonomy value this regression depends on is really zero', () => {
    expect(CATEGORY_META.COMMITMENTS.decayLambda).toBe(0)
  })
})

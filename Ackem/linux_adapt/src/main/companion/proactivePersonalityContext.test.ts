import { describe, expect, it } from 'vitest'
import { ALL_PERSONALITIES } from '../prompt/personality'
import {
  buildProactivePersonalityBlock,
  pickCompanionProactiveKind,
  pickPersonalityHarassDelayMs,
  pickPersonalityProactiveFallback,
  shouldHarassTickForPersonality
} from './proactivePersonalityContext'
import type { AppSettings } from '../settings'

const baseSettings = {
  personalityPresetId: 'tsundere',
  adultContentMode: false,
  ageConfirmed18: false
} as AppSettings

describe('proactivePersonalityContext', () => {
  it('buildProactivePersonalityBlock covers all 29 presets', () => {
    for (const id of Object.keys(ALL_PERSONALITIES)) {
      const block = buildProactivePersonalityBlock({
        presetId: id,
        settings: { ...baseSettings, personalityPresetId: id },
        aff: 50,
        harass: true
      })
      expect(block).toContain('核心矛盾')
      expect(block).toContain('骚扰模式')
    }
  })

  it('pickPersonalityProactiveFallback returns preset-specific lines', () => {
    const tsundere = pickPersonalityProactiveFallback('tsundere', 60, true, () => 0)
    const kuudere = pickPersonalityProactiveFallback('kuudere', 60, true, () => 0)
    expect(tsundere).not.toBe(kuudere)
  })

  it('low-initiative presets skip harass more often', () => {
    let kuudereHits = 0
    let genkiHits = 0
    for (let i = 0; i < 200; i++) {
      if (shouldHarassTickForPersonality('kuudere', () => i / 200)) kuudereHits++
      if (shouldHarassTickForPersonality('genki', () => i / 200)) genkiHits++
    }
    expect(genkiHits).toBeGreaterThan(kuudereHits)
  })

  it('low-initiative presets use longer harass delays on average', () => {
    const kuAvg =
      Array.from({ length: 100 }, (_, i) =>
        pickPersonalityHarassDelayMs('kuudere', () => i / 100)
      ).reduce((a, b) => a + b, 0) / 100
    const genkiAvg =
      Array.from({ length: 100 }, (_, i) =>
        pickPersonalityHarassDelayMs('genki', () => i / 100)
      ).reduce((a, b) => a + b, 0) / 100
    expect(kuAvg).toBeGreaterThan(genkiAvg)
  })

  it('harass kind pool favors nudge for high-I presets', () => {
    const kinds = new Set<string>()
    for (let i = 0; i < 30; i++) {
      kinds.add(
        pickCompanionProactiveKind({
          fact: null,
          aff: 50,
          stage: 'FRIEND',
          harass: true,
          presetId: 'mesugaki'
        })
      )
    }
    expect(kinds.has('playful_nudge') || kinds.has('miss_you')).toBe(true)
  })

  it('harass kind pool favors check_in for kuudere', () => {
    const kinds = new Set<string>()
    for (let i = 0; i < 30; i++) {
      kinds.add(
        pickCompanionProactiveKind({
          fact: '用户喜欢猫',
          aff: 50,
          stage: 'FRIEND',
          harass: true,
          presetId: 'kuudere'
        })
      )
    }
    expect(kinds.has('check_in') || kinds.has('memory_echo')).toBe(true)
  })
})

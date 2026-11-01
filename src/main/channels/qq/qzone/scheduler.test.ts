import { describe, expect, it } from 'vitest'
import {
  activeHours,
  computeNextPublishAt,
  decideQzonePublish,
  dailyCountFor,
  isWithinActiveHours,
  localDateKey,
  nextWindowStart,
  type QzonePlanSettings
} from './scheduler'
import type { QzonePlan } from './types'

const baseSettings: QzonePlanSettings = {
  qzoneAutoEnabled: true,
  qzoneDailyLimit: 2,
  qzoneMinIntervalMinutes: 120,
  qzoneActiveStartHour: 9,
  qzoneActiveEndHour: 23
}

function plan(overrides: Partial<QzonePlan> = {}): QzonePlan {
  return { selfId: '10001', dailyCount: 0, ...overrides }
}

const at = (iso: string) => new Date(iso)

describe('isWithinActiveHours', () => {
  it('handles normal windows', () => {
    expect(isWithinActiveHours(9, 9, 23)).toBe(true)
    expect(isWithinActiveHours(22, 9, 23)).toBe(true)
    expect(isWithinActiveHours(23, 9, 23)).toBe(false)
    expect(isWithinActiveHours(8, 9, 23)).toBe(false)
  })

  it('handles cross-night windows', () => {
    expect(isWithinActiveHours(23, 22, 3)).toBe(true)
    expect(isWithinActiveHours(2, 22, 3)).toBe(true)
    expect(isWithinActiveHours(12, 22, 3)).toBe(false)
  })

  it('treats start === end as all day', () => {
    expect(isWithinActiveHours(4, 0, 0)).toBe(true)
  })
})

describe('activeHours / nextWindowStart', () => {
  it('clamps and defaults', () => {
    expect(activeHours({ ...baseSettings, qzoneActiveStartHour: -3 })).toEqual({ start: 0, end: 23 })
    expect(activeHours({ ...baseSettings, qzoneActiveEndHour: 99 })).toEqual({ start: 9, end: 23 })
  })

  it('rolls to tomorrow when the hour has passed', () => {
    const now = at('2026-10-31T15:00:00')
    const next = nextWindowStart(now, 9)
    expect(localDateKey(next)).toBe('2026-11-01')
    expect(next.getHours()).toBe(9)
  })
})

describe('decideQzonePublish', () => {
  it('skips when automation is off', () => {
    const res = decideQzonePublish({
      now: at('2026-10-31T15:00:00'),
      settings: { ...baseSettings, qzoneAutoEnabled: false },
      plan: plan()
    })
    expect(res.publish).toBe(false)
    expect(res.reason).toBe('disabled')
  })

  it('skips outside the active window and plans the next window', () => {
    const res = decideQzonePublish({
      now: at('2026-10-31T23:30:00'),
      settings: baseSettings,
      plan: plan()
    })
    expect(res.publish).toBe(false)
    expect(res.reason).toBe('outside_hours')
    expect(res.nextPublishAt).toBeTruthy()
    expect(new Date(res.nextPublishAt!).getHours()).toBe(9)
  })

  it('enforces the daily limit', () => {
    const now = at('2026-10-31T15:00:00')
    const res = decideQzonePublish({
      now,
      settings: baseSettings,
      plan: plan({ dailyDate: localDateKey(now), dailyCount: 2 })
    })
    expect(res.publish).toBe(false)
    expect(res.reason).toBe('daily_limit')
    expect(localDateKey(new Date(res.nextPublishAt!))).toBe('2026-11-01')
  })

  it('ignores yesterday count', () => {
    const now = at('2026-10-31T15:00:00')
    expect(dailyCountFor(plan({ dailyDate: '2026-10-30', dailyCount: 5 }), now)).toBe(0)
    const res = decideQzonePublish({
      now,
      settings: baseSettings,
      plan: plan({ dailyDate: '2026-10-30', dailyCount: 5 })
    })
    expect(res.publish).toBe(true)
  })

  it('enforces the minimum interval', () => {
    const now = at('2026-10-31T15:00:00')
    const res = decideQzonePublish({
      now,
      settings: baseSettings,
      plan: plan({ lastPublishAt: at('2026-10-31T14:30:00').toISOString() })
    })
    expect(res.publish).toBe(false)
    expect(res.reason).toBe('min_interval')
    expect(new Date(res.nextPublishAt!).getTime()).toBe(
      at('2026-10-31T16:30:00').getTime()
    )
  })

  it('waits for the planned slot', () => {
    const now = at('2026-10-31T15:00:00')
    const res = decideQzonePublish({
      now,
      settings: baseSettings,
      plan: plan({ nextPublishAt: at('2026-10-31T17:00:00').toISOString() })
    })
    expect(res.publish).toBe(false)
    expect(res.reason).toBe('waiting')
  })

  it('publishes once everything lines up', () => {
    const now = at('2026-10-31T15:00:00')
    const res = decideQzonePublish({
      now,
      settings: baseSettings,
      plan: plan({
        dailyDate: localDateKey(now),
        dailyCount: 1,
        lastPublishAt: at('2026-10-31T12:00:00').toISOString(),
        nextPublishAt: at('2026-10-31T14:30:00').toISOString()
      })
    })
    expect(res.publish).toBe(true)
    expect(res.reason).toBe('due')
  })
})

describe('computeNextPublishAt', () => {
  it('respects the minimum interval and the active window', () => {
    const from = at('2026-10-31T09:10:00')
    const next = new Date(computeNextPublishAt(baseSettings, from, () => 0))
    expect(next.getTime() - from.getTime()).toBeGreaterThanOrEqual(120 * 60_000)
    expect(isWithinActiveHours(next.getHours(), 9, 23)).toBe(true)
  })

  it('falls back to the next window start when the slot lands outside', () => {
    const from = at('2026-10-31T22:50:00')
    const next = new Date(computeNextPublishAt(baseSettings, from, () => 1))
    expect(localDateKey(next)).toBe('2026-11-01')
    expect(next.getHours()).toBe(9)
  })
})

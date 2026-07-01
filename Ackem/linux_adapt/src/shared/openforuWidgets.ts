/** OpenForU Widget Catalog — 宿主提供的可交互 Surface 模板 */

import type { InteractionRequiredLevel } from './openforuInteraction'

export const OPENFORU_WIDGET_IDS = [
  'timer.pomodoro',
  'timer.countdown',
  'counter.simple',
  'checklist.basic'
] as const

export type OpenForUWidgetId = (typeof OPENFORU_WIDGET_IDS)[number]

export function isOpenForUWidgetId(id: string): id is OpenForUWidgetId {
  return (OPENFORU_WIDGET_IDS as readonly string[]).includes(id)
}

export type PomodoroWidgetConfig = {
  focusMinutes?: number
  breakMinutes?: number
  primaryActions?: string[]
}

export type CounterWidgetConfig = {
  initial?: number
  step?: number
  primaryActions?: string[]
}

export type CountdownWidgetConfig = {
  durationSec?: number
  label?: string
  primaryActions?: string[]
}

export type ChecklistWidgetConfig = {
  items?: string[]
  primaryActions?: string[]
}

export function inferWidgetIdFromText(text: string): OpenForUWidgetId {
  const t = text.toLowerCase()
  if (/番茄|pomodoro|专注.*钟/.test(t)) return 'timer.pomodoro'
  if (/倒计时|countdown/.test(t)) return 'timer.countdown'
  if (/清单|待办|todo|checklist/.test(t)) return 'checklist.basic'
  if (/计数|打卡|counter|\+1/.test(t)) return 'counter.simple'
  return 'timer.pomodoro'
}

export function defaultWidgetConfig(
  widgetId: OpenForUWidgetId,
  primaryActions: string[]
): Record<string, unknown> {
  switch (widgetId) {
    case 'timer.pomodoro':
      return { focusMinutes: 25, breakMinutes: 5, primaryActions }
    case 'timer.countdown':
      return { durationSec: 300, label: '倒计时', primaryActions }
    case 'counter.simple':
      return { initial: 0, step: 1, primaryActions }
    case 'checklist.basic':
      return { items: ['第一项'], primaryActions }
    default:
      return { primaryActions }
  }
}

export function validateWidgetConfig(
  widgetId: string,
  config: Record<string, unknown> | undefined
): string[] {
  if (!isOpenForUWidgetId(widgetId)) {
    return [`未知 widget: ${widgetId}`]
  }
  const errors: string[] = []
  const c = config ?? {}
  switch (widgetId) {
    case 'timer.pomodoro': {
      const fm = Number(c.focusMinutes ?? 25)
      const bm = Number(c.breakMinutes ?? 5)
      if (!Number.isFinite(fm) || fm < 1 || fm > 180) errors.push('focusMinutes 须在 1–180')
      if (!Number.isFinite(bm) || bm < 1 || bm > 60) errors.push('breakMinutes 须在 1–60')
      break
    }
    case 'timer.countdown': {
      const sec = Number(c.durationSec ?? 300)
      if (!Number.isFinite(sec) || sec < 5 || sec > 86400) errors.push('durationSec 须在 5–86400')
      break
    }
    case 'counter.simple': {
      const step = Number(c.step ?? 1)
      if (!Number.isFinite(step) || step < 1) errors.push('step 须 >= 1')
      break
    }
    case 'checklist.basic': {
      const items = c.items
      if (!Array.isArray(items) || items.length < 1) errors.push('items 至少 1 项')
      break
    }
  }
  return errors
}

export function widgetRequiredLevel(widgetId: OpenForUWidgetId): InteractionRequiredLevel {
  switch (widgetId) {
    case 'timer.pomodoro':
    case 'timer.countdown':
      return 'L2'
    default:
      return 'L1'
  }
}

export function widgetActionManifest(widgetId: OpenForUWidgetId, primaryActions: string[]): string[] {
  switch (widgetId) {
    case 'timer.pomodoro':
    case 'timer.countdown':
      return [
        primaryActions.find((a) => /开始|start|专注/i.test(a)) ?? '开始',
        primaryActions.find((a) => /重置|reset/i.test(a)) ?? '重置'
      ]
    case 'counter.simple':
      return ['+', '-', ...(primaryActions.filter((a) => /重置|reset/i.test(a)) || ['重置'])]
    case 'checklist.basic':
      return primaryActions.length ? primaryActions : ['添加']
    default:
      return primaryActions
  }
}

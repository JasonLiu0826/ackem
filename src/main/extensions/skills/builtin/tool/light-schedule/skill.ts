import { loadSettings } from '../../../../../settings'
import { resolveDataRoot } from '../../../../../paths'
import type { SkillHandler, SkillInvocation, SkillResult } from '../../../types'
import { LIGHT_SCHEDULE_MANIFEST } from './manifest'
import {
  addScheduleItem,
  formatScheduleList,
  isAllowedScheduleDate,
  listScheduleForDate,
  normalizeScheduleDate,
  removeScheduleItem,
  type ScheduleAction
} from './scheduleStorage'

function resolveDataRootForSkill(): string {
  try {
    return resolveDataRoot(loadSettings())
  } catch {
    return process.env.Ackem_TEST_DATA_ROOT ?? ''
  }
}

async function execute(invocation: SkillInvocation): Promise<SkillResult> {
  const start = Date.now()
  const dataRoot = resolveDataRootForSkill()
  const action = String(invocation.args?.action ?? 'list').trim() as ScheduleAction
  const content = typeof invocation.args?.content === 'string' ? invocation.args.content : ''
  const time = typeof invocation.args?.time === 'string' ? invocation.args.time : undefined
  const date = normalizeScheduleDate(
    typeof invocation.args?.date === 'string' ? invocation.args.date : undefined
  )

  if (!isAllowedScheduleDate(date)) {
    return {
      ok: false,
      output: '',
      error: '浠呮敮鎸佷粖澶╂垨鏄庡ぉ鐨勬棩绋?,
      injectToContext: false,
      events: [],
      durationMs: Date.now() - start
    }
  }

  if (action === 'add') {
    if (!content.trim()) {
      return {
        ok: false,
        output: '',
        error: 'content required for add',
        injectToContext: false,
        events: [],
        durationMs: Date.now() - start
      }
    }
    const line = addScheduleItem(dataRoot, date, time, content)
    return {
      ok: true,
      output: `宸茶涓嬶細${line.replace(/^- \[ \] /, '')}`,
      injectToContext: true,
      events: [],
      data: { action, date, line },
      durationMs: Date.now() - start
    }
  }

  if (action === 'remove') {
    const removed = removeScheduleItem(dataRoot, date, content || invocation.userMessage || '')
    return {
      ok: removed,
      output: removed ? '宸蹭粠鏃ョ▼涓Щ闄よ椤广€? : '鏈壘鍒板尮閰嶇殑鏃ョ▼椤广€?,
      injectToContext: true,
      events: [],
      durationMs: Date.now() - start
    }
  }

  const items = listScheduleForDate(dataRoot, date)
  const output = formatScheduleList(date, items)
  return {
    ok: true,
    output,
    injectToContext: true,
    events: [],
    data: { action: 'list', date, items },
    durationMs: Date.now() - start
  }
}

export const lightScheduleSkill: SkillHandler = {
  manifest: LIGHT_SCHEDULE_MANIFEST,
  execute
}

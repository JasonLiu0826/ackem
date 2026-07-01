/**
 * OpenForU OID — Surface Widget 宿主运行时（主进程 state + invoke）
 */
import type { WebContents } from 'electron'

import type { OpenForUWidgetId } from '../../../../shared/openforuWidgets'
import { isOpenForUWidgetId } from '../../../../shared/openforuWidgets'

export type WidgetSurfaceState = Record<string, unknown> & {
  widgetId: OpenForUWidgetId
  statusText?: string
  activeAction?: string
}

type Session = {
  extensionId: string
  widgetId: OpenForUWidgetId
  config: Record<string, unknown>
  state: WidgetSurfaceState
  timer?: ReturnType<typeof setInterval>
  webContents?: WebContents
}

const sessions = new Map<string, Session>()

function formatMs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function matchAction(action: string, aliases: string[]): boolean {
  const a = action.trim().toLowerCase()
  return aliases.some((t) => {
    const x = t.trim().toLowerCase()
    return a === x || a.includes(x) || x.includes(a)
  })
}

function pushState(extensionId: string): void {
  const session = sessions.get(extensionId)
  if (!session?.webContents || session.webContents.isDestroyed()) return
  session.webContents.send('surface:state-update', session.state)
}

function clearTimer(session: Session): void {
  if (session.timer) {
    clearInterval(session.timer)
    session.timer = undefined
  }
}

function initPomodoroState(config: Record<string, unknown>): WidgetSurfaceState {
  const focusMinutes = Number(config.focusMinutes ?? 25)
  return {
    widgetId: 'timer.pomodoro',
    running: false,
    phase: 'idle',
    phaseLabel: '就绪',
    focusMinutes,
    breakMinutes: Number(config.breakMinutes ?? 5),
    remainingMs: focusMinutes * 60_000,
    display: formatMs(focusMinutes * 60_000),
    statusText: '点击开始专注'
  }
}

function initCountdownState(config: Record<string, unknown>): WidgetSurfaceState {
  const durationSec = Number(config.durationSec ?? 300)
  return {
    widgetId: 'timer.countdown',
    running: false,
    durationSec,
    remainingMs: durationSec * 1000,
    display: formatMs(durationSec * 1000),
    phaseLabel: String(config.label ?? '倒计时'),
    statusText: '就绪'
  }
}

function initCounterState(config: Record<string, unknown>): WidgetSurfaceState {
  const count = Number(config.initial ?? 0)
  return {
    widgetId: 'counter.simple',
    count,
    step: Number(config.step ?? 1),
    statusText: `当前 ${count}`
  }
}

function initChecklistState(config: Record<string, unknown>): WidgetSurfaceState {
  const items = (config.items as string[] | undefined) ?? ['第一项']
  return {
    widgetId: 'checklist.basic',
    itemCount: items.length,
    items,
    statusText: `清单 ${items.length} 项`
  }
}

function createInitialState(widgetId: OpenForUWidgetId, config: Record<string, unknown>): WidgetSurfaceState {
  switch (widgetId) {
    case 'timer.pomodoro':
      return initPomodoroState(config)
    case 'timer.countdown':
      return initCountdownState(config)
    case 'counter.simple':
      return initCounterState(config)
    case 'checklist.basic':
      return initChecklistState(config)
    default:
      return { widgetId, statusText: '就绪' }
  }
}

function startTick(extensionId: string): void {
  const session = sessions.get(extensionId)
  if (!session || session.timer) return
  session.timer = setInterval(() => {
    const s = sessions.get(extensionId)
    if (!s) return
    const st = s.state
    if (!st.running) return
    const remaining = Number(st.remainingMs ?? 0) - 1000
    st.remainingMs = Math.max(0, remaining)
    st.display = formatMs(st.remainingMs)
    if (st.remainingMs <= 0) {
      st.running = false
      st.phase = 'idle'
      st.phaseLabel = '完成'
      st.statusText = '计时结束'
      clearTimer(s)
    }
    pushState(extensionId)
  }, 1000)
}

function handlePomodoroInvoke(session: Session, action: string): void {
  const st = session.state
  const startAliases = ['开始', 'start', '专注', '开始专注']
  const resetAliases = ['重置', 'reset', '停止']

  if (matchAction(action, startAliases)) {
    clearTimer(session)
    st.running = true
    st.phase = 'focus'
    st.phaseLabel = '专注中'
    st.activeAction = action
    st.remainingMs = Number(st.focusMinutes ?? 25) * 60_000
    st.display = formatMs(st.remainingMs)
    st.statusText = '专注计时中'
    startTick(session.extensionId)
    return
  }
  if (matchAction(action, resetAliases)) {
    clearTimer(session)
    Object.assign(st, initPomodoroState(session.config))
    st.activeAction = action
    return
  }
  st.statusText = `未知操作：${action}`
}

function handleCountdownInvoke(session: Session, action: string): void {
  const st = session.state
  if (matchAction(action, ['开始', 'start'])) {
    clearTimer(session)
    st.running = true
    st.activeAction = action
    st.remainingMs = Number(st.durationSec ?? 300) * 1000
    st.display = formatMs(st.remainingMs)
    st.statusText = '倒计时中'
    startTick(session.extensionId)
    return
  }
  if (matchAction(action, ['重置', 'reset'])) {
    clearTimer(session)
    Object.assign(st, initCountdownState(session.config))
    st.activeAction = action
  }
}

function handleCounterInvoke(session: Session, action: string): void {
  const st = session.state
  const step = Number(st.step ?? 1)
  let count = Number(st.count ?? 0)
  if (matchAction(action, ['+', '加', '增', 'plus'])) {
    count += step
    st.activeAction = action
  } else if (matchAction(action, ['-', '减', 'minus'])) {
    count -= step
    st.activeAction = action
  } else if (matchAction(action, ['重置', 'reset'])) {
    count = Number(session.config.initial ?? 0)
    st.activeAction = action
  } else {
    st.statusText = `未知操作：${action}`
    return
  }
  st.count = count
  st.statusText = `当前 ${count}`
}

function handleChecklistInvoke(session: Session, action: string): void {
  const st = session.state
  if (matchAction(action, ['添加', 'add'])) {
    const items = [...((st.items as string[]) ?? []), '新项']
    st.items = items
    st.itemCount = items.length
    st.statusText = `清单 ${items.length} 项`
    st.activeAction = action
  }
}

/** 注册 widget 会话（打开 Surface 前调用） */
export function registerSurfaceWidgetSession(
  extensionId: string,
  widgetId: string,
  config: Record<string, unknown>
): void {
  if (!isOpenForUWidgetId(widgetId)) return
  const existing = sessions.get(extensionId)
  if (existing) clearTimer(existing)
  sessions.set(extensionId, {
    extensionId,
    widgetId,
    config,
    state: createInitialState(widgetId, config)
  })
}

export function bindSurfaceWidgetWebContents(extensionId: string, webContents: WebContents): void {
  const session = sessions.get(extensionId)
  if (!session) return
  session.webContents = webContents
  pushState(extensionId)
}

export function unregisterSurfaceWidgetSession(extensionId: string): void {
  const session = sessions.get(extensionId)
  if (session) clearTimer(session)
  sessions.delete(extensionId)
}

export function getSurfaceWidgetState(extensionId: string): WidgetSurfaceState | null {
  return sessions.get(extensionId)?.state ?? null
}

export function invokeSurfaceWidget(
  extensionId: string,
  action: string,
  _payload?: unknown
): { ok: boolean; state?: WidgetSurfaceState; error?: string } {
  const session = sessions.get(extensionId)
  if (!session) {
    return { ok: false, error: 'widget session 未注册' }
  }

  switch (session.widgetId) {
    case 'timer.pomodoro':
      handlePomodoroInvoke(session, action)
      break
    case 'timer.countdown':
      handleCountdownInvoke(session, action)
      break
    case 'counter.simple':
      handleCounterInvoke(session, action)
      break
    case 'checklist.basic':
      handleChecklistInvoke(session, action)
      break
    default:
      return { ok: false, error: `未知 widget: ${session.widgetId}` }
  }

  pushState(extensionId)
  return { ok: true, state: { ...session.state } }
}

export function resetSurfaceWidgetRuntimeForTests(): void {
  for (const id of [...sessions.keys()]) {
    unregisterSurfaceWidgetSession(id)
  }
}

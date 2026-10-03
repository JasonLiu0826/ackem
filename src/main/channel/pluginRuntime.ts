import {
  getSurfaceWidgetState,
  invokeSurfaceWidget,
  registerSurfaceWidgetSession
} from '../extensions/openforu/surface/surfaceWidgetRuntime'
import { pickSlots } from './residualSlots'
import { resetLastPlugin } from './pinnedSlot'

export type PluginStartResult = {
  ok: boolean
  extensionId: string
  durationMin?: number
  note?: string
  status: 'running' | 'failed' | 'not_executed'
  receipt: { kind: 'timer_start' | 'none'; running?: boolean; error?: string }
}

export type PluginStopResult = {
  ok: boolean
  extensionId?: string
  note: string
}

function surfaceKeys(extensionId: string): string[] {
  const bare = extensionId.replace(/@.*$/, '')
  const keys = [extensionId, bare]
  if (!bare.includes('@')) keys.push(`${bare}@1.0.0`)
  return [...new Set(keys)]
}

function firstLiveKey(extensionId: string): string | undefined {
  return surfaceKeys(extensionId).find((id) => getSurfaceWidgetState(id))
}

function durationOf(params: Record<string, unknown>): number | undefined {
  const n = Number(params.durationMin ?? params.duration)
  if (!Number.isFinite(n) || n < 1 || n > 180) return undefined
  return Math.round(n)
}

/** 把计划槽落到计时器。没有 Surface 窗口也能先挂号再开始。 */
export function startPluginRuntime(input: {
  extensionId: string
  tag?: string | null
  params?: Record<string, unknown>
}): PluginStartResult {
  const slots = pickSlots(input.params)
  const durationMin = durationOf(slots)
  const timeLike = input.tag === 'time' || durationMin != null
  if (!timeLike) {
    return { ok: true, extensionId: input.extensionId, status: 'not_executed', receipt: { kind: 'none' } }
  }

  const key = firstLiveKey(input.extensionId) ?? input.extensionId
  const existing = getSurfaceWidgetState(key)
  const widgetId = existing?.widgetId === 'timer.countdown' ? 'timer.countdown' : 'timer.pomodoro'
  registerSurfaceWidgetSession(key, widgetId, {
    focusMinutes: durationMin ?? Number(existing?.focusMinutes ?? 25),
    durationSec: durationMin ? durationMin * 60 : Number(existing?.durationSec ?? 300)
  })
  const started = invokeSurfaceWidget(key, '开始', { durationMin })
  return {
    ok: started.ok,
    extensionId: key,
    durationMin,
    status: started.ok ? 'running' : 'failed',
    receipt: { kind: 'timer_start', running: started.ok, error: started.ok ? undefined : started.error },
    note: started.ok
      ? `【状态】计时已开始${durationMin ? ` ${durationMin} 分钟` : ''}。`
      : started.error
  }
}

export function stopPluginRuntime(extensionId?: string, sessionId?: string): PluginStopResult {
  if (!extensionId) {
    return { ok: false, note: '【本轮通道】chat\n【状态】没有可停的插件。不中止任务。' }
  }
  const key = firstLiveKey(extensionId) ?? extensionId
  const live = getSurfaceWidgetState(key)
  if (!live) {
    return {
      ok: false,
      extensionId,
      note: '【本轮通道】chat\n【状态】没有在跑的计时。不中止任务。'
    }
  }
  const stopped = invokeSurfaceWidget(key, '停止')
  const stoppedOk = Boolean(stopped.ok && stopped.state && stopped.state.running === false)
  if (sessionId && stoppedOk) resetLastPlugin(sessionId)
  return {
    ok: Boolean(stopped.ok && stopped.state && stopped.state.running === false),
    extensionId: key,
    note: stopped.ok
      ? `【本轮通道】chat\n【状态】已停止 ${key}。不中止任务。`
      : `【本轮通道】chat\n【状态】未能停止 ${key}：${stopped.error ?? ''}。不中止任务。`
  }
}

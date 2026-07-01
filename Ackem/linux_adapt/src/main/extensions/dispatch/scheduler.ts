import { createLogger } from '../../logger'
import { buildRuntimeContext } from '../../context/runtimeContext'
import type { RuntimeContext } from '../../context/types'
import type { EngineSnapshot } from '../protocols'
import type { ExtensionsCoordinator } from '../coordinator'
import { getLastTriggeredAt, recordDispatchTrigger } from './dispatchSession'
import { isDailyAtDue } from './dailyAtSchedule'
import { isMaintenanceAutonomous } from './maintenanceAutonomous'
import { isWithinActiveHours } from './candidateCollector'
import {
  evaluateAutonomousExtensionPolicy,
  buildPolicyTracePayload,
  isHealthAutonomous
} from '../policy/evaluate'
import { recordProactiveMessage } from '../policy/attentionBudget'
import { tickAutonomousPluginEntry } from './autonomousPluginTick'
import { evaluateProactiveGate } from '../policy/proactiveGate'
import { matchHabits, promoteShortTermHabits, cleanupExpired, decayLongTermHabits } from '../../memory/habitsStore'
import { scanForegroundHistory } from '../../memory/foregroundHistory'
import { getForegroundSnapshot } from '../../context/foregroundState'
import { isAttentionBudgetExceeded, loadAttentionBudget } from '../policy/attentionBudget'
import { decideToolAction } from '../policy/toolDecider'
import type { UserHabit } from '../policy/types'

const log = createLogger('dispatch-scheduler')

const TICK_MS = 60_000
const GLOBAL_SESSION = '__autonomous__'

export type DispatchSchedulerOptions = {
  coordinator: ExtensionsCoordinator
  getSnapshot: () => EngineSnapshot | null
  onProactiveMessage?: (payload: { extensionId: string; message: string }) => void
}

let timer: ReturnType<typeof setInterval> | null = null

function intervalDue(
  rule: number,
  extensionId: string,
  now: number
): boolean {
  const last = getLastTriggeredAt(GLOBAL_SESSION, extensionId) ?? 0
  return now - last >= rule
}

function resolveRuntimeForTick(
  coordinator: ExtensionsCoordinator,
  snapshot: EngineSnapshot
): RuntimeContext | null {
  const cached = coordinator.getRuntimeContext()
  if (cached) return cached
  try {
    return buildRuntimeContext({
      dataRoot: coordinator.getDataRoot(),
      sessionId: snapshot.sessionId,
      lastActiveAt: snapshot.lastActiveAt,
      memoryFactSummaries: snapshot.memory.recentFactSummaries
    })
  } catch {
    return null
  }
}

/** ED-07 + JP-A + proactiveGate：autonomous tick */
export async function tickAutonomousDispatch(opts: DispatchSchedulerOptions): Promise<void> {
  const snapshot = opts.getSnapshot()
  if (!snapshot) return

  const runtime = resolveRuntimeForTick(opts.coordinator, snapshot)
  if (!runtime) {
    log.warn('autonomous tick skipped: no RuntimeContext')
    return
  }

  const dataRoot = opts.coordinator.getDataRoot()
  const now = Date.now()
  const nowDate = new Date(now)

  // ═══ 每日习惯维护（每小时尝试一次） ═══
  await tryDailyMaintenance(dataRoot)

  try {
    const { tryCatchUpMissedDiary } = await import(
      '../skills/builtin/diary-auto/diaryCatchUp.js'
    )
    await tryCatchUpMissedDiary(dataRoot, nowDate)
  } catch (e) {
    log.warn('diary catch-up tick failed', e)
  }

  // ═══ proactiveGate：会话级"该不该说话"决策（新增） ═══
  const habits = matchHabits(dataRoot, nowDate)
  const foreground = getForegroundSnapshot()
  const budget = loadAttentionBudget(dataRoot)
  const budgetExceeded = isAttentionBudgetExceeded(budget, now)

  const gateResult = evaluateProactiveGate({
    snapshot,
    runtime,
    matchedHabits: habits,
    foregroundBusy: foreground.enabled && foreground.shouldSuppressHealth,
    attentionBudgetExceeded: budgetExceeded,
    dataRoot,
  })

  if (gateResult.proactiveLevel === 'silent') {
    log.info('proactiveGate: silent, skipping non-maintenance autonomous tick', {
      reason: gateResult.reason
    })
  }

  const catalog = opts.coordinator
    .getDispatchCatalog(GLOBAL_SESSION)
    .filter((e) => e.dispatch.mode === 'autonomous' && e.status === 'active')

  for (const entry of catalog) {
    if (gateResult.proactiveLevel === 'silent' && !isMaintenanceAutonomous(entry.id)) {
      continue
    }

    const schedule = entry.dispatch.time?.schedule
    if (!schedule) continue

    let due = false
    if (schedule.ruleType === 'interval_ms') {
      const ruleMs = typeof schedule.rule === 'number' ? schedule.rule : Number(schedule.rule)
      if (!Number.isFinite(ruleMs) || ruleMs <= 0) continue
      due = intervalDue(ruleMs, entry.id, now)
    } else if (schedule.ruleType === 'daily_at') {
      const last = getLastTriggeredAt(GLOBAL_SESSION, entry.id) ?? null
      due = isDailyAtDue(schedule.rule, last, new Date(now))
    } else {
      continue
    }
    if (!due) continue

    if (!isWithinActiveHours(entry.dispatch.time?.active_hours, new Date(now))) {
      continue
    }

    // ── proactiveGate 影响扩展级决策 ──
    if (gateResult.proactiveLevel === 'whisper') {
      // whisper 模式下，健康类提醒 defer
      if (isHealthAutonomous(entry.id, entry.dispatch.summary)) {
        log.info('proactiveGate: whisper, deferring health reminder', { extensionId: entry.id })
        continue
      }
    }

    const policyVerdict = evaluateAutonomousExtensionPolicy({
      entry,
      snapshot,
      runtime,
      dataRoot,
      nowMs: now
    })

    // ── toolDecider：是否调用工具 ──
    if (policyVerdict.action === 'allow' && !isMaintenanceAutonomous(entry.id)) {
      const toolAction = decideToolAction({
        entry,
        snapshot,
        matchedHabits: habits,
        dataRoot,
      })
      if (toolAction === 'suppress') {
        log.info('toolDecider: suppress', { extensionId: entry.id })
        continue
      }
      // auto_invoke 和 ask 都继续执行（ask 由 existing dispatch 逻辑处理）
    }
    const trace = buildPolicyTracePayload(policyVerdict, runtime)
    log.info('policy verdict', { extensionId: entry.id, ...trace })

    if (policyVerdict.action === 'defer' || policyVerdict.action === 'skip') {
      continue
    }

    if (entry.category === 'plugin') {
      await tickAutonomousPluginEntry(
        opts.coordinator,
        GLOBAL_SESSION,
        entry,
        snapshot,
        dataRoot,
        now,
        policyVerdict.reason
      )
      continue
    }

    const handler = opts.coordinator.getSkillHandler(entry.id)
    if (!handler?.shouldActivate) continue

    try {
      const should = await handler.shouldActivate(snapshot)
      if (!should) continue

      const invocation = handler.getProactiveInvocation
        ? await handler.getProactiveInvocation(snapshot)
        : {
            invocationId: `auto-${now}`,
            skillId: entry.id,
            trigger: 'scheduled' as const,
            triggerDetail: 'autonomous:interval',
            snapshot
          }

      const result = await opts.coordinator.executeSkill(invocation)
      if (result.ok) {
        recordDispatchTrigger(GLOBAL_SESSION, entry.id)
        if (result.output) {
          const message = result.output
          recordProactiveMessage(dataRoot, now)
          log.info('autonomous dispatch', { extensionId: entry.id, policyReason: policyVerdict.reason })
          opts.onProactiveMessage?.({ extensionId: entry.id, message })
        } else {
          log.info('autonomous dispatch (silent output)', {
            extensionId: entry.id,
            policyReason: policyVerdict.reason
          })
        }
      }
    } catch (err) {
      log.warn('autonomous tick failed', { extensionId: entry.id, err })
    }
  }

  const proactive = await opts.coordinator.skills.getProactiveSkills()
  for (const handler of proactive) {
    if (catalog.some((c) => c.id === handler.manifest.id)) continue
    if (!handler.getProactiveInvocation) continue
    try {
      const invocation = await handler.getProactiveInvocation(snapshot)
      const result = await opts.coordinator.executeSkill(invocation)
      if (result.ok && result.output) {
        opts.onProactiveMessage?.({ extensionId: handler.manifest.id, message: result.output })
      }
    } catch {
      /* ignore legacy proactive skills */
    }
  }
}

export function startDispatchScheduler(opts: DispatchSchedulerOptions): void {
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    void tickAutonomousDispatch(opts)
  }, TICK_MS)
  void tickAutonomousDispatch(opts)
  log.info('dispatch scheduler started', { tickMs: TICK_MS })
}

export function stopDispatchScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
}

// ═══ 每日习惯维护 ═══
let lastMaintenanceHour = -1
let lastDecayDay = -1

async function tryDailyMaintenance(dataRoot: string): Promise<void> {
  const now = new Date()
  const currentHour = now.getHours()
  // 每小时只跑一次升级/清理/前台扫描
  if (currentHour === lastMaintenanceHour) return
  lastMaintenanceHour = currentHour

  try {
    // 短时→长时习惯升级
    const promoted = promoteShortTermHabits(dataRoot)
    if (promoted > 0) log.info('habits maintenance: promoted', { promoted })

    // 清理过期短时习惯
    const cleaned = cleanupExpired(dataRoot)
    if (cleaned > 0) log.info('habits maintenance: cleaned', { cleaned })

    // 扫描前台历史生成候选习惯
    const scanned = scanForegroundHistory(dataRoot)
    if (scanned > 0) log.info('habits maintenance: scanned foreground', { scanned })

    // 长时习惯降级（每天只跑一次，凌晨 3 点）
    const currentDay = now.getDate()
    if (currentHour === 3 && currentDay !== lastDecayDay) {
      lastDecayDay = currentDay
      const decayed = decayLongTermHabits(dataRoot)
      if (decayed > 0) log.info('habits maintenance: decayed', { decayed })
    }
  } catch (e) {
    log.warn('habits maintenance failed', e)
  }

  // 🆕 午夜 / 早 8 点：特殊日期检测日志（实际处理在 orchestrator 下一轮对话时）
  if (currentHour === 0 || currentHour === 8) {
    try {
      const { detectHoliday } = await import('../../engine/temporalAwareness/holidayDetector')
      const holiday = detectHoliday(now)
      if (holiday) {
        log.info('special date: holiday detected', { key: holiday.key, category: holiday.category })
      }
    } catch { /* temporal awareness may not be loaded yet */ }
  }
}

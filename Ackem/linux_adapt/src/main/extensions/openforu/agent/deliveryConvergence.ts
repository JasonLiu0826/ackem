/**
 * 交付收敛环 — 启动后持久运行：对齐 Design Spec → 无校验错误 → 部署 → 验收通过
 */
import type { AppSettings } from '../../../settings'
import type { PlanSession } from '../../../../shared/planSession'
import { syncSessionDesignSpec } from '../../../../shared/planDesignSpec'
import type { OpenForULoader } from '../loader'
import type { AgentEventBus } from './eventBus'
import { generateArtifactBundle } from './generateAgent'
import { runValidateAndRepairWithLlm } from './repairLoop'
import { formatValidationErrors } from './validationReport'
import { writeStagingPreview } from './stagingIO'
import { executeDeployFromBundle } from './deployAgent'
import { verifyDeployedExtension } from './verifyAgent'
import { getExtensionsCoordinator } from '../../runtime'
import type { ArtifactBundle } from './bundleTypes'
import type { AgentRunMeta, GenerateStrategy } from './types'
import {
  DEFAULT_MAX_DELIVERY_ROUNDS,
  DEFAULT_MAX_REPAIR_ATTEMPTS,
  DEFAULT_MAX_LLM_REPAIR_ATTEMPTS
} from '../../../../shared/openforuAgentTypes'
import {
  parseVersionFromExtensionId,
  snapshotExtensionBeforeChange
} from '../refine/revisionStore'

export type DeliveryConvergenceDeps = {
  dataRoot: string
  loadSession: (sessionId: string) => PlanSession | null
  saveSession: (session: PlanSession) => void
  writeStaging: (session: PlanSession) => void
}

export type DeliveryConvergenceResult = {
  bundle: ArtifactBundle
  session: PlanSession
  extensionId: string
  deliveryRound: number
  repairAttempts: number
}

function refreshSession(deps: DeliveryConvergenceDeps, sessionId: string): PlanSession {
  const session = deps.loadSession(sessionId)
  if (!session) throw new Error('Plan 会话不存在')
  return syncSessionDesignSpec(session)
}

async function runSandboxProbe(
  bundle: ArtifactBundle,
  dataRoot: string,
  run: AgentRunMeta,
  eventBus: AgentEventBus
): Promise<{ ok: boolean; error?: string }> {
  if (bundle.kind !== 'uplugin') return { ok: true }
  const { runSandboxProbeTool } = await import('./tools/sandboxProbe')
  const probe = await runSandboxProbeTool(bundle, dataRoot)
  if (probe.skipped) {
    eventBus.emitFromRun(run, 'log', `sandbox_probe: ${probe.skipReason}`)
    bundle.generationLog.push(`sandbox_probe: skipped (${probe.skipReason})`)
    return { ok: true }
  }
  if (probe.ok) {
    eventBus.emitFromRun(
      run,
      'validation',
      `sandbox_probe: Worker 探测通过 (${probe.durationMs}ms)`,
      { warnings: probe.logs.slice(0, 3) }
    )
    return { ok: true }
  }
  return { ok: false, error: probe.errors.join('; ') }
}

async function runSmokeVerify(
  extensionId: string,
  session: PlanSession,
  loader: OpenForULoader,
  bundleKind: 'uskill' | 'uplugin'
): Promise<{ ok: boolean; skipped: boolean; errors: string[] }> {
  const coordinator = getExtensionsCoordinator()
  if (!coordinator) {
    return { ok: true, skipped: true, errors: [] }
  }
  const verify = await verifyDeployedExtension({ extensionId, session, coordinator })
  if (!verify.ok && !verify.skipped) {
    if (bundleKind === 'uskill') await loader.deactivateUskill(extensionId)
    else await loader.deactivateUplugin(extensionId)
  }
  return {
    ok: verify.ok,
    skipped: verify.skipped === true,
    errors: verify.errors
  }
}

/**
 * 多轮 generate → validate/repair → deploy → verify，直到交付或耗尽轮次
 */
export async function runDeliveryConvergence(input: {
  deps: DeliveryConvergenceDeps
  sessionId: string
  settings: AppSettings
  strategy: GenerateStrategy
  loader: OpenForULoader
  run: AgentRunMeta
  eventBus: AgentEventBus
  signal: AbortSignal
  onPhase: (phase: AgentRunMeta['phase'], message: string) => void
  onPersist: () => void
}): Promise<DeliveryConvergenceResult> {
  const maxRounds = input.run.maxDeliveryRounds ?? DEFAULT_MAX_DELIVERY_ROUNDS
  input.run.maxRepairAttempts = input.run.maxRepairAttempts ?? DEFAULT_MAX_REPAIR_ATTEMPTS
  input.run.maxLlmRepairAttempts = input.run.maxLlmRepairAttempts ?? DEFAULT_MAX_LLM_REPAIR_ATTEMPTS
  input.run.maxDeliveryRounds = maxRounds

  let lastError = '交付收敛失败'
  let lastBundle: ArtifactBundle | null = null

  for (let round = 1; round <= maxRounds; round++) {
    if (input.signal.aborted) {
      throw new DOMException('操作已取消', 'AbortError')
    }

    input.run.deliveryRound = round
    input.run.updatedAt = new Date().toISOString()
    input.onPersist()

    let session = refreshSession(input.deps, input.sessionId)
    input.deps.saveSession(session)

    input.onPhase('generating', `正在生成扩展制品（第 ${round}/${maxRounds} 轮）…`)
    const { bundle: generated } = await generateArtifactBundle(
      session,
      input.settings,
      input.strategy,
      input.signal
    )
    let bundle = generated
    lastBundle = bundle

    input.onPhase('validating', `正在校验并对齐 Design Spec（第 ${round} 轮）…`)
    input.run.repairAttempts = 0
    input.run.llmRepairAttempts = 0
    const repaired = await runValidateAndRepairWithLlm(
      bundle,
      session,
      input.run,
      input.eventBus,
      input.settings,
      input.signal
    )
    bundle = repaired.bundle
    lastBundle = bundle

    if (!repaired.report.ok) {
      lastError = formatValidationErrors(repaired.report)
      input.eventBus.emitFromRun(
        input.run,
        'log',
        `第 ${round} 轮校验未通过，将重新生成：${lastError}`
      )
      input.onPersist()
      continue
    }

    const probe = await runSandboxProbe(bundle, input.deps.dataRoot, input.run, input.eventBus)
    if (!probe.ok) {
      lastError = probe.error ?? 'sandbox_probe 失败'
      input.eventBus.emitFromRun(input.run, 'log', `第 ${round} 轮沙箱探测失败，重试…`)
      input.onPersist()
      continue
    }

    writeStagingPreview(input.deps.dataRoot, input.sessionId, bundle.files)
    input.onPhase('deploying', `正在部署（第 ${round} 轮）…`)

    session = refreshSession(input.deps, input.sessionId)
    if (session.linkedExtensionId) {
      const extId = session.linkedExtensionId
      const slug = extId.replace(/^u\//, '').replace(/@.*$/, '')
      const version = parseVersionFromExtensionId(extId)
      const snapKind = bundle.kind === 'uplugin' ? 'uplugin' : 'uskill'
      try {
        snapshotExtensionBeforeChange(input.deps.dataRoot, snapKind, slug, version, {
          summary: `交付收敛第 ${round} 轮前快照`
        })
      } catch {
        // 首次部署
      }
    }

    const deployResult = await executeDeployFromBundle(
      session,
      input.loader,
      bundle,
      input.deps,
      { silent: !!session.designSpec }
    )
    session = deployResult.session
    input.deps.saveSession(session)

    input.onPhase('verifying', `正在验收触发与 smoke（第 ${round} 轮）…`)
    const bundleKind = bundle.kind === 'uplugin' ? 'uplugin' : 'uskill'
    const smoke = await runSmokeVerify(deployResult.extensionId, session, input.loader, bundleKind)

    if (smoke.ok || smoke.skipped) {
      input.eventBus.emitFromRun(
        input.run,
        'validation',
        smoke.skipped ? '文本 smoke 已跳过' : '触发验证通过',
        { warnings: smoke.errors }
      )
      return {
        bundle,
        session,
        extensionId: deployResult.extensionId,
        deliveryRound: round,
        repairAttempts: input.run.repairAttempts
      }
    }

    lastError = smoke.errors.join('；') || '触发验证未通过'
    input.eventBus.emitFromRun(input.run, 'log', `第 ${round} 轮验收未通过，继续收敛…`, {
      errors: smoke.errors
    })
    input.onPersist()
  }

  throw new Error(
    `交付收敛已尝试 ${maxRounds} 轮仍未成功：${lastError}${
      lastBundle ? `（末次 id=${lastBundle.manifest.id}）` : ''
    }`
  )
}

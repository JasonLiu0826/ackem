import { randomUUID } from 'node:crypto'
import type { AppSettings } from '../../../settings'
import type { PlanSession } from '../../../../shared/planSession'
import { resolvePlanArtifactKind } from '../../../../shared/planArtifact'
import type { OpenForULoader } from '../loader'
import { getExtensionsCoordinator } from '../../runtime'
import { AgentEventBus } from './eventBus'
import type { DeploySessionStore } from './deployAgent'
import { runDeliveryConvergence } from './deliveryConvergence'
import { appendPlanDeliveryCard } from './planSessionDelivery'
import { formatFailureCard } from '../../../../shared/planDeliveryCard'
import type { GenerateStrategySetting } from './strategies/resolveStrategy'
import { resolveGenerateStrategy } from './strategies/resolveStrategy'
import { persistAgentRun, listIncompleteAgentRuns } from './runStore'
import {
  verifyDeployedExtension,
  type VerifyAgentOutput
} from './verifyAgent'
import {
  DEFAULT_MAX_REPAIR_ATTEMPTS,
  DEFAULT_MAX_LLM_REPAIR_ATTEMPTS,
  DEFAULT_MAX_DELIVERY_ROUNDS,
  PHASE_PERCENT,
  PHASE_TO_DEPLOY_STEP,
  type AgentEvent,
  type AgentRunMeta,
  type DeployPipelineInput,
  type DeployPipelineOutput,
  type GenerateStrategy
} from './types'

export type AgentRunnerDeps = DeploySessionStore & {
  loadSession: (sessionId: string) => PlanSession | null
  dataRoot: string
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

function appendVerifyMessage(
  store: DeploySessionStore,
  session: PlanSession,
  verify: VerifyAgentOutput
): PlanSession {
  if (verify.skipped) {
    session.messages.push({
      role: 'assistant',
      content: [
        '⚠️ **文本 smoke 已跳过**（快捷键等非文本触发）',
        '',
        ...verify.warnings.map((w) => `- ${w}`),
        '',
        '扩展**保持启用**；请在实机验证快捷键，或补充文本 keywords 后重新部署。'
      ].join('\n')
    })
  } else if (verify.ok) {
    session.messages.push({
      role: 'assistant',
      content: [
        `✅ **触发验证通过**（smoke · \`${verify.smokeMessage}\`）`,
        verify.contextInjectionPreview
          ? `\n\n预览：${verify.contextInjectionPreview.slice(0, 160)}`
          : ''
      ].join('')
    })
  } else {
    session.messages.push({
      role: 'assistant',
      content: [
        '⚠️ **已部署但触发验证未通过** · 扩展已自动禁用',
        '',
        ...verify.errors.map((e) => `- ${e}`),
        '',
        '可在扩展中心重新启用，或修改方案后再次部署。'
      ].join('\n')
    })
  }
  store.saveSession(session)
  store.writeStaging(session)
  return session
}

export class OpenForUAgentRunner {
  private runs = new Map<string, AgentRunMeta>()
  private activeBySession = new Map<string, string>()
  private abortControllers = new Map<string, AbortController>()
  private deliveryPromises = new Map<string, Promise<DeployPipelineOutput>>()
  readonly eventBus = new AgentEventBus()

  constructor(private deps: AgentRunnerDeps) {}

  subscribe(cb: (event: AgentEvent) => void): () => void {
    return this.eventBus.subscribe(cb)
  }

  getRun(runId: string): AgentRunMeta | null {
    return this.runs.get(runId) ?? null
  }

  getActiveRun(sessionId: string): AgentRunMeta | null {
    const runId = this.activeBySession.get(sessionId)
    if (!runId) return null
    return this.getRun(runId)
  }

  /** 进行中的 run 优先；否则返回该会话最近一条 run（含 cancelled/failed/completed） */
  getRunForSession(sessionId: string): AgentRunMeta | null {
    const active = this.getActiveRun(sessionId)
    if (active) return active
    let latest: AgentRunMeta | null = null
    for (const run of this.runs.values()) {
      if (run.sessionId !== sessionId) continue
      if (!latest || run.updatedAt > latest.updatedAt) latest = run
    }
    return latest
  }

  /** AC-4：取消进行中的 generate/repair/deploy/verify */
  cancelRunBySession(sessionId: string): boolean {
    const runId = this.activeBySession.get(sessionId)
    if (!runId) return false
    const run = this.runs.get(runId)
    if (!run || run.status !== 'running') return false
    this.abortControllers.get(runId)?.abort()
    this.markCancelled(run, '用户已取消部署')
    return true
  }

  private markCancelled(run: AgentRunMeta, message: string): void {
    run.status = 'cancelled'
    run.phase = 'cancelled'
    run.lastError = message
    run.updatedAt = new Date().toISOString()
    this.activeBySession.delete(run.sessionId)
    this.abortControllers.delete(run.runId)
    this.eventBus.emitFromRun(run, 'error', message)
    this.flushRun(run)
  }

  private setPhase(run: AgentRunMeta, phase: AgentRunMeta['phase'], message: string): void {
    run.phase = phase
    run.updatedAt = new Date().toISOString()
    this.eventBus.emitFromRun(run, 'phase_change', message)
    const stepId = PHASE_TO_DEPLOY_STEP[phase]
    const percent = PHASE_PERCENT[phase]
    if (stepId !== undefined && percent !== undefined) {
      this.eventBus.emitFromRun(run, 'progress', message, { stepId, percent })
    }
    this.flushRun(run)
  }

  private failRun(run: AgentRunMeta, error: string): void {
    run.status = 'failed'
    run.phase = 'failed'
    run.lastError = error
    run.updatedAt = new Date().toISOString()
    this.activeBySession.delete(run.sessionId)
    this.abortControllers.delete(run.runId)
    this.eventBus.emitFromRun(run, 'error', error, { errors: [error] })
    this.flushRun(run)
  }

  private completeRun(run: AgentRunMeta, extensionId: string): void {
    run.phase = 'done'
    run.status = 'completed'
    run.deployedExtensionId = extensionId
    run.updatedAt = new Date().toISOString()
    this.activeBySession.delete(run.sessionId)
    this.abortControllers.delete(run.runId)
    this.setPhase(run, 'done', '部署完成')
    this.flushRun(run)
  }

  private flushRun(run: AgentRunMeta): void {
    try {
      persistAgentRun(this.deps.dataRoot, run)
    } catch {
      // 落盘失败不阻塞主流程
    }
  }

  private throwIfAborted(signal: AbortSignal, run: AgentRunMeta): void {
    if (!signal.aborted) return
    if (run.status !== 'cancelled') {
      this.markCancelled(run, '用户已取消部署')
    }
    throw new DOMException('操作已取消', 'AbortError')
  }

  private rehydrateRun(run: AgentRunMeta): void {
    this.runs.set(run.runId, run)
    this.activeBySession.set(run.sessionId, run.runId)
    if (!this.abortControllers.has(run.runId)) {
      this.abortControllers.set(run.runId, new AbortController())
    }
  }

  /** 应用启动后恢复中断的交付任务（fire-and-forget） */
  resumeIncompleteRuns(input: {
    loader: OpenForULoader
    settings: AppSettings
  }): void {
    const incomplete = listIncompleteAgentRuns(this.deps.dataRoot)
    for (const run of incomplete) {
      if (this.activeBySession.has(run.sessionId) || this.deliveryPromises.has(run.sessionId)) {
        continue
      }
      const session = this.deps.loadSession(run.sessionId)
      if (!session?.planConfirmed) {
        run.status = 'failed'
        run.phase = 'failed'
        run.lastError = '会话未确认或已删除，无法恢复交付'
        run.updatedAt = new Date().toISOString()
        this.flushRun(run)
        continue
      }
      this.rehydrateRun(run)
      const scheduled = this.scheduleDeliveryRun(run, input.loader, input.settings)
      void scheduled.catch(() => {
        // 错误已在 continueDeliveryRun 内 failRun
      })
    }
  }

  private scheduleDeliveryRun(
    run: AgentRunMeta,
    loader: OpenForULoader,
    settings: AppSettings
  ): Promise<DeployPipelineOutput> {
    const existing = this.deliveryPromises.get(run.sessionId)
    if (existing) return existing

    const promise = this.continueDeliveryRun(run, loader, settings).finally(() => {
      if (this.deliveryPromises.get(run.sessionId) === promise) {
        this.deliveryPromises.delete(run.sessionId)
      }
    })
    this.deliveryPromises.set(run.sessionId, promise)
    return promise
  }

  private async continueDeliveryRun(
    run: AgentRunMeta,
    loader: OpenForULoader,
    settings: AppSettings
  ): Promise<DeployPipelineOutput> {
    const signal = this.abortControllers.get(run.runId)!.signal
    try {
      if (run.phase === 'queued') {
        this.setPhase(run, 'generating', '正在收敛交付（对齐设计 → 校验 → 部署 → 验收）…')
      } else {
        this.setPhase(run, run.phase, '正在恢复交付收敛…')
      }
      this.throwIfAborted(signal, run)

      const converged = await runDeliveryConvergence({
        deps: this.deps,
        sessionId: run.sessionId,
        settings,
        strategy: run.strategy,
        loader,
        run,
        eventBus: this.eventBus,
        signal,
        onPhase: (phase, message) => this.setPhase(run, phase, message),
        onPersist: () => this.flushRun(run)
      })

      let session = converged.session
      const bundleKind = converged.bundle.kind === 'uplugin' ? 'uplugin' : 'uskill'
      const coordinator = getExtensionsCoordinator()
      const verify: VerifyAgentOutput = coordinator
        ? await verifyDeployedExtension({
            extensionId: converged.extensionId,
            session,
            coordinator
          })
        : {
            ok: true,
            skipped: true,
            errors: [],
            warnings: [],
            smokeMessage: '(offline: coordinator 未就绪，跳过 smoke)'
          }

      if (session.designSpec) {
        session = appendPlanDeliveryCard(session, converged.extensionId, verify, session.designSpec)
        this.deps.saveSession(session)
        this.deps.writeStaging(session)
      } else {
        const verified = await this.runVerifyStep(
          run,
          converged.extensionId,
          session,
          loader,
          bundleKind,
          signal
        )
        session = verified.session
      }

      this.completeRun(run, converged.extensionId)

      const notifyText = session.designSpec
        ? `扩展 ${converged.extensionId} 已就绪（收敛 ${converged.deliveryRound} 轮交付）`
        : `扩展 ${converged.extensionId} 已就绪`

      return {
        runId: run.runId,
        session,
        extensionId: converged.extensionId,
        notifyText
      }
    } catch (err) {
      if (isAbortError(err) || run.status === 'cancelled') {
        throw err
      }
      const message = err instanceof Error ? err.message : String(err)
      this.failRun(run, message)
      const failedSession = this.deps.loadSession(run.sessionId)
      if (failedSession?.designSpec) {
        failedSession.messages.push({
          role: 'assistant',
          content: formatFailureCard({
            kind: 'create',
            displayName: failedSession.designSpec.displayName,
            phase: run.phase === 'failed' ? run.phase : '部署',
            error: message,
            actions: [
              '发送【重新部署】继续自动收敛',
              '修改方案后重新确认',
              '检查 OpenForU 配置与权限'
            ],
            technicalDetails: []
          })
        })
        this.deps.saveSession(failedSession)
        this.deps.writeStaging(failedSession)
      }
      throw err
    }
  }

  private obtainRun(sessionId: string, strategy: GenerateStrategy): AgentRunMeta {
    const existingId = this.activeBySession.get(sessionId)
    if (existingId) {
      const existing = this.runs.get(existingId)
      if (existing?.status === 'running') {
        return existing
      }
    }

    const onDisk = listIncompleteAgentRuns(this.deps.dataRoot).find((r) => r.sessionId === sessionId)
    if (onDisk) {
      this.rehydrateRun(onDisk)
      return onDisk
    }

    const session = this.deps.loadSession(sessionId)
    if (!session) throw new Error('Plan 会话不存在')

    const run: AgentRunMeta = {
      runId: randomUUID(),
      sessionId,
      kind: 'deploy_pipeline',
      phase: 'queued',
      status: 'running',
      artifactKind: resolvePlanArtifactKind(session),
      strategy,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      repairAttempts: 0,
      llmRepairAttempts: 0,
      maxRepairAttempts: DEFAULT_MAX_REPAIR_ATTEMPTS,
      maxLlmRepairAttempts: DEFAULT_MAX_LLM_REPAIR_ATTEMPTS,
      maxDeliveryRounds: DEFAULT_MAX_DELIVERY_ROUNDS,
      deliveryRound: 0
    }
    this.runs.set(run.runId, run)
    this.activeBySession.set(sessionId, run.runId)
    this.abortControllers.set(run.runId, new AbortController())
    this.flushRun(run)
    return run
  }

  private async runVerifyStep(
    run: AgentRunMeta,
    extensionId: string,
    session: PlanSession,
    loader: OpenForULoader,
    bundleKind: 'uskill' | 'uplugin',
    signal: AbortSignal
  ): Promise<{ session: PlanSession; verify: VerifyAgentOutput }> {
    this.throwIfAborted(signal, run)
    this.setPhase(run, 'verifying', '正在验证扩展可触发…')

    const coordinator = getExtensionsCoordinator()
    if (!coordinator) {
      const verify: VerifyAgentOutput = {
        ok: true,
        errors: [],
        warnings: [],
        smokeMessage: '(offline: coordinator 未就绪，跳过 smoke)'
      }
      this.eventBus.emitFromRun(run, 'log', verify.smokeMessage)
      if (session.designSpec) {
        session = appendPlanDeliveryCard(session, extensionId, verify, session.designSpec)
        this.deps.saveSession(session)
        this.deps.writeStaging(session)
      }
      return { session, verify }
    }

    const verify = await verifyDeployedExtension({
      extensionId,
      session,
      coordinator
    })

    if (verify.ok) {
      this.eventBus.emitFromRun(
        run,
        verify.skipped ? 'log' : 'validation',
        verify.skipped ? '文本 smoke 已跳过' : '触发验证通过',
        {
          warnings: [
            ...verify.warnings,
            ...(verify.contextInjectionPreview ? [verify.contextInjectionPreview.slice(0, 80)] : [])
          ].filter(Boolean)
        }
      )
    } else {
      this.eventBus.emitFromRun(run, 'error', '触发验证未通过', { errors: verify.errors })
    }

    if (session.designSpec) {
      session = appendPlanDeliveryCard(session, extensionId, verify, session.designSpec)
      this.deps.saveSession(session)
      this.deps.writeStaging(session)
      if (!verify.ok && !verify.skipped) {
        if (bundleKind === 'uskill') {
          await loader.deactivateUskill(extensionId)
        } else {
          await loader.deactivateUplugin(extensionId)
        }
        throw new Error(`触发验证未通过: ${verify.errors.join('; ')}`)
      }
      return { session, verify }
    }

    if (verify.ok || verify.skipped) {
      session = appendVerifyMessage(this.deps, session, verify)
      return { session, verify }
    }

    if (bundleKind === 'uskill') {
      await loader.deactivateUskill(extensionId)
    } else {
      await loader.deactivateUplugin(extensionId)
    }

    session = appendVerifyMessage(this.deps, session, verify)
    throw new Error(`触发验证未通过: ${verify.errors.join('; ')}`)
  }

  /**
   * AC-1+：generate（hybrid/auto）→ validate → staging preview → deploy → verify
   */
  async generateValidateDeploy(
    input: DeployPipelineInput & {
      loader: OpenForULoader
      settings: AppSettings
      strategySetting?: GenerateStrategySetting
    }
  ): Promise<DeployPipelineOutput> {
    const session0 = this.deps.loadSession(input.sessionId)
    if (!session0) throw new Error('Plan 会话不存在')

    const strategy = resolveGenerateStrategy(
      session0,
      input.strategySetting ?? input.strategy ?? 'auto'
    )
    const run = this.obtainRun(input.sessionId, strategy)
    return this.scheduleDeliveryRun(run, input.loader, input.settings)
  }
}

let sharedRunner: OpenForUAgentRunner | null = null

export function getOpenForUAgentRunner(deps: AgentRunnerDeps): OpenForUAgentRunner {
  if (!sharedRunner) {
    sharedRunner = new OpenForUAgentRunner(deps)
  }
  return sharedRunner
}

export function resetOpenForUAgentRunnerForTests(): void {
  sharedRunner = null
}

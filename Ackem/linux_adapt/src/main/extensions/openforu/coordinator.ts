import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { AppSettings } from '../../settings'
import { runPlanAgentTurn } from './agent/planAgent'
import {
  buildOpenForULlmSettings,
  clampOpenForUTemperature,
  getOpenForUMaxTokens,
  OPENFORU_NOT_CONFIGURED_MSG
} from '../../../shared/openforuConfig'
import {
  createEmptyPlanSession,
  normalizePlanSession,
  planSessionMeta,
  type PlanSession,
  type PlanSessionMeta
} from '../../../shared/planSession'
import {
  countPlanUserTurns,
  findLatestPlanSummary,
  isDispatchDraftComplete,
  isPlanSummaryReady,
  PLAN_DEPLOY_CANCELLED_ASSISTANT_MSG,
  PLAN_REDEPLOY_STARTED_ASSISTANT_MSG,
  rebuildDispatchDraftFromMessages
} from '../../../shared/planUi'
import { getPlanArtifactDeployStatus, isPlanArtifactTypeResolved } from '../../../shared/planArtifact'
import {
  evaluateDesignSpecGate,
  mergeDesignSpec,
  syncSessionDesignSpec
} from '../../../shared/planDesignSpec'
import { buildPlanSessionGrounding } from '../../../shared/planSessionGrounding'
import type { OpenForULoader } from './loader'
import { loadSettings } from '../../settings'
import { isOpenForUAgentCoreEnabled } from '../../../shared/openforuConfig'
import { executeDeployPlan } from './agent/deployAgent'
import { getOpenForUAgentRunner } from './agent/runner'
import {
  loadPlanSessionFromDb,
  savePlanSessionToDb
} from '../../db/repos/openforu'
import { getDatabase } from '../../db/database'
import {
  MAX_OPENFORU_WORKSPACES,
  OpenForUWorkspaceStore,
  PLAN_WELCOME_MESSAGE,
  type OpenForUWorkspace
} from './workspaces'

export type { PlanMessage } from '../../../shared/planSession'

export type PlanSessionPayload = {
  messages: PlanSession['messages']
} & PlanSessionMeta

function openforuDir(dataRoot: string): string {
  return join(dataRoot, 'openforu')
}

function sessionPath(dataRoot: string, id: string): string {
  return join(openforuDir(dataRoot), 'sessions', `${id}.json`)
}

export class OpenForUCoordinator {
  private store: OpenForUWorkspaceStore

  constructor(private dataRoot: string) {
    this.store = new OpenForUWorkspaceStore(dataRoot)
  }

  listWorkspaces(): {
    workspaces: OpenForUWorkspace[]
    activeWorkspaceId: string | null
    max: number
  } {
    return this.store.list()
  }

  openActivePlan(): {
    workspace: OpenForUWorkspace | null
    sessionId: string
  } & PlanSessionPayload {
    const workspace = this.store.getActive()
    if (!workspace) {
      return {
        workspace: null,
        sessionId: '',
        messages: [],
        dispatchDraft: {},
        planSummary: null,
        planConfirmed: false
      }
    }
    const session = this.loadSession(workspace.sessionId)
    if (!session) {
      const created = createEmptyPlanSession(workspace.sessionId, PLAN_WELCOME_MESSAGE)
      this.saveSession(created)
      return { workspace, sessionId: workspace.sessionId, ...this.sessionPayload(created) }
    }
    return { workspace, sessionId: session.id, ...this.sessionPayload(session) }
  }

  createWorkspace(name?: string): {
    workspace: OpenForUWorkspace
    sessionId: string
    evicted: OpenForUWorkspace | null
  } & PlanSessionPayload {
    const [workspace, evicted] = this.store.createWorkspace(name)
    const session = createEmptyPlanSession(workspace.sessionId, PLAN_WELCOME_MESSAGE)
    this.saveSession(session)
    return {
      workspace,
      sessionId: workspace.sessionId,
      evicted,
      ...this.sessionPayload(session)
    }
  }

  switchWorkspace(workspaceId: string): {
    workspace: OpenForUWorkspace
    sessionId: string
  } & PlanSessionPayload {
    const workspace = this.store.switchActive(workspaceId)
    const session = this.loadSession(workspace.sessionId)
    if (!session) {
      const created = createEmptyPlanSession(workspace.sessionId, PLAN_WELCOME_MESSAGE)
      this.saveSession(created)
      return { workspace, sessionId: workspace.sessionId, ...this.sessionPayload(created) }
    }
    return { workspace, sessionId: session.id, ...this.sessionPayload(session) }
  }

  deleteWorkspace(workspaceId: string): { ok: true; activeWorkspaceId: string | null } {
    this.store.deleteWorkspace(workspaceId)
    return { ok: true, activeWorkspaceId: this.store.list().activeWorkspaceId }
  }

  private syncSessionMeta(session: PlanSession): PlanSession {
    session.dispatchDraft = rebuildDispatchDraftFromMessages(session.messages)
    session.planSummary = findLatestPlanSummary(session.messages)
    session.designSpec = syncSessionDesignSpec(session).designSpec ?? null
    return session
  }

  private sessionPayload(session: PlanSession): PlanSessionPayload {
    return {
      messages: session.messages,
      ...planSessionMeta(session)
    }
  }

  loadSession(id: string): PlanSession | null {
    if (!id) return null
    if (getDatabase(this.dataRoot)) {
      const fromDb = loadPlanSessionFromDb(this.dataRoot, id)
      if (fromDb) {
        const session = normalizePlanSession(fromDb)
        this.syncSessionMeta(session)
        return session
      }
    }
    const p = sessionPath(this.dataRoot, id)
    if (!existsSync(p)) return null
    try {
      const session = normalizePlanSession(JSON.parse(readFileSync(p, 'utf-8')) as PlanSession)
      this.syncSessionMeta(session)
      savePlanSessionToDb(this.dataRoot, session)
      return session
    } catch {
      return null
    }
  }

  private saveSession(session: PlanSession): void {
    writeFileSync(sessionPath(this.dataRoot, session.id), JSON.stringify(session, null, 2), 'utf-8')
    savePlanSessionToDb(this.dataRoot, session)
  }

  private writeStaging(session: PlanSession): void {
    const staging = join(openforuDir(this.dataRoot), 'staging', `${session.id}.md`)
    const meta = [
      session.planConfirmed ? `\n> 方案已确认 ${session.planConfirmedAt ?? ''}\n` : '',
      session.dispatchDraft
        ? `\n## dispatchDraft\n\n\`\`\`json\n${JSON.stringify(session.dispatchDraft, null, 2)}\n\`\`\`\n`
        : ''
    ].join('')
    writeFileSync(
      staging,
      `# Plan ${session.id}\n${meta}\n${session.messages.map((m) => `## ${m.role}\n\n${m.content}`).join('\n\n')}\n`,
      'utf-8'
    )
  }

  confirmPlan(sessionId: string): PlanSession {
    const session = this.loadSession(sessionId)
    if (!session) throw new Error('Plan 会话不存在')
    this.syncSessionMeta(session)
    const ready =
      isPlanSummaryReady(session.planSummary) || isDispatchDraftComplete(session.dispatchDraft ?? {})
    if (!ready) {
      throw new Error('方案尚未就绪：需要 📋 方案摘要或 dispatch 四维齐全')
    }
    if (!isPlanArtifactTypeResolved(session)) {
      throw new Error('请先与 Agent 明确产物类型：uskill（Skill）或 uplugin（Plugin）')
    }

    const specGate = evaluateDesignSpecGate(session.designSpec)
    if (!specGate.ready) {
      throw new Error(`设计规格未就绪：${specGate.missing.join('；')}`)
    }

    const artifactStatus = getPlanArtifactDeployStatus(session)
    session.planConfirmed = true
    session.planConfirmedAt = new Date().toISOString()
    session.messages.push({
      role: 'assistant',
      content:
        artifactStatus.kind === 'uplugin'
          ? '✅ **Plugin 方案已确认**。dispatch 配置已写入会话；即将开始生成并部署 uplugin（请稍候或点击「确认方案」后自动执行）。'
          : '✅ **Skill 方案已确认**。dispatch 配置已写入会话；即将开始生成并部署 uskill（请稍候或点击「确认方案」后自动执行）。'
    })
    this.saveSession(session)
    this.writeStaging(session)
    this.store.touchSession(sessionId)
    return session
  }

  approveWireframe(sessionId: string): PlanSession {
    const session = this.loadSession(sessionId)
    if (!session) throw new Error('Plan 会话不存在')
    if (!session.designSpec) throw new Error('尚无设计规格，请继续与 Agent 对话')
    session.designSpec = mergeDesignSpec(session.designSpec, {
      ui: { wireframeApproved: true }
    })
    this.saveSession(session)
    this.writeStaging(session)
    this.store.touchSession(sessionId)
    return session
  }

  linkExtensionToPlan(sessionId: string, extensionId: string): PlanSession {
    const session = this.loadSession(sessionId)
    if (!session) throw new Error('Plan 会话不存在')
    session.linkedExtensionId = extensionId
    session.refineMode = true
    if (!session.deployedUskillId) {
      session.deployedUskillId = extensionId
    }
    this.saveSession(session)
    this.store.touchSession(sessionId)
    return session
  }

  /** 扩展中心「继续优化」→ 切换到关联 Plan 工作区并进入 Refine 模式 */
  openRefineInPlan(
    extensionId: string,
    opts?: { instruction?: string; displayName?: string }
  ): {
    workspace: OpenForUWorkspace
    sessionId: string
    composerPrefill?: string
  } & PlanSessionPayload {
    const extId = extensionId.trim()
    if (!extId) throw new Error('缺少 extensionId')

    const listed = this.store.list()
    let workspace =
      listed.workspaces.find((w) => {
        const s = this.loadSession(w.sessionId)
        if (!s) return false
        return (
          s.deployedUskillId === extId ||
          s.linkedExtensionId === extId ||
          (s.designSpec?.slug != null && extId.startsWith(`u/${s.designSpec.slug}@`))
        )
      }) ?? null

    if (workspace) {
      workspace = this.store.switchActive(workspace.id)
    } else {
      const active = this.store.getActive()
      if (active) {
        workspace = active
      } else {
        const label = opts?.displayName?.trim() || extId.split('@')[0]?.replace(/^u\//, '') || '扩展'
        const [created] = this.store.createWorkspace(`优化 · ${label}`)
        workspace = created
      }
    }

    let session = this.linkExtensionToPlan(workspace.sessionId, extId)
    const refineBanner = `🔧 **继续优化** \`${extId}\`\n\n在下方描述想改什么；确认方案后会重新生成并部署。`
    const hasRefineBanner = session.messages.some(
      (m) => m.role === 'assistant' && m.content.includes('继续优化') && m.content.includes(extId)
    )
    if (!hasRefineBanner) {
      session.messages.push({ role: 'assistant', content: refineBanner })
    }

    const instruction = opts?.instruction?.trim()
    let composerPrefill: string | undefined
    if (instruction) {
      const last = session.messages[session.messages.length - 1]
      if (!(last?.role === 'user' && last.content === instruction)) {
        session.messages.push({ role: 'user', content: instruction })
      }
      composerPrefill = instruction
    }

    session.planConfirmed = false
    session = this.syncSessionMeta(session)
    this.saveSession(session)
    this.writeStaging(session)
    this.store.touchSession(session.id)

    return {
      workspace,
      sessionId: session.id,
      composerPrefill,
      ...this.sessionPayload(session)
    }
  }

  /** Vitest 无 Electron app 时视为关闭，避免 agent runner 依赖桌面 settings 路径 */
  private isAgentCoreEnabled(): boolean {
    try {
      if (typeof app?.getPath !== 'function') return false
      return isOpenForUAgentCoreEnabled(loadSettings())
    } catch {
      return false
    }
  }

  agentRunnerDeps() {
    return {
      dataRoot: this.dataRoot,
      loadSession: (id: string) => this.loadSession(id),
      saveSession: (s: PlanSession) => this.saveSession(s),
      writeStaging: (s: PlanSession) => this.writeStaging(s),
      touchSession: (id: string) => this.store.touchSession(id)
    }
  }

  /** AC-4：取消部署后在 Plan 对话插入说明，避免与旧「即将部署」消息混淆 */
  appendDeployCancelledNotice(sessionId: string): PlanSession | null {
    const session = this.loadSession(sessionId)
    if (!session) return null
    const last = session.messages[session.messages.length - 1]
    if (
      last?.role === 'assistant' &&
      last.content.includes('部署已取消')
    ) {
      return session
    }
    session.messages.push({ role: 'assistant', content: PLAN_DEPLOY_CANCELLED_ASSISTANT_MSG })
    this.saveSession(session)
    this.writeStaging(session)
    this.store.touchSession(sessionId)
    return session
  }

  async redeployPlan(
    sessionId: string,
    loader: OpenForULoader,
    userText?: string
  ): Promise<{ session: PlanSession; uskillId: string; notifyText: string }> {
    const session = this.loadSession(sessionId)
    if (!session) throw new Error('Plan 会话不存在')
    if (!session.planConfirmed) {
      throw new Error('请先确认方案再部署')
    }
    const trimmed = userText?.trim()
    if (trimmed) {
      session.messages.push({ role: 'user', content: trimmed })
    }
    session.messages.push({ role: 'assistant', content: PLAN_REDEPLOY_STARTED_ASSISTANT_MSG })
    this.saveSession(session)
    this.writeStaging(session)
    this.store.touchSession(sessionId)
    return this.deployPlan(sessionId, loader)
  }

  async deployPlan(
    sessionId: string,
    loader: OpenForULoader
  ): Promise<{ session: PlanSession; uskillId: string; notifyText: string }> {
    const session = this.loadSession(sessionId)
    if (!session) throw new Error('Plan 会话不存在')

    if (this.isAgentCoreEnabled()) {
      const settings = loadSettings()
      const runner = getOpenForUAgentRunner(this.agentRunnerDeps())
      const out = await runner.generateValidateDeploy({
        sessionId,
        loader,
        settings,
        strategySetting: settings.openforuGenerateStrategy ?? 'auto'
      })
      return {
        session: out.session,
        uskillId: out.extensionId,
        notifyText: out.notifyText
      }
    }

    const result = await executeDeployPlan(session, loader, this.agentRunnerDeps())
    return {
      session: result.session,
      uskillId: result.extensionId,
      notifyText: result.notifyText
    }
  }

  async send(sessionId: string, userText: string, settings: AppSettings): Promise<PlanSession> {
    const ofs = buildOpenForULlmSettings(settings)
    if (!ofs) throw new Error(OPENFORU_NOT_CONFIGURED_MSG)

    const session = this.loadSession(sessionId)
    if (!session) throw new Error('Plan 会话不存在')

    session.messages.push({ role: 'user', content: userText })

    this.syncSessionMeta(session)
    const userTurns = countPlanUserTurns(session.messages)
    const groundingBlock = buildPlanSessionGrounding({ session })
    const turn = await runPlanAgentTurn({
      messages: session.messages,
      settings,
      userTurns,
      temperature: clampOpenForUTemperature(settings.openforuTemperature),
      maxTokens: getOpenForUMaxTokens(),
      groundingBlock
    })

    session.messages.push({ role: 'assistant', content: turn.rawContent })
    this.syncSessionMeta(session)
    this.saveSession(session)
    this.writeStaging(session)
    this.store.touchSession(sessionId)
    return session
  }
}

export { MAX_OPENFORU_WORKSPACES }

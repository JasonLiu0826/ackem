import { ipcMain } from 'electron'
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { resolveDataRoot } from '../../paths'
import { loadSettings } from '../../settings'
import { broadcastToRenderers } from '../../uiWindow'
import { getExtensionsCoordinator } from '../runtime'
import type { OpenForUExtensionRow } from '../../../shared/openforuExtensions'
import { isOpenForUConfigured, isOpenForUAgentCoreEnabled, OPENFORU_NOT_CONFIGURED_MSG } from '../../../shared/openforuConfig'
import { OpenForUCoordinator } from './coordinator'
import { previewPlanArtifact } from './agent/artifactPreview'
import { getOpenForUAgentRunner } from './agent/runner'
import { wireOpenForUAgentEventBroadcast } from './agent/agentIpcBridge'
import {
  configurePermissionGate,
  resolvePermissionRequest
} from './permissionGate'
import { computePermissionState } from '../../../shared/openforuPermissions'
import type { PluginPermission } from '../plugins/types'
import { evaluateDesignSpecGate } from '../../../shared/planDesignSpec'
import type { PlanSession } from '../../../shared/planSession'
import {
  applyRefine,
  getRefineHistory,
  previewRefine,
  rollbackRefine
} from './refine/refinePipeline'
import { executeOpenExtensionSurface } from './surface/executeOpenSurface'
import { upluginHasSurface } from './surface/surfaceMeta'

let coordinator: OpenForUCoordinator | null = null

function planSessionFields(session: PlanSession) {
  return {
    designSpec: session.designSpec ?? null,
    designSpecGate: evaluateDesignSpecGate(session.designSpec)
  }
}

function getCoordinator(): OpenForUCoordinator {
  if (!coordinator) {
    coordinator = new OpenForUCoordinator(resolveDataRoot(loadSettings()))
  }
  return coordinator
}

function notConfigured() {
  return { ok: false as const, error: OPENFORU_NOT_CONFIGURED_MSG }
}

export function registerOpenForUIpc(): void {
  configurePermissionGate((channel, payload) => broadcastToRenderers(channel, payload))

  wireOpenForUAgentEventBroadcast(
    (channel, payload) => broadcastToRenderers(channel, payload),
    getCoordinator().agentRunnerDeps()
  )

  setImmediate(() => {
    const settings = loadSettings()
    if (!isOpenForUAgentCoreEnabled(settings)) return
    const ext = getExtensionsCoordinator()
    if (!ext) return
    getOpenForUAgentRunner(getCoordinator().agentRunnerDeps()).resumeIncompleteRuns({
      loader: ext.openforu,
      settings
    })
  })

  ipcMain.handle('openforu:agent:status', (_e, sessionId: string) => {
    if (!sessionId) return { ok: false as const, error: '缺少 sessionId' }
    const runner = getOpenForUAgentRunner(getCoordinator().agentRunnerDeps())
    const run = runner.getRunForSession(sessionId)
    return { ok: true as const, run }
  })

  ipcMain.handle('openforu:agent:cancel', (_e, sessionId: string) => {
    if (!sessionId) return { ok: false as const, error: '缺少 sessionId', cancelled: false }
    const coord = getCoordinator()
    const runner = getOpenForUAgentRunner(coord.agentRunnerDeps())
    const cancelled = runner.cancelRunBySession(sessionId)
    if (!cancelled) {
      return { ok: true as const, cancelled: false }
    }
    const session = coord.appendDeployCancelledNotice(sessionId)
    if (!session) {
      return { ok: true as const, cancelled: true }
    }
    const listed = coord.listWorkspaces()
    return {
      ok: true as const,
      cancelled: true,
      agentRun: runner.getRunForSession(sessionId),
      messages: session.messages,
      dispatchDraft: session.dispatchDraft,
      planSummary: session.planSummary,
      planConfirmed: session.planConfirmed,
      planConfirmedAt: session.planConfirmedAt,
      deployedUskillId: session.deployedUskillId,
      deployedAt: session.deployedAt,
      workspaces: listed.workspaces
    }
  })

  ipcMain.handle('openforu:workspaces:list', () => {
    return { ok: true, ...getCoordinator().listWorkspaces() }
  })

  ipcMain.handle('openforu:workspaces:open', () => {
    if (!isOpenForUConfigured(loadSettings())) {
      return { ...notConfigured(), workspaces: [], activeWorkspaceId: null, max: 6, sessionId: '', messages: [] }
    }
    const opened = getCoordinator().openActivePlan()
    const listed = getCoordinator().listWorkspaces()
    return {
      ok: true,
      ...opened,
      workspaces: listed.workspaces,
      activeWorkspaceId: listed.activeWorkspaceId,
      max: listed.max
    }
  })

  ipcMain.handle('openforu:workspaces:create', (_e, args?: { name?: string }) => {
    if (!isOpenForUConfigured(loadSettings())) {
      return { ...notConfigured(), sessionId: '', messages: [], workspace: null, evicted: null }
    }
    const created = getCoordinator().createWorkspace(args?.name)
    const listed = getCoordinator().listWorkspaces()
    return {
      ok: true,
      ...created,
      workspaces: listed.workspaces,
      activeWorkspaceId: listed.activeWorkspaceId,
      max: listed.max
    }
  })

  ipcMain.handle('openforu:workspaces:switch', (_e, workspaceId: string) => {
    if (!isOpenForUConfigured(loadSettings())) {
      return { ...notConfigured(), sessionId: '', messages: [], workspace: null }
    }
    try {
      const switched = getCoordinator().switchWorkspace(workspaceId)
      const listed = getCoordinator().listWorkspaces()
      return {
        ok: true,
        ...switched,
        workspaces: listed.workspaces,
        activeWorkspaceId: listed.activeWorkspaceId,
        max: listed.max
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        sessionId: '',
        messages: [],
        workspace: null
      }
    }
  })

  ipcMain.handle('openforu:workspaces:delete', (_e, workspaceId: string) => {
    try {
      const result = getCoordinator().deleteWorkspace(workspaceId)
      const listed = getCoordinator().listWorkspaces()
      return { ok: true, ...result, ...listed }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        activeWorkspaceId: null,
        workspaces: [],
        max: 6
      }
    }
  })

  ipcMain.handle(
    'openforu:plan:refineOpen',
    (_e, args: { extensionId: string; instruction?: string; displayName?: string }) => {
      if (!isOpenForUConfigured(loadSettings())) {
        return { ...notConfigured(), sessionId: '', messages: [], workspace: null }
      }
      if (!args.extensionId?.trim()) {
        return { ok: false as const, error: '缺少 extensionId', sessionId: '', messages: [], workspace: null }
      }
      try {
        const opened = getCoordinator().openRefineInPlan(args.extensionId.trim(), {
          instruction: args.instruction,
          displayName: args.displayName
        })
        const listed = getCoordinator().listWorkspaces()
        broadcastToRenderers('openforu:plan:session-updated', {
          ...opened,
          workspaces: listed.workspaces,
          activeWorkspaceId: listed.activeWorkspaceId,
          max: listed.max
        })
        return {
          ok: true as const,
          ...opened,
          workspaces: listed.workspaces,
          activeWorkspaceId: listed.activeWorkspaceId,
          max: listed.max,
          designSpecGate: evaluateDesignSpecGate(opened.designSpec)
        }
      } catch (err) {
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : String(err),
          sessionId: '',
          messages: [],
          workspace: null
        }
      }
    }
  )

  /** @deprecated 使用 openforu:workspaces:open */
  ipcMain.handle('openforu:plan:start', () => {
    const settings = loadSettings()
    if (!isOpenForUConfigured(settings)) {
      return { ok: false, error: OPENFORU_NOT_CONFIGURED_MSG, sessionId: '', messages: [] }
    }
    const opened = getCoordinator().openActivePlan()
    return { ok: true, sessionId: opened.sessionId, messages: opened.messages }
  })

  ipcMain.handle('openforu:plan:send', async (_e, args: { sessionId: string; text: string }) => {
    const settings = loadSettings()
    if (!isOpenForUConfigured(settings)) {
      return { ok: false, error: OPENFORU_NOT_CONFIGURED_MSG, messages: [] }
    }
    try {
      const session = await getCoordinator().send(args.sessionId, args.text, settings)
      const listed = getCoordinator().listWorkspaces()
      return {
        ok: true,
        messages: session.messages,
        dispatchDraft: session.dispatchDraft,
        planSummary: session.planSummary,
        planConfirmed: session.planConfirmed,
        planConfirmedAt: session.planConfirmedAt,
        workspaces: listed.workspaces,
        ...planSessionFields(session)
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        messages: []
      }
    }
  })

  ipcMain.handle('openforu:plan:confirm', async (_e, sessionId: string) => {
    const settings = loadSettings()
    if (!isOpenForUConfigured(settings)) {
      return { ok: false, error: OPENFORU_NOT_CONFIGURED_MSG }
    }
    try {
      const session = getCoordinator().confirmPlan(sessionId)
      const listed = getCoordinator().listWorkspaces()
      return {
        ok: true,
        messages: session.messages,
        dispatchDraft: session.dispatchDraft,
        planSummary: session.planSummary,
        planConfirmed: session.planConfirmed,
        planConfirmedAt: session.planConfirmedAt,
        deployedUskillId: session.deployedUskillId,
        deployedAt: session.deployedAt,
        workspaces: listed.workspaces,
        ...planSessionFields(session)
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  })

  ipcMain.handle('openforu:plan:deploy', async (_e, sessionId: string) => {
    const settings = loadSettings()
    if (!isOpenForUConfigured(settings)) {
      return { ok: false, error: OPENFORU_NOT_CONFIGURED_MSG }
    }
    const ext = getExtensionsCoordinator()
    if (!ext) {
      return { ok: false, error: '扩展协调器未就绪' }
    }
    try {
      const { session, uskillId, notifyText } = await getCoordinator().deployPlan(
        sessionId,
        ext.openforu
      )
      broadcastToRenderers('openforu:notify', { text: notifyText })
      const listed = getCoordinator().listWorkspaces()
      return {
        ok: true,
        uskillId,
        messages: session.messages,
        dispatchDraft: session.dispatchDraft,
        planSummary: session.planSummary,
        planConfirmed: session.planConfirmed,
        planConfirmedAt: session.planConfirmedAt,
        deployedUskillId: session.deployedUskillId,
        deployedAt: session.deployedAt,
        workspaces: listed.workspaces,
        ...planSessionFields(session)
      }
    } catch (err) {
      const session = getCoordinator().loadSession(sessionId)
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        messages: session?.messages,
        ...(session ? planSessionFields(session) : {})
      }
    }
  })

  ipcMain.handle('openforu:plan:approveWireframe', (_e, sessionId: string) => {
    if (!sessionId) return { ok: false as const, error: '缺少 sessionId' }
    try {
      const session = getCoordinator().approveWireframe(sessionId)
      const listed = getCoordinator().listWorkspaces()
      return {
        ok: true as const,
        messages: session.messages,
        ...planSessionFields(session),
        workspaces: listed.workspaces
      }
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  })

  ipcMain.handle(
    'openforu:refine:preview',
    async (_e, args: { extensionId: string; instruction: string }) => {
      const settings = loadSettings()
      if (!isOpenForUConfigured(settings)) return notConfigured()
      const ext = getExtensionsCoordinator()
      if (!ext) return { ok: false as const, error: '扩展协调器未就绪' }
      if (!args.extensionId || !args.instruction?.trim()) {
        return { ok: false as const, error: '缺少 extensionId 或 instruction' }
      }
      const preview = await previewRefine(
        ext.openforu,
        args.extensionId,
        args.instruction.trim(),
        settings
      )
      return { ok: preview.ok, preview, error: preview.error }
    }
  )

  ipcMain.handle(
    'openforu:refine:apply',
    async (_e, args: { extensionId: string; instruction: string }) => {
      const settings = loadSettings()
      if (!isOpenForUConfigured(settings)) return notConfigured()
      const ext = getExtensionsCoordinator()
      if (!ext) return { ok: false as const, error: '扩展协调器未就绪' }
      if (!args.extensionId || !args.instruction?.trim()) {
        return { ok: false as const, error: '缺少 extensionId 或 instruction' }
      }
      const dataRoot = resolveDataRoot(settings)
      const result = await applyRefine(
        ext,
        args.extensionId,
        args.instruction.trim(),
        settings,
        dataRoot
      )
      if (result.ok && result.newExtensionId) {
        broadcastToRenderers('openforu:notify', {
          text: `Refine 完成 · ${result.newExtensionId}`
        })
      }
      return { ok: result.ok, result, error: result.ok ? undefined : result.message }
    }
  )

  ipcMain.handle('openforu:refine:history', (_e, extensionId: string) => {
    if (!extensionId) return { ok: false as const, error: '缺少 extensionId', entries: [] }
    const dataRoot = resolveDataRoot(loadSettings())
    return { ok: true as const, entries: getRefineHistory(dataRoot, extensionId) }
  })

  ipcMain.handle(
    'openforu:refine:rollback',
    (_e, args: { extensionId: string; targetVersion: string; kind?: 'uskill' | 'uplugin' }) => {
      if (!args.extensionId || !args.targetVersion) {
        return { ok: false as const, error: '缺少 extensionId 或 targetVersion' }
      }
      const dataRoot = resolveDataRoot(loadSettings())
      const restored = rollbackRefine(
        dataRoot,
        args.extensionId,
        args.targetVersion,
        args.kind
      )
      if (restored) {
        broadcastToRenderers('openforu:notify', {
          text: `已回滚 ${args.extensionId} → v${args.targetVersion}`
        })
      }
      return restored
        ? { ok: true as const }
        : { ok: false as const, error: '回滚失败或版本不存在' }
    }
  )

  ipcMain.handle(
    'openforu:plan:redeploy',
    async (_e, args: { sessionId: string; userText?: string }) => {
      const settings = loadSettings()
      if (!isOpenForUConfigured(settings)) {
        return { ok: false, error: OPENFORU_NOT_CONFIGURED_MSG }
      }
      const ext = getExtensionsCoordinator()
      if (!ext) {
        return { ok: false, error: '扩展协调器未就绪' }
      }
      try {
        const { session, uskillId, notifyText } = await getCoordinator().redeployPlan(
          args.sessionId,
          ext.openforu,
          args.userText
        )
        broadcastToRenderers('openforu:notify', { text: notifyText })
        const listed = getCoordinator().listWorkspaces()
        return {
          ok: true,
          uskillId,
          messages: session.messages,
          dispatchDraft: session.dispatchDraft,
          planSummary: session.planSummary,
          planConfirmed: session.planConfirmed,
          planConfirmedAt: session.planConfirmedAt,
          deployedUskillId: session.deployedUskillId,
          deployedAt: session.deployedAt,
          workspaces: listed.workspaces,
          ...planSessionFields(session)
        }
      } catch (err) {
        const session = getCoordinator().loadSession(args.sessionId)
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          messages: session?.messages,
          ...(session ? planSessionFields(session) : {})
        }
      }
    }
  )

  ipcMain.handle('openforu:plan:status', (_e, sessionId: string) => {
    const session = getCoordinator().loadSession(sessionId)
    return session
      ? {
          ok: true,
          messages: session.messages,
          dispatchDraft: session.dispatchDraft,
          planSummary: session.planSummary,
          planConfirmed: session.planConfirmed,
          planConfirmedAt: session.planConfirmedAt,
          ...planSessionFields(session)
        }
      : { ok: false }
  })

  ipcMain.handle('openforu:listArtifacts', () => {
    const ext = getExtensionsCoordinator()
    if (!ext) return { paths: [] }
    return {
      paths: ext.openforu.listUskills().map((u) => u.dirPath)
    }
  })

  ipcMain.handle('openforu:artifact:preview', async (_e, sessionId: string) => {
    const settings = loadSettings()
    if (!isOpenForUConfigured(settings)) {
      return { ...notConfigured() }
    }
    const session = getCoordinator().loadSession(sessionId)
    if (!session) {
      return { ok: false as const, error: 'Plan 会话不存在' }
    }
    try {
      const dataRoot = resolveDataRoot(settings)
      return await previewPlanArtifact(dataRoot, session, settings)
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  })

  ipcMain.handle('openforu:artifact:read', (_e, extensionId: string) => {
    const ext = getExtensionsCoordinator()
    if (!ext) {
      return { ok: false as const, error: '扩展协调器未就绪' }
    }
    const uskill = ext.openforu.listUskills().find((u) => u.manifest.id === extensionId)
    if (uskill) {
      try {
        const manifest = readFileSync(join(uskill.dirPath, 'manifest.json'), 'utf-8')
        const skillJson = readFileSync(join(uskill.dirPath, 'skill.json'), 'utf-8')
        return {
          ok: true as const,
          extensionId,
          artifactKind: 'uskill' as const,
          uskillId: extensionId,
          dirRel: `openforu/uskills/${basename(uskill.dirPath)}`,
          files: {
            'manifest.json': manifest,
            'skill.json': skillJson
          },
          source: 'deployed' as const
        }
      } catch (err) {
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : String(err)
        }
      }
    }
    const uplugin = ext.openforu.listUplugins().find((u) => u.manifest.id === extensionId)
    if (uplugin) {
      try {
        const manifest = readFileSync(join(uplugin.dirPath, 'manifest.json'), 'utf-8')
        const meta = readFileSync(join(uplugin.dirPath, 'plugin.meta.json'), 'utf-8')
        return {
          ok: true as const,
          extensionId,
          artifactKind: 'uplugin' as const,
          dirRel: `openforu/uplugins/${basename(uplugin.dirPath)}`,
          files: {
            'manifest.json': manifest,
            'plugin.meta.json': meta
          },
          source: 'deployed' as const
        }
      } catch (err) {
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : String(err)
        }
      }
    }
    return { ok: false as const, error: '未找到已部署扩展' }
  })

  ipcMain.handle('openforu:extensions:list', async (): Promise<{
    uskills: OpenForUExtensionRow[]
    uplugins: OpenForUExtensionRow[]
  }> => {
    const ext = getExtensionsCoordinator()
    if (!ext) return { uskills: [], uplugins: [] }

    // 部署后或主进程热重载后，内存 Map 可能落后于磁盘；列表前先 rescan
    await ext.openforu.scanUskills()
    await ext.openforu.scanUplugins()

    const uskills: OpenForUExtensionRow[] = ext.openforu.listUskills().map((u) => {
      const reg = ext.skills.get(u.manifest.id)
      return {
        kind: 'uskill',
        manifest: {
          id: u.manifest.id,
          name: u.manifest.name,
          description: u.manifest.description,
          version: u.manifest.version,
          tags: u.manifest.tags,
          dispatch: u.manifest.dispatch
        },
        status: (reg?.status ?? u.status) as OpenForUExtensionRow['status'],
        runnable: ext.skills.isRunnable(u.manifest.id),
        dirPath: u.dirPath,
        lastError: u.lastError ?? reg?.lastError
      }
    })

    const uplugins: OpenForUExtensionRow[] = ext.openforu.listUplugins().map((u) => {
      const reg = ext.plugins.get(u.manifest.id)
      const { pending } = computePermissionState(
        u.manifest.permissions,
        u.grantedPermissions ?? u.meta?.grantedPermissions
      )
      const pendingPermissions = pending as PluginPermission[]
      const dataRoot = ext.getDataRoot()
      return {
        kind: 'uplugin',
        manifest: {
          id: u.manifest.id,
          name: u.manifest.name,
          description: u.manifest.description,
          version: u.manifest.version,
          tags: u.manifest.tags,
          dispatch: u.manifest.dispatch
        },
        status: (reg?.status ?? u.status) as OpenForUExtensionRow['status'],
        runnable: reg
          ? ext.plugins.isRunnable(u.manifest.id)
          : Boolean(u.meta?.injectTemplate?.trim() || u.dirPath),
        dirPath: u.dirPath,
        lastError: u.lastError ?? reg?.lastError,
        pendingPermissions: pendingPermissions.length ? pendingPermissions : undefined,
        hasSurface: upluginHasSurface(dataRoot, u.manifest.id)
      }
    })

    return { uskills, uplugins }
  })

  ipcMain.handle(
    'openforu:surface:open',
    async (_e, payload: { extensionId: string }): Promise<{ ok: boolean; message: string }> => {
      const ext = getExtensionsCoordinator()
      if (!ext) return { ok: false, message: '扩展协调器未就绪' }
      const id = payload.extensionId?.trim()
      if (!id?.startsWith('u/')) {
        return { ok: false, message: '只能打开用户 uplugin Surface' }
      }
      const result = executeOpenExtensionSurface(ext, id)
      if (result.ok) {
        broadcastToRenderers('openforu:notify', { text: result.message.replace(/\*\*/g, '') })
      }
      return { ok: result.ok, message: result.message }
    }
  )

  ipcMain.handle(
    'openforu:extensions:remove',
    async (_e, payload: { kind: 'uskill' | 'uplugin'; id: string }) => {
      const ext = getExtensionsCoordinator()
      if (!ext) return { ok: false, error: '扩展协调器未就绪' }
      if (!payload.id.startsWith('u/')) {
        return { ok: false, error: '只能删除用户自创扩展（u/ 前缀）' }
      }
      if (payload.kind === 'uskill') {
        if (!ext.openforu.getUskil(payload.id)) {
          await ext.openforu.scanUskills()
        }
        const result = await ext.openforu.removeUskil(payload.id)
        if (result.ok) broadcastToRenderers('openforu:notify', { text: `已删除 Skill ${payload.id}` })
        return result
      }
      if (!ext.openforu.getUplugin(payload.id)) {
        await ext.openforu.scanUplugins()
      }
      const result = await ext.openforu.removeUplugin(payload.id)
      if (result.ok) broadcastToRenderers('openforu:notify', { text: `已删除 Plugin ${payload.id}` })
      return result
    }
  )

  ipcMain.handle('openforu:notifyMain', (_e, text: string) => {
    broadcastToRenderers('openforu:notify', { text })
    return { ok: true }
  })

  ipcMain.handle('openforu:permissions:approve', (_e, args: { requestId: string }) => {
    const ok = resolvePermissionRequest(args.requestId, 'approved')
    return { ok }
  })

  ipcMain.handle('openforu:permissions:deny', (_e, args: { requestId: string }) => {
    const ok = resolvePermissionRequest(args.requestId, 'denied')
    return { ok }
  })

  ipcMain.handle('openforu:permissions:approveAndActivate', async (_e, args: { pluginId: string }) => {
    const ext = getExtensionsCoordinator()
    if (!ext) return { ok: false, error: '扩展协调器未就绪' }
    return ext.openforu.approveAllPendingAndActivate(args.pluginId)
  })
}

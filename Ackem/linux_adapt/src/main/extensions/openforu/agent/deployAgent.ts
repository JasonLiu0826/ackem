import type { PlanSession } from '../../../../shared/planSession'
import { resolvePlanArtifactKind } from '../../../../shared/planArtifact'
import type { OpenForULoader } from '../loader'
import type { DeployAgentResult } from './types'
import type { ArtifactBundle } from './bundleTypes'
import { generateDeterministicBundleForKind } from './strategies/deterministic'
import { assertValidArtifactBundle } from './validateAgent'
import {
  buildUpluginDeployCopy,
  getUpluginRuntimeMode,
  pickUpluginExtraDeployFiles
} from '../sandbox/upluginDeployMode'
import { formatSlashInvokeHint } from '../../dispatch/slashDispatch'

export type DeploySessionHooks = {
  onGeneratingStart?: (session: PlanSession) => void
  onDeployFailed?: (session: PlanSession, error: string) => void
  /** Agent 管线：由 runner 写 Delivery Card，跳过中间消息 */
  silent?: boolean
}

export type DeploySessionStore = {
  saveSession: (session: PlanSession) => void
  writeStaging: (session: PlanSession) => void
  touchSession: (sessionId: string) => void
}

/**
 * 将已生成且校验通过的制品部署到正式目录（仅 loader.deploy*）。
 */
export async function executeDeployFromBundle(
  session: PlanSession,
  loader: OpenForULoader,
  bundle: ArtifactBundle,
  store: DeploySessionStore,
  hooks?: DeploySessionHooks
): Promise<DeployAgentResult> {
  if (!session.planConfirmed) {
    throw new Error('请先确认方案再部署')
  }

  hooks?.onGeneratingStart?.(session)
  const silent = hooks?.silent === true
  const pushMsg = (content: string): void => {
    if (!silent) session.messages.push({ role: 'assistant', content })
  }

  if (bundle.kind === 'uplugin') {
    const runtimeMode = getUpluginRuntimeMode(bundle.files)
    const deployCopy = buildUpluginDeployCopy(runtimeMode, {
      extensionId: bundle.manifest.id,
      dirName: bundle.dirName,
      displayName: bundle.manifest.name,
      dispatchMode: bundle.manifest.dispatch?.mode ?? 'dispatched'
    })

    pushMsg(deployCopy.deploying)
    store.saveSession(session)

    const deployResult = await loader.deployUplugin(
      bundle.dirName,
      bundle.manifest,
      bundle.meta,
      pickUpluginExtraDeployFiles(bundle.files)
    )
    if (!deployResult.ok || !deployResult.id) {
      const err = deployResult.error ?? '部署失败'
      const code = (deployResult as { code?: string }).code
      hooks?.onDeployFailed?.(session, err)
      pushMsg(
        code === 'permission_denied'
          ? '❌ 部署已取消：未授予所需权限。可在扩展中心补批后发送【重新部署】。'
          : `❌ **部署失败**：${err}。请检查 dispatch 配置或重试。`
      )
      store.saveSession(session)
      store.writeStaging(session)
      throw new Error(err)
    }

    const priorRefineExtensionId =
      session.refineMode
        ? (session.linkedExtensionId ?? session.deployedUskillId)
        : undefined

    session.deployedUskillId = deployResult.id
    session.deployedAt = new Date().toISOString()
    session.linkedExtensionId = deployResult.id

    if (priorRefineExtensionId && priorRefineExtensionId !== deployResult.id) {
      try {
        await loader.removeUplugin(priorRefineExtensionId)
      } catch {
        /* 旧副本可能已被用户手动删除 */
      }
    }
    const slashHint = bundle.manifest.dispatch
      ? formatSlashInvokeHint(bundle.manifest.dispatch)
      : ''
    const notifyText = deployCopy.notifyText
    pushMsg(`${deployCopy.successBody}${slashHint ? `\n${slashHint}` : ''}\n\n${notifyText}`)
    store.saveSession(session)
    store.writeStaging(session)
    store.touchSession(session.id)
    return { session, extensionId: deployResult.id, notifyText }
  }

  pushMsg('⏳ **正在部署** uskill（已由 staging 预览生成 manifest / skill.json）…')
  store.saveSession(session)

  const deployResult = await loader.deployUskill(
    bundle.dirName,
    bundle.manifest,
    bundle.skillConfig
  )
  if (!deployResult.ok || !deployResult.id) {
    const err = deployResult.error ?? '部署失败'
    hooks?.onDeployFailed?.(session, err)
    pushMsg(`❌ **部署失败**：${err}。请检查 dispatch 配置或重试。`)
    store.saveSession(session)
    store.writeStaging(session)
    throw new Error(err)
  }

  session.deployedUskillId = deployResult.id
  session.deployedAt = new Date().toISOString()
  const slashHint = bundle.manifest.dispatch
    ? formatSlashInvokeHint(bundle.manifest.dispatch)
    : ''
  const notifyText = `✓ ${bundle.manifest.name} Skill 已就绪，可在聊天中通过关键词触发（v1：配置+上下文注入，非任意代码执行）。`
  pushMsg(
    `✅ **部署完成**\n\n- uskill \`${deployResult.id}\`\n- 路径 \`data/openforu/uskills/${bundle.dirName}/\`\n- 调度 mode: \`${bundle.manifest.dispatch?.mode ?? 'dispatched'}\`${slashHint ? `\n${slashHint}` : ''}\n- 说明：v1 为配置+上下文注入，不会自动编写或执行任意 TypeScript 代码\n\n${notifyText}`
  )
  store.saveSession(session)
  store.writeStaging(session)
  store.touchSession(session.id)

  return { session, extensionId: deployResult.id, notifyText }
}

/** 旧路径：无 Agent Core 时仍直接 deterministic 生成并部署 */
export async function executeDeployPlan(
  session: PlanSession,
  loader: OpenForULoader,
  store: DeploySessionStore,
  hooks?: DeploySessionHooks
): Promise<DeployAgentResult> {
  const artifactKind = resolvePlanArtifactKind(session)
  if (artifactKind === 'undecided') {
    throw new Error('请先在 Plan 中明确产物类型为 uskill 或 uplugin 后再部署')
  }

  const bundle = generateDeterministicBundleForKind(session, artifactKind)
  assertValidArtifactBundle(bundle)
  return executeDeployFromBundle(session, loader, bundle, store, hooks)
}

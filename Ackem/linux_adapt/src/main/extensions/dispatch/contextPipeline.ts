import type { AppSettings } from '../../settings'
import type { DispatchResult } from '../protocols'
import type { ExtensionsCoordinator } from '../coordinator'
import { routeDispatch } from '../../engine/dispatchRouter'
import {
  executeDispatchedExtension,
  shouldExecuteImmediately
} from './dispatchExecutor'
import {
  getSlashCommandsForEntry,
  matchSlashInvokeDisabled
} from './slashDispatch'
import { recordDispatchReject } from './dispatchSession'
import type { EngineSnapshot } from '../protocols'
import type { createLlmJsonClient } from '../../llmClient'
import { buildDispatchMemoryBlock } from '../policy/recallContext'
import { filterDispatchedCatalogByProfile, recordExtensionAllow, recordExtensionReject } from '../policy/userProfile'
import { buildActivityHint } from '../../context/runtimeHints'
import { resolveIntent, pushTopic } from './intentResolver'
import { executeSurfaceInvoke } from '../openforu/surface/invokeSurface'

export type SurfaceInvokePipelineResult = {
  message: string
  opened: boolean
}

export type DispatchPipelineInput = {
  userText: string
  sessionId: string
  settings: AppSettings
  state: { personality: { presetId: string }; emotion: { primaryLabel: string } }
  recentMessages?: Array<{ role: string; content: string }>
  retrievedMemoryBlock?: string
  coordinator: ExtensionsCoordinator
  snapshot: EngineSnapshot
  llm: ReturnType<typeof createLlmJsonClient>
  /** 用户拒绝后重试时跳过 ask */
  skipAskForExtensionId?: string
  /** wave fast path：跳过 intent/dispatch LLM */
  skipLlm?: boolean
  /** 已由 prepareTurnContext 提供的 query embedding（intent 未改写时可复用） */
  queryEmbed?: number[]
}

export async function runDispatchPipeline(
  input: DispatchPipelineInput
): Promise<{
  dispatchResult?: DispatchResult
  extraInjections: string[]
  emotionHintDelta?: DispatchResult['emotionHint']
  /** 消解后的消息（供知识卡等插件使用） */
  resolvedMessage?: string
  surfaceInvokeResult?: SurfaceInvokePipelineResult
}> {
  const dataRoot = input.coordinator.getDataRoot()
  const dispatchedCatalog = input.coordinator
    .getDispatchCatalog(input.sessionId)
    .filter((e) => e.dispatch.mode === 'dispatched')
  const catalog = filterDispatchedCatalogByProfile(
    dispatchedCatalog.filter((e) => e.status === 'active'),
    dataRoot
  )

  const disabledSlash = matchSlashInvokeDisabled(input.userText, dispatchedCatalog)
  if (disabledSlash) {
    const slashHint = getSlashCommandsForEntry(disabledSlash).slice(0, 2).join(' 或 ')
    const statusLabel =
      disabledSlash.status === 'error' ? '加载失败' : '未启用'
    return {
      dispatchResult: {
        decision: 'chat',
        extensionId: disabledSlash.id,
        reasoning: 'slash_extension_disabled'
      },
      extraInjections: [
        [
          '【扩展调度·必读】',
          `用户使用了 slash 命令，但扩展「${disabledSlash.name}」当前${statusLabel}。`,
          '请到扩展中心 → 自创 Plugin → 点「启用」；若出现红条报错，先重启 Ackem 再关→开一次。',
          slashHint ? `启用后可在主聊天发送：${slashHint}` : '',
          '回复时先说明上述状态，不要只当玩笑带过。'
        ]
          .filter(Boolean)
          .join(' ')
      ]
    }
  }
  const memoryBlock = buildDispatchMemoryBlock(
    input.snapshot,
    input.retrievedMemoryBlock
  )
  const runtime = input.coordinator.getRuntimeContext()
  const activityHint = runtime ? buildActivityHint(runtime) : undefined
  const recentContext = (input.recentMessages ?? [])
    .slice(-6)
    .map((m) => `${m.role}: ${m.content.slice(0, 120)}`)
    .join('\n')

  // ═══ 意图消解 ═══
  const intentResult = input.skipLlm
    ? { resolvedMessage: input.userText, wasAmbiguous: false, wasResolved: false }
    : await resolveIntent(input.userText, input.sessionId, input.llm)
  const matchText = intentResult.resolvedMessage

  // Embedding 路由（用消解后的消息算 embedding）；wave fast path 跳过
  let queryEmbed: number[] | undefined = input.queryEmbed
  let routeIndex: import('../../embedding/types').RouteIndex | undefined
  let createToolAnchor: number[] | undefined
  if (dataRoot && !input.skipLlm) {
    try {
      const engineCache = await import('../../engineCache')
      const embeddingProvider = engineCache.getCachedEmbeddingProvider(dataRoot)
      if (embeddingProvider?.ready()) {
        if (!queryEmbed || (matchText !== input.userText.trim() && matchText !== input.userText)) {
          queryEmbed = await embeddingProvider.embed(matchText)
        }
        const { buildRouteIndex } = await import('../../embedding/routeTable')
        routeIndex = await buildRouteIndex(embeddingProvider)
        const { getCachedCreateToolAnchor, getCachedAnchorVectors } = await import('../../embedding/preLlmWarmup')
        createToolAnchor = getCachedCreateToolAnchor() ?? undefined
        if (!createToolAnchor) {
          await getCachedAnchorVectors(embeddingProvider)
          createToolAnchor = getCachedCreateToolAnchor() ?? undefined
        }
      }
    } catch { /* Embedding 失败不影响主流程 */ }
  }

  const dispatchResult = await routeDispatch({
    userMessage: input.userText,
    matchMessage: matchText,
    sessionId: input.sessionId,
    catalog,
    dataRoot,
    personalityPresetId: input.state.personality.presetId,
    recentContext,
    emotionLabel: input.state.emotion.primaryLabel,
    retrievedMemoryBlock: memoryBlock,
    activityHint: activityHint ?? undefined,
    queryEmbed,
    routeIndex,
    createToolAnchor: createToolAnchor ?? undefined,
    llmCall: input.skipLlm
      ? undefined
      : async (prompt) =>
          input.llm.chatCompletionJson({
            messages: [
              { role: 'system', content: '只返回 JSON，不要 markdown。' },
              { role: 'user', content: prompt }
            ],
            temperature: 0,
            max_tokens: 180
          })
  })

  // ═══ 话题追踪：始终更新话题栈（有实质内容时） ═══
  const topicText = input.userText.trim()
  if (topicText.length >= 4 && !/^[嗯哦好的好吧行是嗯嗯哦哦哈哈呵呵]+$/.test(topicText)) {
    pushTopic(input.sessionId, topicText.slice(0, 120), dispatchResult.decision)
  }

  const extraInjections: string[] = []

  if (
    dispatchResult.decision === 'ask_invoke' &&
    input.skipAskForExtensionId &&
    dispatchResult.extensionId === input.skipAskForExtensionId
  ) {
    return {
      dispatchResult: { decision: 'chat', reasoning: 'ask_skipped_after_reject' },
      extraInjections
    }
  }

  let emotionHintDelta = dispatchResult.emotionHint

  if (
    dispatchResult.decision === 'invoke_surface' &&
    dispatchResult.extensionId &&
    dispatchResult.surfaceInvoke
  ) {
    const outcome = await executeSurfaceInvoke({
      coordinator: input.coordinator,
      extensionId: dispatchResult.extensionId,
      userMessage: input.userText,
      sessionId: input.sessionId,
      snapshot: input.snapshot,
      invoke: dispatchResult.surfaceInvoke,
      reasoning: dispatchResult.reasoning
    })
    extraInjections.push(...outcome.llmHints)
    if (outcome.injectContext) extraInjections.push(outcome.injectContext)
    if (!outcome.opened) {
      extraInjections.push(`【Surface·错误】${outcome.message}`)
    }
    return {
      dispatchResult,
      extraInjections,
      emotionHintDelta,
      resolvedMessage: intentResult.wasResolved ? matchText : undefined,
      surfaceInvokeResult: { message: outcome.message, opened: outcome.opened }
    }
  }

  if (
    dispatchResult.decision === 'auto_invoke' &&
    dispatchResult.extensionId &&
    shouldExecuteImmediately(input.coordinator, dispatchResult.extensionId)
  ) {
    const exec = await executeDispatchedExtension(
      input.coordinator,
      dispatchResult.extensionId,
      input.userText,
      input.sessionId,
      input.snapshot
    )
    if (exec.contextInjection) extraInjections.push(exec.contextInjection)
    if (dispatchResult.reasoning === 'extension_invoke_slash') {
      extraInjections.push(
        '【slash 调度·硬性】本轮已通过 / 命令触发用户扩展。你必须在回复中落实下方「扩展上下文」里的要求（含探针/Worker/番茄钟等具体指示），不得只调侃用户敲命令。'
      )
    }
    if (exec.emotionHint) {
      emotionHintDelta = {
        affDelta: (emotionHintDelta?.affDelta ?? 0) + (exec.emotionHint.affDelta ?? 0),
        secDelta: (emotionHintDelta?.secDelta ?? 0) + (exec.emotionHint.secDelta ?? 0),
        aroDelta: (emotionHintDelta?.aroDelta ?? 0) + (exec.emotionHint.aroDelta ?? 0),
        domDelta: (emotionHintDelta?.domDelta ?? 0) + (exec.emotionHint.domDelta ?? 0)
      }
    }
  }

  return {
    dispatchResult,
    extraInjections,
    emotionHintDelta,
    resolvedMessage: intentResult.wasResolved ? matchText : undefined
  }
}

export function rejectDispatchExtension(
  sessionId: string,
  extensionId: string,
  options?: { dataRoot?: string; remember?: boolean }
): void {
  recordDispatchReject(sessionId, extensionId)
  if (options?.dataRoot) {
    recordExtensionReject(options.dataRoot, extensionId, { remember: options.remember })
  }
}

export function acceptDispatchExtension(
  dataRoot: string,
  extensionId: string,
  remember?: boolean
): void {
  recordExtensionAllow(dataRoot, extensionId, remember)
}

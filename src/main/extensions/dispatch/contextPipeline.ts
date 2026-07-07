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
  /** 鐢ㄦ埛鎷掔粷鍚庨噸璇曟椂璺宠繃 ask */
  skipAskForExtensionId?: string
  /** wave fast path锛氳烦杩?intent/dispatch LLM */
  skipLlm?: boolean
  /** 宸茬敱 prepareTurnContext 鎻愪緵鐨?query embedding锛坕ntent 鏈敼鍐欐椂鍙鐢級 */
  queryEmbed?: number[]
}

export async function runDispatchPipeline(
  input: DispatchPipelineInput
): Promise<{
  dispatchResult?: DispatchResult
  extraInjections: string[]
  emotionHintDelta?: DispatchResult['emotionHint']
  /** 娑堣В鍚庣殑娑堟伅锛堜緵鐭ヨ瘑鍗＄瓑鎻掍欢浣跨敤锛?*/
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
    const slashHint = getSlashCommandsForEntry(disabledSlash).slice(0, 2).join(' 鎴?')
    const statusLabel =
      disabledSlash.status === 'error' ? '鍔犺浇澶辫触' : '鏈惎鐢?
    return {
      dispatchResult: {
        decision: 'chat',
        extensionId: disabledSlash.id,
        reasoning: 'slash_extension_disabled'
      },
      extraInjections: [
        [
          '銆愭墿灞曡皟搴β峰繀璇汇€?,
          `鐢ㄦ埛浣跨敤浜?slash 鍛戒护锛屼絾鎵╁睍銆?{disabledSlash.name}銆嶅綋鍓?{statusLabel}銆俙,
          '璇峰埌鎵╁睍涓績 鈫?鑷垱 Plugin 鈫?鐐广€屽惎鐢ㄣ€嶏紱鑻ュ嚭鐜扮孩鏉℃姤閿欙紝鍏堥噸鍚?Ackem 鍐嶅叧鈫掑紑涓€娆°€?,
          slashHint ? `鍚敤鍚庡彲鍦ㄤ富鑱婂ぉ鍙戦€侊細${slashHint}` : '',
          '鍥炲鏃跺厛璇存槑涓婅堪鐘舵€侊紝涓嶈鍙綋鐜╃瑧甯﹁繃銆?
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

  // 鈺愨晲鈺?鎰忓浘娑堣В 鈺愨晲鈺?
  const intentResult = input.skipLlm
    ? { resolvedMessage: input.userText, wasAmbiguous: false, wasResolved: false }
    : await resolveIntent(input.userText, input.sessionId, input.llm)
  const matchText = intentResult.resolvedMessage

  // Embedding 璺敱锛堢敤娑堣В鍚庣殑娑堟伅绠?embedding锛夛紱wave fast path 璺宠繃
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
    } catch { /* Embedding 澶辫触涓嶅奖鍝嶄富娴佺▼ */ }
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
              { role: 'system', content: '鍙繑鍥?JSON锛屼笉瑕?markdown銆? },
              { role: 'user', content: prompt }
            ],
            temperature: 0,
            max_tokens: 180
          })
  })

  // 鈺愨晲鈺?璇濋杩借釜锛氬缁堟洿鏂拌瘽棰樻爤锛堟湁瀹炶川鍐呭鏃讹級 鈺愨晲鈺?
  const topicText = input.userText.trim()
  if (topicText.length >= 4 && !/^[鍡摝濂界殑濂藉惂琛屾槸鍡棷鍝﹀摝鍝堝搱鍛靛懙]+$/.test(topicText)) {
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
      extraInjections.push(`銆怱urface路閿欒銆?{outcome.message}`)
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
        '銆恠lash 璋冨害路纭€с€戞湰杞凡閫氳繃 / 鍛戒护瑙﹀彂鐢ㄦ埛鎵╁睍銆備綘蹇呴』鍦ㄥ洖澶嶄腑钀藉疄涓嬫柟銆屾墿灞曚笂涓嬫枃銆嶉噷鐨勮姹傦紙鍚帰閽?Worker/鐣寗閽熺瓑鍏蜂綋鎸囩ず锛夛紝涓嶅緱鍙皟渚冪敤鎴锋暡鍛戒护銆?
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

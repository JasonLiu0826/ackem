// [ipc/chat] 鈥?瀵硅瘽涓婁笅鏂囨瀯寤恒€佹祦寮忚亰澶┿€佸紩鎿庣姸鎬併€佹鏈涙爤銆乀race

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import { assembleMessages, mergeExtensionContextInjections } from '../context'
import { streamChatCompletion } from '../chat'
import { markChatStreamEnd, markChatStreamStart } from '../desktop-agent/deliveryCoordinator'
import { recordDesktopAckemActivity } from '../channels/weixin/activity'
import { createLlmJsonClient } from '../llmClient'
import { createLogger } from '../logger'
import {
  clearActiveDesires,
  dismissDesireFromStack,
  settleDesiresForKnowledgeTopic
} from '../engine/desire'
import { activeRecall, runPreLlmTurn, type PreLlmResult } from '../engine/orchestrator'
import { shouldSkipTierBIngestForOrigin } from '../canon/originEscalationGuard'
import { prepareTurnContext } from '../engine/prepareTurnContext'
import type { DispatchResult } from '../extensions/protocols'

/** 涓诲姩绛栫暐 Loop锛氱紦瀛樻渶杩戜竴杞殑 intensityMod锛屼緵 chat:start 娉ㄥ叆 */
let lastIntensityMod = 1.0
import {
  runDispatchPipeline,
  rejectDispatchExtension,
  acceptDispatchExtension
} from '../extensions/dispatch/contextPipeline'
import { craftPlanCreateAsk } from '../extensions/openforu/craftPlanCreateAsk'
import { executeEvolveExtension } from '../extensions/openforu/agent/executeEvolveExtension'
import { executeOpenExtensionSurface } from '../extensions/openforu/surface/executeOpenSurface'
import { resolveDispatchHonestyGuard } from '../extensions/dispatch/dispatchHonestyGuard'
import {
  buildExtensionCatalogListingBlock,
  isExtensionCapabilityListingQuery
} from '../extensions/dispatch/extensionCapabilityListing'
import { executeDispatchedExtension } from '../extensions/dispatch/dispatchExecutor'
import { resolveDispatchTriggerStatus } from '../../shared/dispatchTrigger'
import {
  clearExtensionTriggerTurn,
  consumeExtensionTriggerTurn
} from '../extensionTriggerBus'
import { resolveForcedWebSearchQuery } from '../extensions/plugins/builtin/knowledge-presentation/intent'
import { enrichQueryForRecency } from '../extensions/plugins/builtin/knowledge-presentation/presentation/recencyContext'
import { isWeatherQuery } from '../extensions/skills/builtin/tool/weather-sense/weatherIntent'
import { preExecuteWeatherQuery } from '../extensions/skills/builtin/tool/weather-sense/weatherPreExecute'
import { skillToolActivityLabel } from '../chatStatusLabels'
import { detectPlanDocumentIntent } from '../planDocument/intent'
import { detectMemoryAuditIntent } from '../../shared/memoryAuditIntent'
import { isDesktopAgentSettingsReady } from '../../shared/desktopAgent'
import { isDesktopAgentSessionActive } from '../../shared/desktopAgentModePolicy'
import {
  applyDesktopAgentModeToWorkIntent,
  shouldForceWebSearchInDesktopAgentSession
} from '../desktop-agent/modePolicy'
import {
  buildDesktopAgentCatalogSection,
  buildDesktopAgentModeSystemHint
} from '../../shared/desktopAgentCapabilityHint'
import { buildCapabilityRoutingSystemHint } from '../../shared/desktopAgentCapabilities'
import type { DesktopAgentCapabilityMatch } from '../../shared/desktopAgentCapabilities'
import { resolveDesktopAgentCapability, invalidateDesktopAgentCapabilityRouteIndex } from '../desktop-agent/routing/resolveCapability'
import { executeMemoryAuditTurn } from '../memory/memoryAudit/executeMemoryAuditTurn'
import { resolveUserTaskFrame, buildTaskFrameSystemHint } from '../taskFrame'
import { loadChatHistoryFromDb, saveChatHistoryToDb } from '../db/repos/chatHistory'
import { saveState, defaultFullState } from '../engine/state-persistence'
import { traceLatest } from '../engine/tracer'
import { workingMemory } from '../memory/workingMemory'
import { getOrCreateEngineCache, getOrInitEmbeddingProvider, ensureFactEmbeddingsReady, getCachedEmbeddingProvider } from '../engineCache'
import { isEmbeddingReadyForChat } from '../embedding/embeddingReadiness'
import { buildEngineSnapshot, buildMemoryMetaFromFacts } from '../extensions/snapshot'
import { buildUserInfoBlock } from '../memory/userDossier'
import { shouldAskUserName, getAskNamePrompt } from '../memory/userName'
import { setPendingTurn } from '../turnPending'
import { registerAndFinalizeSkipTurn } from '../postChatTurn'
import { probeLocalChat } from '../chat/waveEndpoint'
import { startDeferredEnrich } from '../chat/deferredContext'
import type { WaveBuildContext } from '../chat/buildWaveMessages'
import {
  buildWavePlan,
  requiresToolTurn,
  shouldUseWaveChat,
  type WavePlan,
} from '../../shared/wavePlan'
import {
  type ContextBuildInvoke,
  currentDataRoot,
  currentSessionId,
  defaultPersonalitySlice,
  ensureDataLayout,
  getExtensionsCoordinator,
  getOrRebuildIndex,
  loadSettings,
  mergeEngineState,
  resolveDataRoot,
} from './shared'

const log = createLogger('ipc-chat')

async function finalizeSkipTurn(args: {
  turnId: string
  root: string
  sessionId: string
  turnIndex: number
  userMsg: string
  assistantText: string
  pre: PreLlmResult
  settings: ReturnType<typeof loadSettings>
  skipIngest?: boolean
}): Promise<void> {
  await registerAndFinalizeSkipTurn({
    turnId: args.turnId,
    dataRoot: args.root,
    sessionId: args.sessionId,
    turnIndex: args.turnIndex,
    userMsg: args.userMsg,
    assistantText: args.assistantText,
    newState: args.pre.newState,
    trace: args.pre.trace,
    event: args.pre.event,
    settings: args.settings,
    skipIngest: args.skipIngest ?? shouldSkipTierBIngestForOrigin(args.pre.trace),
  })
}

function applyDispatchToPre(pre: PreLlmResult, dispatchResult?: DispatchResult): PreLlmResult {
  if (!dispatchResult) return pre
  return {
    ...pre,
    skipLlm: dispatchResult.decision === 'plan' || pre.skipLlm,
    enterPlanMode: dispatchResult.decision === 'plan' ? true : pre.enterPlanMode,
    planTopic:
      dispatchResult.decision === 'plan' ? dispatchResult.planTopic : pre.planTopic,
    dispatchAskMessage:
      dispatchResult.decision === 'ask_invoke' || dispatchResult.decision === 'ask_plan'
        ? dispatchResult.askMessage
        : pre.dispatchAskMessage,
    trace: {
      ...pre.trace,
      dispatch: {
        decision: dispatchResult.decision,
        extensionId: dispatchResult.extensionId,
        confidence: dispatchResult.confidence,
        reasoning: dispatchResult.reasoning,
      },
    },
  }
}

export function registerChatIpc(): void {
  ipcMain.handle('context:build', async (event, args: ContextBuildInvoke) => {
    if (!isEmbeddingReadyForChat()) {
      throw Object.assign(new Error('EMBEDDING_WARMING'), { code: 'EMBEDDING_WARMING' })
    }
    clearExtensionTriggerTurn()
    const settings = loadSettings()
    const root = resolveDataRoot(settings)
    ensureDataLayout(root)
    activeRecall.setPersistencePath(join(root, 'memory', 'recall-history.json'))
    const snap = getOrRebuildIndex()
    const state = mergeEngineState(root, settings)
    await getOrInitEmbeddingProvider(root)
    const cache = getOrCreateEngineCache(root, snap)
    const { store, epStore, kg, retriever } = cache
    const recentUserMsgs = (args.recentMessages ?? [])
      .filter((m) => m.role === 'user')
      .map((m) => m.content)

    const sessionId = args.sessionId ?? 'default'
    const desktopAgentSessionActive = isDesktopAgentSessionActive(
      settings,
      args.desktopAgentChatMode === true
    )
    const extCoordinator = getExtensionsCoordinator()
    const memoryMeta = buildMemoryMetaFromFacts(
      store.listActive(),
      sessionId,
      kg.listAll().length,
      epStore.listAll().length
    )
    const engineSnap = buildEngineSnapshot(state, settings, memoryMeta)
    extCoordinator?.updateSnapshot(engineSnap)

    let extensionInjections = desktopAgentSessionActive
      ? []
      : (extCoordinator?.getContextInjections(args.userText) ?? [])
    if (extCoordinator && isExtensionCapabilityListingQuery(args.userText)) {
      event.sender.send('chat:status', '鍦ㄧ炕鎵╁睍搴撯€?)
      const listingOptions = {
        settings,
        desktopAgentSection:
          desktopAgentSessionActive && isDesktopAgentSettingsReady(settings)
            ? buildDesktopAgentCatalogSection(settings)
            : undefined
      }
      extensionInjections = [
        ...extensionInjections,
        buildExtensionCatalogListingBlock(extCoordinator.getDispatchCatalog(sessionId), listingOptions)
      ]
    }
    let weatherPreInjection: string | null = null
    if (extCoordinator && !desktopAgentSessionActive) {
      if (isWeatherQuery(args.userText)) {
        event.sender.send('chat:status', skillToolActivityLabel('get_weather'))
      }
      weatherPreInjection = await preExecuteWeatherQuery(extCoordinator, args.userText)
    }
    let extensionEmotionHints = extCoordinator?.getAggregatedEmotionHints()

    await ensureFactEmbeddingsReady(cache)
    const preparedTurn = await prepareTurnContext({
      msg: args.userText,
      state,
      factStore: store,
      retriever,
      sessionId,
      turnIndex: args.turnIndex ?? 0,
      memoryBudgetChars: settings.memoryBudgetChars,
      recentUserMessages: recentUserMsgs,
      dataRoot: root,
      index: snap,
      adultMode: settings.adultContentMode && settings.ageConfirmed18,
    })
    const retrievedMemoryBlock = preparedTurn.retrieval.tierBBlock.slice(0, 1200)

    const auditIntent =
      !args.dispatchRespond && !detectPlanDocumentIntent(args.userText, args.recentMessages)
        ? detectMemoryAuditIntent(args.userText, args.recentMessages)
        : null

    if (auditIntent) {
      event.sender.send('chat:status', '鍦ㄦ暣鐞嗚蹇嗘。妗堚€?)
      const preAudit = await runPreLlmTurn({
        msg: args.userText,
        prev: state,
        factStore: store,
        retriever,
        sessionId,
        dataRoot: root,
        turnIndex: args.turnIndex ?? 0,
        memoryBudgetChars: settings.memoryBudgetChars,
        ultralite: true,
        preparedTurn,
      })
      const { intro, pre } = executeMemoryAuditTurn({
        dataRoot: root,
        factStore: store,
        episodicStore: epStore,
        intent: auditIntent,
        pre: preAudit,
        webContents: event.sender,
      })
      saveState(root, pre.newState, currentSessionId())
      const turnId = randomUUID()
      await finalizeSkipTurn({
        turnId,
        root,
        sessionId,
        turnIndex: args.turnIndex ?? 0,
        userMsg: args.userText,
        assistantText: intro,
        pre,
        settings,
        skipIngest: true,
      })
      return {
        skipLlm: true,
        redlineReply: intro,
        tracePreview: pre.trace,
        turnId,
        messages: [],
        memoryFinalized: true,
      }
    }

    let dispatchResult: DispatchResult | undefined
    let extraDispatchInjections: string[] = []
    let resolvedMessageForKnowledge: string | undefined
    let dispatchMs = 0
    let preFromParallel: PreLlmResult | undefined
    let surfaceInvokeResult: { message: string; opened: boolean } | undefined

    if (args.dispatchRespond && !args.dispatchRespond.accepted) {
      rejectDispatchExtension(sessionId, args.dispatchRespond.extensionId, {
        dataRoot: root,
        remember: args.dispatchRespond.remember
      })
    }

    if (args.dispatchRespond?.accepted && extCoordinator) {
      acceptDispatchExtension(root, args.dispatchRespond.extensionId, args.dispatchRespond.remember)
      const exec = await executeDispatchedExtension(
        extCoordinator,
        args.dispatchRespond.extensionId,
        args.userText,
        sessionId,
        engineSnap
      )
      if (exec.contextInjection) extraDispatchInjections.push(exec.contextInjection)
    }

    if (extCoordinator && !args.dispatchRespond?.accepted && !desktopAgentSessionActive) {
      const llm = createLlmJsonClient(settings)
      const tDispatch = Date.now()
      const preBaseArgs = {
        msg: args.userText,
        prev: state,
        factStore: store,
        retriever,
        sessionId,
        dataRoot: root,
        turnIndex: args.turnIndex ?? 0,
        memoryBudgetChars: settings.memoryBudgetChars,
        adultMode: settings.adultContentMode && settings.ageConfirmed18,
        recentUserMessages: recentUserMsgs,
        recentMessages: args.recentMessages,
        extensionEmotionHints,
        preparedTurn,
      }
      const [piped, prePartial] = await Promise.all([
        runDispatchPipeline({
          userText: args.userText,
          sessionId,
          settings,
          state,
          recentMessages: args.recentMessages,
          retrievedMemoryBlock,
          coordinator: extCoordinator,
          snapshot: engineSnap,
          llm,
          queryEmbed: preparedTurn.queryEmbed,
          skipAskForExtensionId:
            args.dispatchRespond?.accepted === false ? args.dispatchRespond.extensionId : undefined,
        }),
        runPreLlmTurn({ ...preBaseArgs, dispatchResult: undefined }),
      ])
      dispatchMs = Date.now() - tDispatch
      dispatchResult = piped.dispatchResult
      preFromParallel = prePartial
      extraDispatchInjections.push(...piped.extraInjections)
      surfaceInvokeResult = piped.surfaceInvokeResult
      if (piped.resolvedMessage) resolvedMessageForKnowledge = piped.resolvedMessage
      if (piped.emotionHintDelta) {
        const h = piped.emotionHintDelta
        extensionEmotionHints = {
          affDelta: (extensionEmotionHints?.affDelta ?? 0) + (h.affDelta ?? 0),
          secDelta: (extensionEmotionHints?.secDelta ?? 0) + (h.secDelta ?? 0),
          aroDelta: (extensionEmotionHints?.aroDelta ?? 0) + (h.aroDelta ?? 0),
          domDelta: (extensionEmotionHints?.domDelta ?? 0) + (h.domDelta ?? 0)
        }
      }
    } else if (extCoordinator && args.dispatchRespond?.accepted) {
      dispatchResult = {
        decision: 'auto_invoke',
        extensionId: args.dispatchRespond.extensionId,
        confidence: 1,
        reasoning: 'user_confirmed_ask'
      }
    }

    if (dispatchResult?.decision === 'evolve' && dispatchResult.extensionId && extCoordinator && !args.dispatchRespond) {
      const preEvolve = preFromParallel ?? await runPreLlmTurn({
        msg: args.userText,
        prev: state,
        factStore: store,
        retriever,
        sessionId,
        dataRoot: root,
        turnIndex: args.turnIndex ?? 0,
        memoryBudgetChars: settings.memoryBudgetChars,
        adultMode: settings.adultContentMode && settings.ageConfirmed18,
        recentUserMessages: recentUserMsgs,
        recentMessages: args.recentMessages,
        dispatchResult,
        preparedTurn,
      })
      saveState(root, preEvolve.newState, currentSessionId())
      event.sender.send('chat:status', '姝ｅ湪浼樺寲鎵╁睍鈥?)
      const evolved = await executeEvolveExtension(
        extCoordinator,
        dispatchResult.extensionId,
        args.userText,
        settings
      )
      const turnId = randomUUID()
      await finalizeSkipTurn({
        turnId,
        root,
        sessionId,
        turnIndex: args.turnIndex ?? 0,
        userMsg: args.userText,
        assistantText: evolved.message,
        pre: preEvolve,
        settings,
      })
      return {
        skipLlm: true,
        redlineReply: evolved.message,
        tracePreview: preEvolve.trace,
        turnId,
        messages: [],
        memoryFinalized: true,
      }
    }

    if (
      dispatchResult?.decision === 'invoke_surface' &&
      dispatchResult.surfaceInvoke?.skipMainChatLlm &&
      dispatchResult.extensionId &&
      extCoordinator &&
      !args.dispatchRespond
    ) {
      const preSurface = preFromParallel
        ? applyDispatchToPre(preFromParallel, dispatchResult)
        : await runPreLlmTurn({
            msg: args.userText,
            prev: state,
            factStore: store,
            retriever,
            sessionId,
            dataRoot: root,
            turnIndex: args.turnIndex ?? 0,
            memoryBudgetChars: settings.memoryBudgetChars,
            adultMode: settings.adultContentMode && settings.ageConfirmed18,
            recentUserMessages: recentUserMsgs,
            recentMessages: args.recentMessages,
            dispatchResult,
            preparedTurn
          })
      saveState(root, preSurface.newState, currentSessionId())
      const reply =
        surfaceInvokeResult?.message ??
        executeOpenExtensionSurface(extCoordinator, dispatchResult.extensionId).message
      const turnId = randomUUID()
      await finalizeSkipTurn({
        turnId,
        root,
        sessionId,
        turnIndex: args.turnIndex ?? 0,
        userMsg: args.userText,
        assistantText: reply,
        pre: preSurface,
        settings
      })
      return {
        skipLlm: true,
        redlineReply: reply,
        tracePreview: preSurface.trace,
        turnId,
        messages: [],
        memoryFinalized: true
      }
    }

    if (
      dispatchResult?.decision === 'open_surface' &&
      dispatchResult.extensionId &&
      extCoordinator &&
      !args.dispatchRespond
    ) {
      const preSurface = preFromParallel
        ? applyDispatchToPre(preFromParallel, dispatchResult)
        : await runPreLlmTurn({
        msg: args.userText,
        prev: state,
        factStore: store,
        retriever,
        sessionId,
        dataRoot: root,
        turnIndex: args.turnIndex ?? 0,
        memoryBudgetChars: settings.memoryBudgetChars,
        adultMode: settings.adultContentMode && settings.ageConfirmed18,
        recentUserMessages: recentUserMsgs,
        recentMessages: args.recentMessages,
        dispatchResult,
        preparedTurn,
      })
      saveState(root, preSurface.newState, currentSessionId())
      const opened = executeOpenExtensionSurface(extCoordinator, dispatchResult.extensionId)
      const turnId = randomUUID()
      await finalizeSkipTurn({
        turnId,
        root,
        sessionId,
        turnIndex: args.turnIndex ?? 0,
        userMsg: args.userText,
        assistantText: opened.message,
        pre: preSurface,
        settings,
      })
      return {
        skipLlm: true,
        redlineReply: opened.message,
        tracePreview: preSurface.trace,
        turnId,
        messages: [],
        memoryFinalized: true,
      }
    }

    if (dispatchResult?.decision === 'ask_plan' && !args.dispatchRespond) {
      const preAsk = preFromParallel
        ? applyDispatchToPre(preFromParallel, dispatchResult)
        : await runPreLlmTurn({
        msg: args.userText,
        prev: state,
        factStore: store,
        retriever,
        sessionId,
        dataRoot: root,
        turnIndex: args.turnIndex ?? 0,
        memoryBudgetChars: settings.memoryBudgetChars,
        adultMode: settings.adultContentMode && settings.ageConfirmed18,
        recentUserMessages: recentUserMsgs,
        recentMessages: args.recentMessages,
        dispatchResult,
        preparedTurn,
      })
      saveState(root, preAsk.newState, currentSessionId())
      const templateAsk = dispatchResult.askMessage ?? '瑕佷笉瑕佹垜甯綘鍋氫竴涓?Skill 鎴栨彃浠讹紵'
      event.sender.send('chat:status', '鍦ㄦ兂鎬庝箞寮€鍙ｂ€?)
      const llm = createLlmJsonClient(settings)
      const crafted = await craftPlanCreateAsk({
        settings,
        state: preAsk.newState,
        userText: args.userText,
        templateAsk,
        planTopic: dispatchResult.planTopic,
        llm
      })
      return {
        skipLlm: true,
        planCreatePending: {
          askMessage: crafted.askMessage,
          planTopic: dispatchResult.planTopic,
          emotionLabel: crafted.emotionLabel
        },
        tracePreview: preAsk.trace,
        turnId: randomUUID(),
        messages: []
      }
    }

    if (
      dispatchResult?.decision === 'ask_invoke' &&
      dispatchResult.extensionId &&
      !args.dispatchRespond
    ) {
      const entry = extCoordinator!.getDispatchCatalog(sessionId).find(
        (e) => e.id === dispatchResult!.extensionId
      )
      const preAsk = preFromParallel
        ? applyDispatchToPre(preFromParallel, dispatchResult)
        : await runPreLlmTurn({
        msg: args.userText,
        prev: state,
        factStore: store,
        retriever,
        sessionId,
        dataRoot: root,
        turnIndex: args.turnIndex ?? 0,
        memoryBudgetChars: settings.memoryBudgetChars,
        adultMode: settings.adultContentMode && settings.ageConfirmed18,
        recentUserMessages: recentUserMsgs,
        recentMessages: args.recentMessages,
        dispatchResult,
        preparedTurn,
      })
      saveState(root, preAsk.newState, currentSessionId())
      return {
        skipLlm: true,
        dispatchPending: {
          extensionId: dispatchResult.extensionId,
          extensionName: entry?.name ?? dispatchResult.extensionId,
          askMessage:
            dispatchResult.askMessage ?? `瑕佷笉瑕佸惎鐢ㄣ€?{entry?.name ?? '鎵╁睍'}銆嶏紵`
        },
        tracePreview: preAsk.trace,
        turnId: randomUUID(),
        messages: []
      }
    }

    const dispatchCatalogEntry =
      dispatchResult?.extensionId && extCoordinator
        ? extCoordinator.getDispatchCatalog(sessionId).find((e) => e.id === dispatchResult.extensionId)
        : undefined
    const mergedInjections = mergeExtensionContextInjections({
      coordinatorInjections: extensionInjections,
      weatherPreInjection,
      dispatchInjections: extraDispatchInjections,
      dispatchResult,
      dispatchCatalogEntry
    })

    if (dispatchResult?.emotionHint && !extCoordinator) {
      const h = dispatchResult.emotionHint
      extensionEmotionHints = {
        affDelta: (extensionEmotionHints?.affDelta ?? 0) + (h.affDelta ?? 0),
        secDelta: (extensionEmotionHints?.secDelta ?? 0) + (h.secDelta ?? 0),
        aroDelta: (extensionEmotionHints?.aroDelta ?? 0) + (h.aroDelta ?? 0),
        domDelta: (extensionEmotionHints?.domDelta ?? 0) + (h.domDelta ?? 0)
      }
    }

    const pre = preFromParallel
      ? applyDispatchToPre(preFromParallel, dispatchResult)
      : await runPreLlmTurn({
      msg: args.userText,
      prev: state,
      factStore: store,
      retriever,
      sessionId,
      dataRoot: root,
      turnIndex: args.turnIndex ?? 0,
      memoryBudgetChars: settings.memoryBudgetChars,
      adultMode: settings.adultContentMode && settings.ageConfirmed18,
      recentUserMessages: recentUserMsgs,
      recentMessages: args.recentMessages,
      extensionEmotionHints,
      dispatchResult,
      preparedTurn,
    })

    if (dispatchMs > 0 && pre.trace.ms) {
      pre.trace.ms = { ...pre.trace.ms, dispatch: dispatchMs }
    }

    // 涓诲姩绛栫暐 Loop锛氱紦瀛?intensityMod锛屼緵 chat:start 娉ㄥ叆 LLM 娓╁害
    lastIntensityMod = pre.intensityMod ?? 1.0

    extCoordinator?.drainAllEvents()
    const postTurnSnapshot = buildEngineSnapshot(pre.newState, settings, memoryMeta)
    extCoordinator?.updateSnapshot(postTurnSnapshot)
    void import('../extensions/skills/builtin/engine_event/mood-diary-detail/skill.js').then(
      ({ maybeTriggerMoodDiaryAfterTurn }) =>
        maybeTriggerMoodDiaryAfterTurn({
          prevEmotion: state.emotion,
          nextEmotion: pre.newState.emotion,
          turnHint: args.userText,
          snapshot: postTurnSnapshot
        })
    )
    void import('../extensions/skills/builtin/engine_event/growth-unlock/skill.js').then(
      ({ maybeTriggerGrowthUnlockAfterTurn }) =>
        maybeTriggerGrowthUnlockAfterTurn({
          prevTrust: state.relationship.trust,
          nextTrust: pre.newState.relationship.trust,
          snapshot: postTurnSnapshot
        })
    )
    workingMemory.push(args.sessionId ?? 'default', {
      turnIndex: args.turnIndex ?? 0,
      userText: args.userText,
      assistantText: ''
    })

    const turnId = randomUUID()

    const userTaskFrame = await resolveUserTaskFrame(settings, args.userText)
    const taskFrameSystemHint = buildTaskFrameSystemHint(userTaskFrame)
    const honesty = resolveDispatchHonestyGuard({
      userText: args.userText,
      dispatchResult
    })
    // 鍚嶅瓧涓诲姩璇㈤棶锛歋TRANGER闃舵 鈮?杞?|| FAMILIAR闃舵 鈫?鎻愮ずLLM闂悕瀛?
    const askNameStage = state.relationship.stage
    const askNameTurnOk = askNameStage === 'FAMILIAR' || (askNameStage === 'STRANGER' && (args.turnIndex ?? 0) >= 3)
    const askNameHint =
      askNameTurnOk && shouldAskUserName(store)
        ? `\n銆愰噸瑕佹彁绀恒€戜綘杩樹笉鐭ラ亾鐢ㄦ埛鐨勫悕瀛椼€傝鐢ㄤ綘鐨勪汉鏍奸鏍艰嚜鐒跺湴璇㈤棶ta鍙粈涔堛€備笉瑕佺洿鎺ヨ"璇峰憡璇夋垜浣犵殑鍚嶅瓧"鈥斺€旂敤浣犺嚜宸辩殑璇磋瘽鏂瑰紡銆俙
        : undefined

    const desktopAgentHintBase =
      args.desktopAgentChatMode && isDesktopAgentSettingsReady(settings)
        ? `\n${buildDesktopAgentModeSystemHint(settings)}`
        : undefined

    let desktopAgentCapability: DesktopAgentCapabilityMatch | undefined
    if (desktopAgentSessionActive && preparedTurn.queryEmbed?.length) {
      const provider = getCachedEmbeddingProvider(root)
      desktopAgentCapability =
        (await resolveDesktopAgentCapability({
          dataRoot: root,
          userText: args.userText,
          queryEmbed: preparedTurn.queryEmbed,
          settings,
          provider
        })) ?? undefined
      if (desktopAgentCapability) {
        log.info('desktop-agent.capability', {
          id: desktopAgentCapability.capabilityId,
          handler: desktopAgentCapability.handler,
          score: desktopAgentCapability.score,
          source: desktopAgentCapability.source
        })
      }
    }

    const desktopAgentRoutingHint = desktopAgentCapability
      ? `\n${buildCapabilityRoutingSystemHint(desktopAgentCapability)}`
      : undefined

    const desktopAgentHint = [desktopAgentHintBase, desktopAgentRoutingHint].filter(Boolean).join('\n') || undefined

    const mergedSystemHint =
      [args.systemHint, desktopAgentHint, taskFrameSystemHint, honesty.systemHint, askNameHint].filter(Boolean).join('\n\n') ||
      undefined

    const userInfoBlock = buildUserInfoBlock(root, store)

    if (pre.skipLlm) {
      saveState(root, pre.newState, currentSessionId())
      const dispatchTriggered =
        resolveDispatchTriggerStatus(dispatchResult, dispatchCatalogEntry) ??
        consumeExtensionTriggerTurn()
      const redline = pre.redlineReply ?? ''
      if (redline) {
        await finalizeSkipTurn({
          turnId,
          root,
          sessionId,
          turnIndex: args.turnIndex ?? 0,
          userMsg: args.userText,
          assistantText: redline,
          pre,
          settings,
        })
      }
      return {
        messages: assembleMessages({
          userText: args.userText,
          explicitRel: args.explicitRel,
          recentMessages: args.recentMessages,
          index: snap,
          settings,
          psycheBlock: pre.psycheBlock,
          tierBBlock: '',
          systemHint: mergedSystemHint,
          extensionInjections: mergedInjections.length > 0 ? mergedInjections : undefined,
          userInfoBlock
        }),
        skipLlm: true,
        redlineReply: pre.redlineReply,
        enterPlanMode: pre.enterPlanMode,
        planTopic: pre.planTopic,
        dispatchAskMessage: pre.dispatchAskMessage,
        tracePreview: pre.trace,
        turnId,
        userTaskFrame,
        dispatchBypassed: honesty.dispatchBypassed,
        dispatchTriggered,
        memoryFinalized: Boolean(redline),
      }
    }

    const knowledgeResolved = desktopAgentSessionActive
      ? { userTextForLlm: args.userText.trim() }
      : extCoordinator!.resolveKnowledgeContextBuild({
          sessionId: args.sessionId ?? 'default',
          userText: resolvedMessageForKnowledge ?? args.userText,
          recentMessages: args.recentMessages,
          workIntent: pre.workIntent
        })

    let finalState = pre.newState
    if (knowledgeResolved.knowledgeTopic) {
      finalState = {
        ...finalState,
        desireStack: settleDesiresForKnowledgeTopic(
          finalState.desireStack,
          knowledgeResolved.knowledgeTopic
        )
      }
    }

    saveState(root, finalState, currentSessionId())

    setPendingTurn(turnId, {
      dataRoot: root,
      sessionId: args.sessionId ?? 'default',
      turnIndex: args.turnIndex ?? 0,
      userMsg: args.userText,
      newState: finalState,
      skipIngest: shouldSkipTierBIngestForOrigin(pre.trace),
      trace: pre.trace,
      event: pre.event
    })

    const messages = assembleMessages({
      userText: knowledgeResolved.userTextForLlm,
      explicitRel: args.explicitRel,
      recentMessages: args.recentMessages,
      index: snap,
      settings,
      psycheBlock: pre.psycheBlock,
      tierBBlock: pre.tierBBlock,
      systemHint: mergedSystemHint,
      extensionInjections: mergedInjections.length > 0 ? mergedInjections : undefined,
      userInfoBlock
    })
    const knowledgeTopic = knowledgeResolved.knowledgeTopic
    let planDocumentTopic: string | undefined
    if (!knowledgeTopic && !desktopAgentSessionActive) {
      const planHit = detectPlanDocumentIntent(args.userText, args.recentMessages)
      if (planHit) planDocumentTopic = planHit.topic
    }

    const workIntentForRouting = desktopAgentSessionActive
      ? applyDesktopAgentModeToWorkIntent(pre.workIntent, true)
      : pre.workIntent
    const forcedWebSearchQueryRaw = planDocumentTopic
      ? undefined
      : resolveForcedWebSearchQuery(workIntentForRouting)
    const forcedWebSearchQuery = shouldForceWebSearchInDesktopAgentSession(
      desktopAgentSessionActive,
      forcedWebSearchQueryRaw ? enrichQueryForRecency(forcedWebSearchQueryRaw) : undefined
    )
    const dispatchTriggered =
      resolveDispatchTriggerStatus(dispatchResult, dispatchCatalogEntry) ??
      consumeExtensionTriggerTurn()

    const locale = settings.locale === 'en' ? 'en' : 'zh'
    const waveSkipInput = {
      asyncMultiMessageEnabled: settings.asyncMultiMessageEnabled,
      knowledgeTopic,
      planDocumentTopic,
      forcedWebSearchQuery,
      dispatchDecision: dispatchResult?.decision,
      enterPlanMode: pre.enterPlanMode,
      skipLlm: false,
      requiresToolTurn: requiresToolTurn(userTaskFrame),
    }
    const useWaveChat = shouldUseWaveChat(waveSkipInput)
    let wavePlan: WavePlan | undefined
    let waveContext: WaveBuildContext | undefined

    if (useWaveChat && pre.rhythmDecision) {
      wavePlan = buildWavePlan(pre.rhythmDecision, locale, {
        emotion: {
          aro: finalState.emotion.aro,
          aff: finalState.emotion.aff,
          intensity: pre.trace.l0?.intensity,
          sincerity: pre.trace.l0?.sincerity,
        },
      })
      waveContext = {
        userText: knowledgeResolved.userTextForLlm,
        explicitRel: args.explicitRel,
        recentMessages: args.recentMessages ?? [],
        index: snap,
        settings,
        psycheBlock: pre.psycheBlock,
        systemHint: mergedSystemHint,
        extensionInjections: mergedInjections.length > 0 ? mergedInjections : undefined,
        userInfoBlock,
      }
      startDeferredEnrich({
        turnId,
        msg: args.userText,
        sessionId: args.sessionId ?? 'default',
        turnIndex: args.turnIndex ?? 0,
        memoryBudgetChars: settings.memoryBudgetChars,
        state: finalState,
        factStore: store,
        retriever,
        dataRoot: root,
        adultMode: settings.adultContentMode && settings.ageConfirmed18,
      })
    }

    return {
      messages,
      skipLlm: false,
      turnId,
      tracePreview: pre.trace,
      knowledgeTopic,
      suggestedSearchQuery: knowledgeTopic,
      forcedWebSearchQuery,
      userTaskFrame,
      planDocumentTopic,
      dispatchBypassed: honesty.dispatchBypassed,
      dispatchTriggered,
      useWaveChat: useWaveChat && Boolean(wavePlan && waveContext),
      wavePlan,
      waveContext,
      desktopAgentCapability,
      queryEmbed: preparedTurn.queryEmbed
    }
  })

  ipcMain.handle('settings:probeLocalChat', async (_e, patch?: Partial<import('../settings').AppSettings>) => {
    const settings = { ...loadSettings(), ...(patch ?? {}) }
    return probeLocalChat(settings)
  })

  ipcMain.handle('chat:start', async (event, payload: Record<string, unknown>) => {
    if (!isEmbeddingReadyForChat()) {
      event.sender.send('chat:error', 'EMBEDDING_WARMING')
      return
    }
    const wc = event.sender
    const root = currentDataRoot()
    const sessionId =
      typeof payload.sessionId === 'string' ? payload.sessionId : currentSessionId()
    recordDesktopAckemActivity(root)
    if (lastIntensityMod !== 1.0) {
      payload.intensityMod = lastIntensityMod
    }
    markChatStreamStart(sessionId)
    try {
      await streamChatCompletion(wc, payload, root)
    } finally {
      markChatStreamEnd(sessionId)
    }
  })

  ipcMain.handle('chat:loadHistory', () => {
    const root = currentDataRoot()
    const sid = currentSessionId()
    const fromDb = loadChatHistoryFromDb(root, sid)
    if (fromDb.length > 0) return fromDb
    const file = join(root, 'companion', `chat-history-${sid}.json`)
    if (!existsSync(file)) return []
    try {
      const rows = JSON.parse(readFileSync(file, 'utf-8')) as unknown[]
      if (Array.isArray(rows) && rows.length > 0) {
        saveChatHistoryToDb(root, sid, rows)
      }
      return Array.isArray(rows) ? rows : []
    } catch {
      return []
    }
  })

  ipcMain.handle('chat:saveHistory', (_e, rows: unknown[]) => {
    const root = currentDataRoot()
    const dir = join(root, 'companion')
    const sid = currentSessionId()
    mkdirSync(dir, { recursive: true })
    const trimmed = rows.slice(-2000)
    writeFileSync(join(dir, `chat-history-${sid}.json`), JSON.stringify(trimmed), 'utf-8')
    saveChatHistoryToDb(root, sid, trimmed)
  })

  ipcMain.handle('state:get', () => {
    const s = loadSettings()
    const root = resolveDataRoot(s)
    ensureDataLayout(root)
    const st = mergeEngineState(root, s)
    const gapHours = (Date.now() - new Date(st.lastActive).getTime()) / 3600000
    const shock =
      gapHours >= 1 ? { gapHours: Math.round(gapHours), active: true } : { active: false }
    return { ...st, _reunion: shock }
  })

  ipcMain.handle('state:reset', () => {
    const s = loadSettings()
    const root = resolveDataRoot(s)
    ensureDataLayout(root)
    const next = defaultFullState(defaultPersonalitySlice(s))
    saveState(root, next, currentSessionId())
    return next
  })

  ipcMain.handle('trace:latest', (_e, n = 50) => traceLatest(Number(n) || 50))

  ipcMain.handle('desire:list', () => {
    const s = loadSettings()
    const root = resolveDataRoot(s)
    const state = mergeEngineState(root, s)
    return state.desireStack
  })

  ipcMain.handle('desire:dismiss', (_e, desireId: string) => {
    const s = loadSettings()
    const root = resolveDataRoot(s)
    const state = mergeEngineState(root, s)
    state.desireStack = dismissDesireFromStack(state.desireStack, desireId)
    saveState(root, state, currentSessionId())
    return state.desireStack
  })

  ipcMain.handle('desire:clearActive', () => {
    const s = loadSettings()
    const root = resolveDataRoot(s)
    const state = mergeEngineState(root, s)
    state.desireStack = clearActiveDesires(state.desireStack)
    saveState(root, state, currentSessionId())
    return state.desireStack
  })

  // 鈹€鈹€ Agnes 鏂囩敓鍥?鈹€鈹€
  ipcMain.handle('agnes:generateImage', async (_e, args: { prompt: string }) => {
    const { generateAgnesImage } = await import('../agnesImage.js')
    const s = loadSettings()
    const root = resolveDataRoot(s)
    ensureDataLayout(root)
    const result = await generateAgnesImage({ prompt: args.prompt, settings: s, dataRoot: root })
    // 灏嗘湰鍦版枃浠惰矾寰勮浆涓?Ackem-img:// 鍗忚 URL锛堟覆鏌撹繘绋嬪畨鍏ㄥ姞杞斤級
    if (result.imagePath) {
      const rel = result.imagePath.replace(root, '').replace(/^\\?\//, '').replace(/\\/g, '/')
      result.imageUrl = `Ackem-img://${rel}`
      delete result.imagePath
    }
    return result
  })

  ipcMain.handle('agnes:detectIntent', async (_e, args: { text: string }) => {
    const { detectImageIntent } = await import('../agnesImage.js')
    return detectImageIntent(args.text)
  })
}

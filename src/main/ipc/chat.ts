// [ipc/chat] — 对话上下文构建、流式聊天、引擎状态、欲望栈、Trace

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { assembleMessages, mergeExtensionContextInjections } from '../context'
import { assembleSocialMemberMessages } from '../context/promptAssembly'
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
import { STATE_JSON_VERSION } from '../engine/ackemParams'
import { prepareTurnContext } from '../engine/prepareTurnContext'
import type { DispatchResult } from '../extensions/protocols'

/** 主动策略 Loop：缓存最近一轮的 intensityMod，供 chat:start 注入 */
let lastIntensityMod = 1.0
import { catalogRevisionOf, toCatalogEntry } from '../channel/matchCatalog'
import { followPinnedWork } from '../channel/executeChannel'
import { runMemoryAuditShortcutTurn } from '../chat/memoryAuditShortcut'
import { surfaceVerdictLedgerFailure } from '../chat/routeVerdict'
import {
  startSpeculative,
  adoptSpeculative,
  cutSpeculative,
  cutNotificationPayload,
  speculativeEnabled
} from '../chat/speculativeManager'
import { createPersistentProvisionalProjection } from '../chat/companionStream'
import { explainRouteVerdictForTurn } from '../chat/routeKpi'
import { interpretInput } from '../engine/interpreter'
import { resolveDispatchHonestyGuard } from '../extensions/dispatch/dispatchHonestyGuard'
import {
  buildExtensionCatalogListingBlock,
  isExtensionCapabilityListingQuery
} from '../extensions/dispatch/extensionCapabilityListing'
import { resolveDispatchTriggerStatus } from '../../shared/dispatchTrigger'
import {
  clearExtensionTriggerTurn,
  consumeExtensionTriggerTurn
} from '../extensionTriggerBus'
import { detectPlanDocumentIntent } from '../planDocument/intent'
import { detectMemoryAuditIntent } from '../../shared/memoryAuditIntent'
import { resolveUserTaskFrame, buildTaskFrameSystemHint } from '../taskFrame'
import { loadUnifiedChatRows } from '../chat/unifiedChatHistory'
import { saveChatHistoryToDb } from '../db/repos/chatHistory'
import { touchProactiveUserActivity } from '../companion/proactiveScheduler'
import { engineSessionId } from '../session/canonical'
import { saveState, defaultFullState, loadState } from '../engine/state-persistence'
import { traceLatest } from '../engine/tracer'
import { workingMemory } from '../memory/workingMemory'
import { getOrCreateEngineCache, getOrInitEmbeddingProvider, ensureFactEmbeddingsReady } from '../engineCache'
import { isEmbeddingReadyForChat } from '../embedding/embeddingReadiness'
import { buildEngineSnapshot, buildMemoryMetaFromFacts } from '../extensions/snapshot'
import { buildUserInfoBlock } from '../memory/userDossier'
import { shouldAskUserName, getAskNamePrompt } from '../memory/userName'
import { setPendingTurn } from '../turnPending'
import { beginChatTurn } from '../chat/turnCoordinator'
import { orchestrateChannelTurn } from '../chat/orchestrateChannelTurn'
import { completeMemoryAuditShortcut } from '../chat/memoryAuditShortcut'
import { isDesktopAgentToolingActive } from '../../shared/desktopAgent'
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
import { isSocialMember } from '../social/agents/guards'
import { PRIMARY_AGENT_ID, sessionIdForAgent } from '../social/agents/agentPaths'
import { withAgentContext } from '../social/agents/withAgentContext'
import { getRegisteredAgent } from '../social/agents/agentRegistry'
import {
  channelToInteractionSurface,
  isInteractionSurface,
  type InteractionSurface
} from '../memory/provenance'
import type { AgentRow } from '../db/repos/agentsRepo'
import type { FullState } from '../engine/types'

const log = createLogger('ipc-chat')

function resolveInteractionSurface(
  raw: unknown,
  channel: 'desktop' | 'weixin' = 'desktop',
  targetAgentId?: string
): InteractionSurface {
  return channelToInteractionSurface(
    channel,
    typeof raw === 'string' && isInteractionSurface(raw) ? raw : undefined,
    targetAgentId
  )
}

function resolveTargetAgentId(id?: string): string {
  const t = id?.trim()
  return t && t.length > 0 ? t : PRIMARY_AGENT_ID
}

function mergeSocialMemberState(
  root: string,
  settings: ReturnType<typeof loadSettings>,
  row: AgentRow
): FullState {
  const sessionId = sessionIdForAgent(row.id)
  const pers = defaultPersonalitySlice({
    companionGender: row.gender,
    personalityPresetId: row.preset_id,
  })
  const loaded = loadState(root, sessionId)
  if (!loaded) return defaultFullState(pers)
  const s = { ...loaded }
  if (!s.counters) s.counters = { totalTurns: 0, sharedEventsCount: 0, consecutiveMeaningfulTurns: 0 }
  s.personality = pers
  s.personalityBaseline = { T: pers.T, I: pers.I, S: pers.S, O: pers.O, R: pers.R }
  if (!s.userProfile) {
    s.userProfile = defaultFullState(pers).userProfile
  }
  if (!s.externalAtmosphere) {
    s.externalAtmosphere = { level: 0, label: 'neutral' }
  }
  if (!s.desireStack) {
    s.desireStack = { slots: [null, null, null, null, null] }
  }
  if (!s.offlineThoughts) {
    s.offlineThoughts = []
  }
  if (s.version !== STATE_JSON_VERSION) s.version = STATE_JSON_VERSION
  void settings
  void sessionId
  return s
}

async function buildSocialMemberContext(
  event: IpcMainInvokeEvent,
  args: ContextBuildInvoke,
  targetAgentId: string,
  settings: ReturnType<typeof loadSettings>,
  root: string
) {
  const agentRow = getRegisteredAgent(root, targetAgentId)
  if (!agentRow) {
    throw Object.assign(new Error('AGENT_NOT_FOUND'), { code: 'AGENT_NOT_FOUND' })
  }
  const sessionId = sessionIdForAgent(targetAgentId)
  const chatTurn = beginChatTurn({
    dataRoot: root,
    sessionId,
    userText: args.userText,
    surface: 'desktop',
    timezoneOverride: null,
  })
  const turnId = chatTurn.turnId
  activeRecall.setPersistencePath(join(root, 'agents', targetAgentId, 'recall-history.json'))
  const snap = getOrRebuildIndex()
  const state = mergeSocialMemberState(root, settings, agentRow)
  await getOrInitEmbeddingProvider(root)
  const cache = getOrCreateEngineCache(root, snap)
  const { store, retriever } = cache
  const recentUserMsgs = (args.recentMessages ?? [])
    .filter((m) => m.role === 'user')
    .map((m) => m.content)

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

  const pre = await runPreLlmTurn({
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
    preparedTurn,
  })

  lastIntensityMod = pre.intensityMod ?? 1.0
  workingMemory.push(sessionId, {
    turnIndex: args.turnIndex ?? 0,
    userText: args.userText,
    assistantText: '',
  })

  if (pre.skipLlm) {
    saveState(root, pre.newState, sessionId)
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
        prevState: state,
        settings,
      })
    }
    return {
      messages: assembleSocialMemberMessages({
        agentId: targetAgentId,
        displayName: agentRow.name,
        psycheBlock: pre.psycheBlock,
        tierBBlock: '',
        recentMessages: args.recentMessages ?? [],
        userText: args.userText,
        settings,
      }),
      skipLlm: true,
      redlineReply: pre.redlineReply,
      tracePreview: pre.trace,
      turnId,
      sessionId,
      memoryFinalized: Boolean(redline),
    }
  }

  saveState(root, pre.newState, sessionId)
  setPendingTurn(turnId, {
    dataRoot: root,
    sessionId,
    turnIndex: args.turnIndex ?? 0,
    userMsg: args.userText,
    newState: pre.newState,
    prevState: structuredClone(state),
    skipIngest: shouldSkipTierBIngestForOrigin(pre.trace),
    trace: pre.trace,
    event: pre.event,
    surface: 'desktop',
    interactionSurface: resolveInteractionSurface(
      args.interactionSurface,
      'desktop',
      targetAgentId
    ),
    ownerAgentId: targetAgentId,
  })

  const messages = assembleSocialMemberMessages({
    agentId: targetAgentId,
    displayName: agentRow.name,
    psycheBlock: pre.psycheBlock,
    tierBBlock: pre.tierBBlock,
    recentMessages: args.recentMessages ?? [],
    userText: args.userText,
    settings,
  })

  void event
  return {
    messages,
    skipLlm: false,
    turnId,
    tracePreview: pre.trace,
    sessionId,
  }
}

async function finalizeSkipTurn(args: {
  turnId: string
  root: string
  sessionId: string
  turnIndex: number
  userMsg: string
  assistantText: string
  pre: PreLlmResult
  prevState: import('../engine/types').FullState
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
    prevState: args.prevState,
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

/**
 * 阶段 1「判决可见」: 本轮判决的人话解释, 渲染层（上下文抽屉）直接消费。
 * 只读账本; 缺判决返回 null（错误计数在 KPI 侧, 不在这里重复上报）。
 */
function buildRouteExplain(dataRoot: string, turnId: string) {
  const exp = explainRouteVerdictForTurn(dataRoot, turnId)
  if (!exp?.found) return null
  return {
    found: true,
    finalChannel: exp.finalChannel,
    channelText: exp.channelText,
    summary: exp.summary,
    layers: exp.layers.map((l) => ({ layer: l.layer, ruleId: l.ruleId, ms: l.ms, text: l.text }))
  }
}

export function registerChatIpc(): void {
  ipcMain.handle('context:build', async (event, args: ContextBuildInvoke) => {
    if (!isEmbeddingReadyForChat()) {
      throw Object.assign(new Error('EMBEDDING_WARMING'), { code: 'EMBEDDING_WARMING' })
    }
    touchProactiveUserActivity()
    clearExtensionTriggerTurn()
    const settings = loadSettings()
    const root = resolveDataRoot(settings)
    ensureDataLayout(root)
    const targetAgentId = resolveTargetAgentId(args.targetAgentId)
    const interactionSurface = resolveInteractionSurface(
      args.interactionSurface,
      'desktop',
      targetAgentId
    )
    const { markChatInFlight, clearChatInFlight } = await import('../social/tick/chatInFlight.js')
    markChatInFlight(targetAgentId)
    try {
    if (isSocialMember(targetAgentId, root)) {
      return withAgentContext(
        targetAgentId,
        () => buildSocialMemberContext(event, args, targetAgentId, settings, root),
        { interactionSurface }
      )
    }
    return withAgentContext(
      PRIMARY_AGENT_ID,
      async () => {
    const sessionId = engineSessionId()
    const chatTurn = beginChatTurn({
      dataRoot: root,
      sessionId,
      userText: args.userText,
      surface: interactionSurface === 'weixin' ? 'weixin' : 'desktop',
      timezoneOverride: null,
    })
    activeRecall.setPersistencePath(join(root, 'memory', 'recall-history.json'))
    const snap = getOrRebuildIndex()
    const state = mergeEngineState(root, settings)
    await getOrInitEmbeddingProvider(root)
    const cache = getOrCreateEngineCache(root, snap)
    const { store, epStore, kg, retriever } = cache
    const recentUserMsgs = (args.recentMessages ?? [])
      .filter((m) => m.role === 'user')
      .map((m) => m.content)

    const extCoordinator = getExtensionsCoordinator()
    const memoryMeta = buildMemoryMetaFromFacts(
      store.listActive(),
      sessionId,
      kg.listAll().length,
      epStore.listAll().length
    )
    const engineSnap = buildEngineSnapshot(state, settings, memoryMeta)
    extCoordinator?.updateSnapshot(engineSnap)

    let extensionInjections = extCoordinator?.getContextInjections(args.userText) ?? []
    if (extCoordinator && isExtensionCapabilityListingQuery(args.userText)) {
      event.sender.send('chat:status', '在翻扩展库…')
      const listingOptions = {
        settings
      }
      extensionInjections = [
        ...extensionInjections,
        buildExtensionCatalogListingBlock(extCoordinator.getDispatchCatalog(sessionId), listingOptions)
      ]
    }
    let weatherPreInjection: string | null = null
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
    const desktopAgentSessionActive = isDesktopAgentToolingActive(
      settings,
      args.desktopAgentChatMode === true
    )

    const auditIntent = !detectPlanDocumentIntent(args.userText, args.recentMessages)
      ? detectMemoryAuditIntent(args.userText, args.recentMessages)
      : null

    if (auditIntent) {
      event.sender.send('chat:status', '在整理记忆档案…')
      // 整改 #2 二轮: the audit shortcut runs through the REAL seam function
      // (verdict BEFORE reply, inside chat/memoryAuditShortcut.ts).
      const { intro, pre, verdictDegraded } = await runMemoryAuditShortcutTurn({
        dataRoot: root,
        sessionId,
        saveSessionId: currentSessionId(),
        turnId: chatTurn.turnId,
        turnIndex: args.turnIndex ?? 0,
        userText: args.userText,
        auditIntent,
        state,
        store,
        epStore,
        retriever,
        preparedTurn,
        memoryBudgetChars: settings.memoryBudgetChars,
        settings,
        webContents: event.sender,
        notify: (status) => event.sender.send('chat:status', status),
      })
      void verdictDegraded
      return {
        skipLlm: true,
        redlineReply: intro,
        tracePreview: pre.trace,
        turnId: chatTurn.turnId,
        messages: [],
        memoryFinalized: true,
      }
    }

    let dispatchResult: DispatchResult | undefined
    let extraDispatchInjections: string[] = []
    let resolvedMessageForKnowledge: string | undefined
    let dispatchMs = 0
    let preFromParallel: PreLlmResult | undefined

    let catalogFailed = false
    let catalogEntries: ReturnType<typeof toCatalogEntry>[] = []
    try {
      catalogEntries = (extCoordinator?.getDispatchCatalog(sessionId) ?? [])
        .filter((e) => e.dispatch.mode === 'dispatched')
        .map(toCatalogEntry)
    } catch {
      catalogFailed = true
    }
    const revision = catalogRevisionOf(catalogEntries)
    const llm = createLlmJsonClient(settings)
    const redlineHit = interpretInput(
      args.userText,
      state.relationship.trust,
      Boolean(settings.adultContentMode && settings.ageConfirmed18)
    ).isExtremeRedline
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

    const phase = await orchestrateChannelTurn({
      turnConfirm: args.turnConfirm,
      userText: args.userText,
      recentMessages: args.recentMessages,
      dataRoot: root,
      sessionId,
      chatTurn,
      surface: interactionSurface === 'weixin' ? 'weixin' : 'desktop',
      revision,
      catalogEntries,
      catalogFailed,
      llm,
      redlineHit,
      preBaseArgs,
      extCoordinator,
      engineSnap,
      onResidual: () => event.sender.send('chat:status', '正在判断意图…'),
      onMilestone: (text) => event.sender.send('chat:status', text),
    })
    // 阶段 3-5 伴随流: 分类器等待期先行回应 (默认关; §17.3 门槛 6)。
    const speculativeOn = speculativeEnabled() && !args.turnConfirm
    if (speculativeOn) {
      startSpeculative({
        turnId: chatTurn.turnId,
        sessionId,
        userText: args.userText,
        wc: event.sender,
        runStream: async (systemPrompt, userText2, signal, onChunk) => {
          const llmSettings = settings
          const { buildLlmHeaders, resolveChatCompletionsUrl } = await import('../llmEndpoint')
          const res = await fetch(resolveChatCompletionsUrl(llmSettings), {
            method: 'POST',
            signal,
            headers: { 'content-type': 'application/json', ...buildLlmHeaders(llmSettings) },
            body: JSON.stringify({
              model: llmSettings.model,
              stream: true,
              max_tokens: 120,
              temperature: 0.7,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userText2 }
              ]
            })
          })
          if (!res.ok || !res.body) return
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buf = ''
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            buf += decoder.decode(value, { stream: true })
            const lines = buf.split('\n')
            buf = lines.pop() ?? ''
            for (const line of lines) {
              const m = line.match(/^data: (.+)$/)
              if (!m || m[1] === '[DONE]') continue
              try {
                const delta = JSON.parse(m[1])?.choices?.[0]?.delta?.content
                if (typeof delta === 'string' && delta) onChunk(delta)
              } catch {
                /* skip malformed chunk */
              }
            }
          }
        }
      })
    }
    dispatchResult = phase.dispatchResult
    extraDispatchInjections = phase.extraDispatchInjections
    resolvedMessageForKnowledge = phase.resolvedMessageForKnowledge
    dispatchMs = phase.dispatchMs
    preFromParallel = phase.preFromParallel
    if (phase.cardClosed && phase.channelPending && phase.preFromParallel) {
      // 阶段 3-5: confirm-card exit → CUT speculative text into the projection.
      if (speculativeOn) {
        const cutText = cutSpeculative(chatTurn.turnId)
        if (cutText && cutText.trim()) {
          createPersistentProvisionalProjection(root).append({
            turnId: chatTurn.turnId,
            sessionId,
            text: cutText,
            createdAt: new Date().toISOString(),
            supersededBy: 'confirm_card',
            ...(phase.channelPending.planId ? { planId: phase.channelPending.planId } : {})
          })
          const notify = cutNotificationPayload(chatTurn.turnId, cutText, phase.channelPending.planId)
          event.sender.send(notify.channel, notify.body)
        }
      }
      // 整改 #4 + Codex 小修: confirm-card exits surface verdict-ledger failure
      // exactly ONCE via the deterministic user status (memory-degradation
      // contract). The normal-exit call below is unreachable on this path.
      surfaceVerdictLedgerFailure(
        { failed: phase.verdictLedgerFailed },
        {
          pushInjection: () => {},
          sendStatus: (s) => event.sender.send('chat:status', s)
        }
      )
      return {
        skipLlm: true,
        channelPending: phase.channelPending,
        tracePreview: phase.preFromParallel.trace,
        turnId: chatTurn.turnId,
        messages: [],
      }
    }

    // 阶段 3-5: normal chat exit → adopt (abort temp; formal stream regenerates).
    if (speculativeOn) adoptSpeculative(chatTurn.turnId)
    // 整改 #4/三轮: normal (non-card) exits surface verdict-ledger failure
    // DETERMINISTICALLY (chat:status) and into the reply context — the model
    // may paraphrase the injection, so the user status is authoritative.
    surfaceVerdictLedgerFailure(
      { failed: phase.verdictLedgerFailed },
      {
        pushInjection: (m) => extraDispatchInjections.push(m),
        sendStatus: (s) => event.sender.send('chat:status', s)
      }
    )

    const dispatchCatalogEntry =
      dispatchResult?.extensionId && extCoordinator
        ? extCoordinator.getDispatchCatalog(sessionId).find((e) => e.id === dispatchResult.extensionId)
        : undefined
    const mergedInjectionsBase = mergeExtensionContextInjections({
      coordinatorInjections: extensionInjections,
      weatherPreInjection,
      dispatchInjections: extraDispatchInjections,
      dispatchResult,
      dispatchCatalogEntry
    })
    const mergedInjections = [...mergedInjectionsBase]
    try {
      const { consumeSocialEchoes, buildSocialEchoBlock } = await import('../social/index.js')
      const echoBlock = buildSocialEchoBlock(consumeSocialEchoes(root))
      if (echoBlock) mergedInjections.push(echoBlock)
    } catch {
      /* social echo optional */
    }

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

    // 主动策略 Loop：缓存 intensityMod，供 chat:start 注入 LLM 温度
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

    const turnId = chatTurn.turnId

    const userTaskFrame = await resolveUserTaskFrame(settings, args.userText)
    const taskFrameSystemHint = buildTaskFrameSystemHint(userTaskFrame)
    const honesty = resolveDispatchHonestyGuard({
      userText: args.userText,
      dispatchResult
    })
    // 名字主动询问：STRANGER阶段 ≥3轮 || FAMILIAR阶段 → 提示LLM问名字
    const askNameStage = state.relationship.stage
    const askNameTurnOk = askNameStage === 'FAMILIAR' || (askNameStage === 'STRANGER' && (args.turnIndex ?? 0) >= 3)
    const askNameHint =
      askNameTurnOk && shouldAskUserName(store)
        ? `\n【重要提示】你还不知道用户的名字。请用你的人格风格自然地询问ta叫什么。不要直接说"请告诉我你的名字"——用你自己的说话方式。`
        : undefined

    const mergedSystemHint =
      [args.systemHint, taskFrameSystemHint, honesty.systemHint, askNameHint].filter(Boolean).join('\n\n') ||
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
          prevState: state,
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
        routeExplain: buildRouteExplain(root, turnId),
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
      sessionId: args.sessionId ?? engineSessionId(),
      turnIndex: args.turnIndex ?? 0,
      userMsg: args.userText,
      newState: finalState,
      prevState: structuredClone(state),
      skipIngest: shouldSkipTierBIngestForOrigin(pre.trace),
      trace: pre.trace,
      event: pre.event,
      surface: interactionSurface === 'weixin' ? 'weixin' : 'desktop',
      interactionSurface,
      ownerAgentId: PRIMARY_AGENT_ID,
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

    const forcedWebSearchQuery = undefined
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
      queryEmbed: preparedTurn.queryEmbed,
      routeExplain: buildRouteExplain(root, turnId)
    }
      }
    )
    } finally {
      clearChatInFlight(targetAgentId)
    }
  })

  ipcMain.handle('workbench:follow', (_e, args: { chatSessionId?: string; text?: string }) => {
    const text = args?.text?.trim() ?? ''
    if (!text) return { ok: false, reason: '空跟一句' }
    return followPinnedWork(args.chatSessionId || currentSessionId(), text, undefined, currentDataRoot())
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
    const targetAgentId = resolveTargetAgentId(
      typeof payload.targetAgentId === 'string' ? payload.targetAgentId : undefined
    )
    const interactionSurface = resolveInteractionSurface(
      payload.interactionSurface,
      'desktop',
      targetAgentId
    )
    const sessionId =
      typeof payload.sessionId === 'string'
        ? payload.sessionId
        : isSocialMember(targetAgentId, root)
          ? sessionIdForAgent(targetAgentId)
          : currentSessionId()
    recordDesktopAckemActivity(root)
    touchProactiveUserActivity()
    if (lastIntensityMod !== 1.0) {
      payload.intensityMod = lastIntensityMod
    }
    markChatStreamStart(sessionId)
    const runChat = async () => {
      try {
        await streamChatCompletion(wc, payload, root)
      } finally {
        markChatStreamEnd(sessionId)
      }
    }
    await withAgentContext(targetAgentId, runChat, { interactionSurface })
  })

  ipcMain.handle('chat:loadHistory', (_e, opts?: { targetAgentId?: string }) => {
    const root = currentDataRoot()
    const targetAgentId = resolveTargetAgentId(opts?.targetAgentId)
    const sid = isSocialMember(targetAgentId, root)
      ? sessionIdForAgent(targetAgentId)
      : currentSessionId()
    return loadUnifiedChatRows(root, sid)
  })

  ipcMain.handle(
    'chat:saveHistory',
    (_e, rows: unknown[], opts?: { targetAgentId?: string }) => {
    const root = currentDataRoot()
    const targetAgentId = resolveTargetAgentId(opts?.targetAgentId)
    const dir = join(root, 'companion')
    const sid = isSocialMember(targetAgentId, root)
      ? sessionIdForAgent(targetAgentId)
      : currentSessionId()
    mkdirSync(dir, { recursive: true })
    const trimmed = rows.slice(-2000)
    writeFileSync(join(dir, `chat-history-${sid}.json`), JSON.stringify(trimmed), 'utf-8')
    saveChatHistoryToDb(root, sid, trimmed)
  })

  ipcMain.handle('state:get', (_e, opts?: { targetAgentId?: string }) => {
    const s = loadSettings()
    const root = resolveDataRoot(s)
    ensureDataLayout(root)
    const targetAgentId = resolveTargetAgentId(opts?.targetAgentId)
    let st
    if (isSocialMember(targetAgentId, root)) {
      const row = getRegisteredAgent(root, targetAgentId)
      if (!row) {
        throw Object.assign(new Error('AGENT_NOT_FOUND'), { code: 'AGENT_NOT_FOUND' })
      }
      st = mergeSocialMemberState(root, s, row)
    } else {
      st = mergeEngineState(root, s)
    }
    const gapHours = (Date.now() - new Date(st.lastActive).getTime()) / 3600000
    const shock =
      gapHours >= 1 ? { gapHours: Math.round(gapHours), active: true } : { active: false }
    return { ...st, _reunion: shock, agentId: targetAgentId }
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
}

// [extensions/gamemode/host-bridge] — 主进程桥接（引擎/记忆访问仅限此处）

import type { IndexSnapshot } from '../../indexer'
import type { FullState } from '../../engine/types'
import type { AppSettings } from '../../settings'
import type { GameModeHostBridge } from './types'
import { buildEngineSnapshot } from '../snapshot'
import { snapshotToEngineStateForGaming } from './providers/minecraft/adapters'

export interface GameModeHostBridgeDeps {
  loadSettings(): AppSettings
  resolveDataRoot(s: AppSettings): string
  currentSessionId(): string
  mergeEngineState(root: string, s: AppSettings): FullState
  getOrRebuildIndex(): IndexSnapshot
}

export function createGameModeHostBridge(deps: GameModeHostBridgeDeps): GameModeHostBridge {
  const {
    loadSettings,
    resolveDataRoot,
    currentSessionId,
    mergeEngineState,
    getOrRebuildIndex
  } = deps

  return {
    getSnapshot() {
      const settings = loadSettings()
      const root = resolveDataRoot(settings)
      const state = mergeEngineState(root, settings)
      return buildEngineSnapshot(state, settings)
    },

    getEngineStateForGaming() {
      return snapshotToEngineStateForGaming(this.getSnapshot())
    },

    getPersonalityPresetId() {
      return loadSettings().personalityPresetId
    },

    async runIngameChat(userText: string, recentUserMessages: string[]) {
      const settings = loadSettings()
      const dataRoot = resolveDataRoot(settings)
      const snap = getOrRebuildIndex()
      const currentState = mergeEngineState(dataRoot, settings)

      const { FactStore, defaultFactsPath } = await import('../../memory/factStore.js')
      const { EpisodicStore, defaultEpisodesPath } = await import('../../memory/episodicStore.js')
      const { KnowledgeGraph, defaultKgPath } = await import('../../memory/knowledgeGraph.js')
      const { VectorStore } = await import('../../memory/vectorStore.js')
      const { MemoryRetriever } = await import('../../memory/retriever.js')
      const { runPreLlmTurn } = await import('../../engine/orchestrator.js')
      const { assembleMessages } = await import('../../context.js')
      const { saveState } = await import('../../engine/state-persistence.js')
      const { createLlmJsonClient } = await import('../../llmClient.js')

      const store = new FactStore(defaultFactsPath(dataRoot))
      store.load()
      const epStore = new EpisodicStore(defaultEpisodesPath(dataRoot))
      const kg = new KnowledgeGraph(defaultKgPath(dataRoot))
      kg.load()
      const vs = new VectorStore()
      vs.build(store.listActive())
      const retriever = new MemoryRetriever(store, snap, epStore, kg, vs)

      const pre = await runPreLlmTurn({
        msg: userText,
        prev: currentState,
        factStore: store,
        retriever,
        sessionId: settings.activeSessionId || 'default',
        turnIndex: currentState.counters.totalTurns + 1,
        memoryBudgetChars: settings.memoryBudgetChars,
        adultMode: settings.adultContentMode && settings.ageConfirmed18,
        recentUserMessages
      })

      if (pre.skipLlm) {
        return pre.redlineReply ?? '……'
      }

      saveState(dataRoot, pre.newState, currentSessionId())

      const messages = assembleMessages({
        userText,
        recentMessages: [{ role: 'user', content: userText }],
        index: snap,
        settings,
        psycheBlock: pre.psycheBlock,
        tierBBlock: pre.tierBBlock
      })

      const llm = createLlmJsonClient(settings)
      const replyText = await llm.chatCompletionJson({
        messages: messages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        temperature: 0.8
      })

      return replyText ?? ''
    }
  }
}

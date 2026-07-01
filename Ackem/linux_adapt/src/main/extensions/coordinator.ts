// [coordinator] — 扩展协调器：引擎与 Skill/Plugin/OpenForU/GameMode 的唯一桥梁

import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  DispatchCatalogEntry,
  EngineSnapshot,
  ExtensionEvent,
  SkillInvocation,
  SkillResult
} from './protocols'
import type { RuntimeContext } from '../context/types'
import type { KnowledgeContextResolveInput } from './plugins/builtin/knowledge-presentation/plugin'
import { PluginRegistry } from './plugins/registry'
import { SkillRegistry } from './skills/registry'
import type { SkillHandler } from './skills/types'
import { gameModeCoordinator } from './gamemode/coordinator'
import { OpenForULoader } from './openforu/loader'
import { CommunityExtensionLoader } from './ecosystem/communityLoader'
import { isCommunityExtensionsOpen } from '../../shared/communityExtensionFeature'
import { createSandboxHostDeps } from './openforu/sandbox/createSandboxHostDeps'
import { registerBuiltinKnowledgePresentation } from './plugins/builtin/knowledge-presentation/register'
import { registerBuiltinDesktopCompanion } from './plugins/builtin/desktop-companion/register'
import { registerBuiltinPlugins } from './plugins/builtin/register-placeholders'
import { ensureVoicePipelineRuntime } from './plugins/builtin/tool/tts-voice/register'
import { registerBuiltinSkills } from './skills/builtin/register-placeholders'
import { registerPluginCatalogPlaceholders } from './plugins/builtin/register-catalog'
import { registerPluginCatalogDeprecated } from './plugins/builtin/register-deprecated-catalog'
import { registerSkillCatalogPlaceholders } from './skills/builtin/register-catalog'
import { ensureCoreExtensionsActive } from './ensureCoreExtensions'
import { buildRuntimeContext } from '../context/runtimeContext'
import { getLastTriggeredAt, isRejectedInSession } from './dispatch/dispatchSession'
import {
  getKnowledgePresentationPlugin,
  KNOWLEDGE_PRESENTATION_PLUGIN_ID
} from './plugins/builtin/knowledge-presentation/plugin'
import { publishExtensionTriggeredById } from '../extensionTriggerBus'
import { WEATHER_SENSE_MANIFEST } from './skills/builtin/tool/weather-sense/manifest'
import { isWeatherQuery } from './skills/builtin/tool/weather-sense/weatherIntent'
import { readWeatherContextBlock } from './skills/builtin/tool/weather-sense/weatherCache'

export class ExtensionsCoordinator {
  readonly gameMode = gameModeCoordinator
  readonly plugins: PluginRegistry
  readonly skills: SkillRegistry
  readonly openforu: OpenForULoader
  readonly community: CommunityExtensionLoader

  private eventQueue: ExtensionEvent[] = []
  private lastSnapshot: EngineSnapshot | null = null
  private lastRuntimeContext: RuntimeContext | null = null

  constructor(private readonly dataRoot: string) {
    const extDir = join(dataRoot, 'extensions')
    this.plugins = new PluginRegistry(join(extDir, 'plugins'))
    this.skills = new SkillRegistry(join(extDir, 'skills'))

    const eventSink = (event: ExtensionEvent) => {
      this.eventQueue.push(event)
    }
    this.plugins.setEventSink(eventSink)
    this.skills.setEventSink(eventSink)

    const sandboxDeps = createSandboxHostDeps({
      getEngineSnapshot: () => this.lastSnapshot,
      emitEvent: eventSink
    })
    this.openforu = new OpenForULoader(dataRoot, this.skills, this.plugins, sandboxDeps)
    this.community = new CommunityExtensionLoader(dataRoot, this.skills, this.plugins, sandboxDeps)
  }

  /** 启动时加载所有已安装的扩展 */
  async boot(snapshot: EngineSnapshot): Promise<void> {
    this.plugins.loadRegistry()
    this.skills.loadRegistry()
    await registerBuiltinKnowledgePresentation(this.plugins)
    await registerBuiltinDesktopCompanion(this.plugins)
    await registerBuiltinPlugins(this.plugins)
    await registerBuiltinSkills(this.skills)
    await registerPluginCatalogPlaceholders(this.plugins)
    await registerPluginCatalogDeprecated(this.plugins)
    await registerSkillCatalogPlaceholders(this.skills)
    await ensureCoreExtensionsActive(this.plugins, this.skills)

    const ofuResult = await this.openforu.boot()
    if (!ofuResult.ok) {
      console.error('[coordinator] openforu 启动失败:', ofuResult.error)
    }

    if (isCommunityExtensionsOpen()) {
      const communityResult = await this.community.boot()
      if (!communityResult.ok) {
        console.error('[coordinator] community 扩展启动失败:', communityResult.error)
      }
    }

    this.updateSnapshot(snapshot)
    this.skills.setRuntimeProvider(() => this.lastRuntimeContext)

    // voice-pipeline: activate() may run before snapshot → onLoad skipped; start service now.
    void ensureVoicePipelineRuntime().catch((err) => {
      console.warn('[voice-pipeline] deferred runtime start error:', err)
    })
  }

  /** 由主 IPC 在每轮 Pre-LLM 后调用 */
  updateSnapshot(snapshot: EngineSnapshot): void {
    this.lastSnapshot = snapshot
    this.lastRuntimeContext = this.buildRuntimeFromSnapshot(snapshot)
    this.gameMode.updateEngineSnapshot(snapshot)
    this.plugins.updateEngineSnapshot(snapshot)
    this.skills.updateEngineSnapshot(snapshot)
  }

  getRuntimeContext(): RuntimeContext | null {
    return this.lastRuntimeContext
  }

  getDataRoot(): string {
    return this.dataRoot
  }

  private buildRuntimeFromSnapshot(snapshot: EngineSnapshot): RuntimeContext {
    const gameActive = this.gameMode.getActiveStatus().gameId !== null
    return buildRuntimeContext({
      dataRoot: this.dataRoot,
      sessionId: snapshot.sessionId,
      lastActiveAt: snapshot.lastActiveAt,
      now: new Date(snapshot.capturedAt),
      memoryFactSummaries: snapshot.memory.recentFactSummaries,
      gameActive
    })
  }

  async executeSkill(invocation: SkillInvocation): Promise<SkillResult> {
    const runtime =
      invocation.runtime ??
      this.lastRuntimeContext ??
      (this.lastSnapshot ? this.buildRuntimeFromSnapshot(this.lastSnapshot) : null)
    return this.skills.execute({ ...invocation, runtime: runtime ?? undefined })
  }

  drainAllEvents(): ExtensionEvent[] {
    const gmEvents = this.gameMode.drainEvents()
    const allEvents = [...gmEvents, ...this.eventQueue]
    this.eventQueue = []
    return allEvents
  }

  getContextInjections(userText?: string): string[] {
    const injections: string[] = []
    for (const event of this.gameMode.collectPendingEvents()) {
      if (event.injectToContext && event.contextInjection) {
        injections.push(event.contextInjection)
      }
    }
    for (const event of this.eventQueue) {
      if (event.injectToContext && event.contextInjection) {
        injections.push(event.contextInjection)
      }
    }
    const weather = this.skills.get(WEATHER_SENSE_MANIFEST.id)
    if (weather?.status === 'active') {
      const userAskingWeather = Boolean(userText && isWeatherQuery(userText))
      if (!userAskingWeather) {
        const block = readWeatherContextBlock(this.dataRoot)
        if (block) {
          injections.push(block.replace('[天气感知]', '[天气感知·本地默认]'))
        }
      }
    }
    return injections
  }

  getAggregatedEmotionHints(): {
    affDelta: number
    secDelta: number
    aroDelta: number
    domDelta: number
  } {
    let affDelta = 0
    let secDelta = 0
    let aroDelta = 0
    let domDelta = 0
    const allPending = [...this.gameMode.collectPendingEvents(), ...this.eventQueue]
    for (const event of allPending) {
      if (event.emotionHint) {
        affDelta += event.emotionHint.affDelta ?? 0
        secDelta += event.emotionHint.secDelta ?? 0
        aroDelta += event.emotionHint.aroDelta ?? 0
        domDelta += event.emotionHint.domDelta ?? 0
      }
    }
    return {
      affDelta: Math.max(-10, Math.min(10, affDelta)),
      secDelta: Math.max(-10, Math.min(10, secDelta)),
      aroDelta: Math.max(-10, Math.min(10, aroDelta)),
      domDelta: Math.max(-10, Math.min(10, domDelta))
    }
  }

  getAvailableTools() {
    return this.skills.getFunctionDefs()
  }

  getDispatchCatalog(sessionId?: string): DispatchCatalogEntry[] {
    const entries: DispatchCatalogEntry[] = []
    for (const instance of this.skills.listAll()) {
      if (!instance.manifest.dispatch) continue
      entries.push({
        id: instance.manifest.id,
        name: instance.manifest.name,
        category: 'skill',
        status: instance.status,
        dispatch: instance.manifest.dispatch
      })
    }
    for (const instance of this.plugins.listInstalled()) {
      if (!instance.manifest.dispatch) continue
      entries.push({
        id: instance.manifest.id,
        name: instance.manifest.name,
        category: 'plugin',
        status: instance.status,
        dispatch: instance.manifest.dispatch
      })
    }
    if (sessionId) {
      return entries.map((e) => ({
        ...e,
        lastTriggeredAt: getLastTriggeredAt(sessionId, e.id),
        rejectedInSession: isRejectedInSession(sessionId, e.id)
      }))
    }
    return entries
  }

  getActiveDispatchedExtensions(sessionId?: string): DispatchCatalogEntry[] {
    return this.getDispatchCatalog(sessionId).filter(
      (e) => e.dispatch.mode === 'dispatched' && e.status === 'active'
    )
  }

  getLastSnapshot(): EngineSnapshot | null {
    return this.lastSnapshot
  }

  getSkillHandler(id: string): SkillHandler | undefined {
    return this.skills.getHandler(id)
  }

  async executeDispatchedSkill(
    extensionId: string,
    userMessage: string,
    sessionId: string,
    snapshot: EngineSnapshot
  ) {
    const { executeDispatchedExtension } = await import('./dispatch/dispatchExecutor')
    return executeDispatchedExtension(this, extensionId, userMessage, sessionId, snapshot)
  }

  resolveKnowledgeContextBuild(input: KnowledgeContextResolveInput) {
    const result = getKnowledgePresentationPlugin().resolveForContextBuild(input)
    if (result.knowledgeTopic?.trim()) {
      publishExtensionTriggeredById(KNOWLEDGE_PRESENTATION_PLUGIN_ID)
    }
    this.eventQueue.push({
      id: `evt-${randomUUID()}`,
      category: 'plugin',
      sourceId: KNOWLEDGE_PRESENTATION_PLUGIN_ID,
      type: 'knowledge:context_resolve',
      payload: {
        sessionId: input.sessionId,
        userTextForLlm: result.userTextForLlm,
        knowledgeTopic: result.knowledgeTopic ?? null
      },
      injectToContext: false,
      timestamp: new Date().toISOString()
    })
    return result
  }

  getDispatchCatalogByMode(sessionId?: string): Record<
    'autonomous' | 'always_on' | 'manual' | 'dispatched',
    DispatchCatalogEntry[]
  > {
    const grouped = {
      autonomous: [] as DispatchCatalogEntry[],
      always_on: [] as DispatchCatalogEntry[],
      manual: [] as DispatchCatalogEntry[],
      dispatched: [] as DispatchCatalogEntry[]
    }
    for (const entry of this.getDispatchCatalog(sessionId)) {
      grouped[entry.dispatch.mode].push(entry)
    }
    return grouped
  }
}

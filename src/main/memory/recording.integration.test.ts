import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { runCompanionTurn } from '../channels/companionTurn'
import { beginChatTurn, closeConfirmCard, finalizeChatTurn } from '../chat/turnCoordinator'
import { loadTemporalFactsFromDataRoot } from '../context/temporalFacts'
import { closeDatabase, getDatabase } from '../db/database'
import { insertFact } from '../db/repos/memoryFacts'
import { clearEngineCache } from '../engineCache'
import { createAckemMemorySystem } from './adapters/composeMemorySystem'
import { registerMemorySystemFactory } from './bootstrap'
import { FactStore, defaultFactsPath } from './factStore'
import { createMemoryJobRunner } from './jobs/memoryJobRunner'
import { composeRecall } from './recall/recallComposer'
import type { MemoryFact } from './semantic/types'
import { resolvePreferredName } from './userName'

const fixture = vi.hoisted(() => ({ root: '' }))
const summary = '用户喜欢桂花乌龙'

vi.mock('../settings', async (original) => {
  const real = await original<typeof import('../settings')>()
  return {
    ...real,
    loadSettings: () => ({
      ...real.loadSettings(), llmProvider: 'openai', openaiBaseUrl: 'https://test.invalid',
      adultContentMode: false, weixinMirrorEnabled: false
    })
  }
})
vi.mock('../paths', async (original) => ({
  ...await original<typeof import('../paths')>(),
  resolveDataRoot: () => fixture.root
}))
vi.mock('../embedding/embeddingReadiness', async (original) => ({
  ...await original<typeof import('../embedding/embeddingReadiness')>(),
  isEmbeddingReadyForChat: () => true
}))
vi.mock('../ackemcode/dispatch', () => ({ maybeRunCodeTask: async () => ({ handled: false }) }))
vi.mock('../context', () => ({ assembleMessages: () => [] }))
vi.mock('./embedding/provider', async (original) => ({
  ...await original<typeof import('./embedding/provider')>(),
  createEmbeddingProvider: async () => ({ ready: () => false, dispose: () => {} })
}))
vi.mock('../chat', () => ({
  streamChatCompletion: async (
    sink: { send: (event: string, data: unknown) => void },
    input: { turnId: string; settings: import('../settings').AppSettings },
    dataRoot: string
  ) => {
    const assistantText = '记住了。'
    sink.send('chat:done', { assistantText })
    const { finalizeTurnAfterStream } = await import('../postChatTurn')
    await finalizeTurnAfterStream({ ...input, dataRoot, assistantText })
  }
}))
vi.mock('../llmClient', async (original) => ({
  ...await original<typeof import('../llmClient')>(),
  createLlmJsonClient: () => ({
    chatCompletionJson: async () => JSON.stringify({
      facts: [{ domain: 'INNER_WORLD', subcategory: 'TASTES', subject: '用户偏好', summary: '用户喜欢桂花乌龙' }]
    })
  })
}))

function openFixture() {
  const dataRoot = mkdtempSync(join(tmpdir(), 'ackem-memory-recording-'))
  fixture.root = dataRoot
  registerMemorySystemFactory(createAckemMemorySystem)
  return { dataRoot, db: getDatabase(dataRoot)!, sessionId: 'default' }
}

afterEach(() => {
  clearEngineCache()
  if (!fixture.root) return
  closeDatabase(fixture.root)
  rmSync(fixture.root, { recursive: true, force: true })
  fixture.root = ''
})

it.each(['qq', 'weixin'])('records %s companion turns and derives a sourced fact after reopening SQLite', async (channel) => {
  const { dataRoot, db, sessionId } = openFixture()
  const turn = await runCompanionTurn({ channel, sessionId, userText: '我喜欢桂花乌龙。' })
  expect(turn.assistantText).toBe('记住了。')
  expect(db.prepare('SELECT event_type FROM memory_events WHERE turn_id = ?').all(turn.turnId))
    .toEqual(expect.arrayContaining([
      { event_type: 'chat.user_message' }, { event_type: 'chat.assistant_reply' }, { event_type: 'chat.turn_derive_context' }
    ]))
  expect(db.prepare('SELECT job_type, status FROM memory_jobs').all())
    .toEqual([{ job_type: 'derive.chat_turn', status: 'pending' }])
  closeDatabase(dataRoot)
  const runner = createMemoryJobRunner({ dataRoot, eagerFirstTick: false })
  runner.start()
  try {
    const report = await runner.runOnce(new Date().toISOString())
    expect(report.succeeded).toBe(1)
    const reopened = getDatabase(dataRoot)!
    expect(reopened.prepare('SELECT COUNT(*) AS count FROM memory_fact_evidence').get())
      .toEqual({ count: 1 })
  } finally {
    runner.stop()
  }
  const result = await composeRecall(dataRoot, recallQuery(sessionId))
  expect(result.promptBlock).toContain(summary)
})

it.each(['dispatch', 'confirmation'])('records %s without queuing contextless fact derivation', (kind) => {
  const { dataRoot, db, sessionId } = openFixture()
  const ctx = { dataRoot, sessionId, surface: 'desktop' as const, userText: '帮我检查项目' }
  const { turnId } = beginChatTurn(ctx)
  const result = kind === 'dispatch'
    ? finalizeChatTurn({ ...ctx, turnId, assistantText: '已派工。' })
    : closeConfirmCard({ ...ctx, turnId, planId: 'confirm', intent: 'work_job', summary: '检查项目' })
  expect(result.memoryDegraded).toBe(false)
  const eventType = kind === 'dispatch' ? 'chat.assistant_reply' : 'plan.proposed'
  expect(db.prepare('SELECT event_type FROM memory_events WHERE turn_id = ?').all(turnId))
    .toContainEqual({ event_type: eventType })
  expect(db.prepare('SELECT job_type FROM memory_jobs').all()).toEqual([])
})

function recallQuery(sessionId: string) {
  return {
    sessionId, text: '你还记得我喜欢什么茶吗？',
    observedAt: new Date().toISOString(), timezone: 'Asia/Shanghai', budgetChars: 2000, deadlineMs: 5000
  }
}

function factFixture(): MemoryFact {
  const now = new Date().toISOString()
  return {
    id: 'shared', subject: '用户偏好', summary, domain: 'INNER_WORLD', subcategory: 'BASIC_PROFILE',
    weight: 3, confidence: 1, status: 'active', selfRelevance: 1, triggers: ['茶'],
    emotionalContext: { valence: 0, intensity: 0, relStage: 'FAMILIAR', trust: 50, atmosphere: 'neutral' },
    ownerAgentId: 'default', interactionSurface: 'weixin', updateTrail: [],
    sourceSessionId: 'main', sourceTurnIndex: 1, createdAt: now, updatedAt: now
  }
}

it('recalls a permitted cross-session fact without including another owner or private-mode facts', async () => {
  const { dataRoot, sessionId } = openFixture()
  const shared = factFixture()
  insertFact(dataRoot, shared)
  insertFact(dataRoot, { ...shared, id: 'other', ownerAgentId: 'other', sourceSessionId: 'social_other',
    interactionSurface: 'social_private', summary: '用户喜欢月纹薄荷茶' })
  insertFact(dataRoot, { ...shared, id: 'private', sourceSessionId: sessionId,
    privacyLevel: 'explicit', summary: '用户喜欢珍珠雪茶' })
  const { reliableFacts } = await composeRecall(dataRoot, recallQuery(sessionId))
  expect(reliableFacts.map(f => f.id)).toEqual(['fact:shared'])
  const adult = await composeRecall(dataRoot, { ...recallQuery(sessionId), adultMode: true })
  expect(adult.reliableFacts.map(f => f.id).sort()).toEqual(['fact:private', 'fact:shared'])
})

it('keeps names and plan supplements inside ordinary conversation visibility', () => {
  const { dataRoot } = openFixture()
  const shared = factFixture()
  const name = { ...shared, subject: '用户昵称', summary: '用户喜欢被叫小林' }
  insertFact(dataRoot, name)
  insertFact(dataRoot, { ...name, id: 'foreign-name', ownerAgentId: 'other', weight: 9, summary: '用户喜欢被叫小王' })
  const plan = { ...shared, id: 'plan', subcategory: 'PLANS', summary: '用户计划去杭州' }
  insertFact(dataRoot, plan)
  insertFact(dataRoot, { ...plan, id: 'private-plan', privacyLevel: 'explicit', summary: '私密计划' })

  const store = new FactStore(defaultFactsPath(dataRoot))
  expect.soft(resolvePreferredName(store)).toBe('小林')
  expect(loadTemporalFactsFromDataRoot(dataRoot)).toEqual([{ subcategory: 'PLANS', summary: plan.summary }])
})

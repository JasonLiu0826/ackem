type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string }

import { extractImplicitCapabilityHint } from '../../extensions/openforu/extensionIntentClassifier'

function blob(messages: ChatMsg[]): string {
  return messages.map((m) => m.content).join('\n')
}

/** Heuristic fixture responses for non-streaming JSON LLM calls in mock mode. */
export function mockJsonCompletion(messages: ChatMsg[]): string {
  const text = blob(messages)

  if (text.includes('扩展调度') || text.includes('extension_id')) {
    return JSON.stringify({ matched: false, reasoning: 'mock:no_match' })
  }

  if (
    text.includes('capability probe') ||
    text.includes('capability_gap') ||
    text.includes('implementable_as_skill')
  ) {
    const userLine =
      [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
    const quoted = userLine.match(/用户消息："(.+?)"/)?.[1] ?? userLine
    const hint = extractImplicitCapabilityHint(quoted)
    if (hint && !/(?:陪(?:我|你)|孤独|寂寞)/u.test(hint)) {
      return JSON.stringify({
        capability_gap: 0.88,
        implementable_as_skill: 0.9,
        persistency: 'recurring',
        suggested_name: hint.slice(0, 8),
        suggested_capability: quoted.trim().slice(0, 48),
        should_propose_plan: true,
        reasoning: 'mock:structural_probe'
      })
    }
    return JSON.stringify({
      capability_gap: 0.2,
      implementable_as_skill: 0.1,
      persistency: 'relational',
      should_propose_plan: false,
      reasoning: 'mock:relational_or_no_hint'
    })
  }

  if (
    text.includes('抽取') ||
    text.includes('extract') ||
    text.includes('"facts"') ||
    text.includes('memory facts')
  ) {
    return JSON.stringify({ facts: [] })
  }

  if (text.includes('insights') || text.includes('审视一组') || text.includes('高层洞察')) {
    return JSON.stringify({ insights: [] })
  }

  if (text.includes('contradiction') || text.includes('矛盾')) {
    return JSON.stringify({ contradictions: [] })
  }

  if (text.includes('episode') || text.includes('情节') || text.includes('episodes')) {
    return JSON.stringify({ episodes: [] })
  }

  if (text.includes('userSix') || text.includes('开源六维') || text.includes('心理画像')) {
    return JSON.stringify({
      userSix: {
        E: 50,
        A: 50,
        D: 50,
        P: 50,
        N: 50,
        O: 50,
        summary: 'mock 画像摘要'
      },
      companionSuggestion: {
        T: 70,
        I: 50,
        S: 40,
        O: 55,
        R: 50,
        confidence: 0.5,
        rationale: 'mock'
      }
    })
  }

  if (text.includes('rerank') || text.includes('重排')) {
    return JSON.stringify({ ranked: [] })
  }

  if (text.includes('search query') || text.includes('搜索词')) {
    return JSON.stringify({ query: 'mock search', needsSearch: false })
  }

  if (
    text.includes('manifestDescription') ||
    text.includes('keywordReply') ||
    text.includes('injectTemplate') ||
    text.includes('扩展文案润色') ||
    text.includes('uplugin 文案润色')
  ) {
    return JSON.stringify({
      manifestDescription: '（mock 润色）根据 Plan 方案定制的扩展说明，语气贴近 Ackem 伴侣。',
      keywordReply: '（mock 润色）已按你的习惯触发，我会用方案里约定的方式回应你。',
      contextInjection: '（mock 润色）结合当前对话与 Plan 摘要，落实方案中的具体行为。',
      injectTemplate: '（mock 润色）Plugin 已按方案注入上下文，请按约定协助用户。'
    })
  }

  if (
    text.includes('uplugin main.ts 代码生成') ||
    text.includes('OpenForU uplugin main.ts 代码生成助手')
  ) {
    const userLine =
      [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
    if (userLine.includes('FORCE_FORBIDDEN_MAIN_TS')) {
      return '```typescript\nimport fs from "node:fs"\nexport default () => ({})\n```'
    }
    return [
      '```typescript',
      'export default () => ({',
      '  beforeUserMessage: async (userMessage: string) => {',
      '    if (!userMessage.includes("沙箱探针")) return { contextInjections: [] }',
      '    return { contextInjections: ["【mock Worker】main.ts 执行成功"] }',
      '  }',
      '})',
      '```'
    ].join('\n')
  }

  if (
    text.includes('扩展开发 Agent') ||
    text.includes('plan-structured') ||
    text.includes('dispatchProgress')
  ) {
    const userMsgs = messages.filter((m) => m.role === 'user')
    const turn = userMsgs.length
    const blocks: string[] = ['（mock Plan Agent）请继续确认方案。', '', '**A.** 继续', '', '```plan-structured']
    const structured: Record<string, unknown> = { artifactType: 'uskill' }
    const dp: Record<string, unknown> = {}
    if (turn >= 1) dp.keywords = ['mock', '测试']
    if (turn >= 2) dp.habits = ['用户说 mock 触发']
    if (turn >= 3) dp.scenarios = ['日常']
    if (turn >= 4) dp.summary = 'mock 专注提醒'
    if (turn >= 5) dp.mode = 'dispatched'
    if (Object.keys(dp).length) structured.dispatchProgress = dp
    if (turn >= 6) {
      structured.shouldConverge = true
      structured.planSummary = {
        artifactType: 'uskill',
        trigger: '关键词 dispatched',
        output: '系统通知',
        permissions: 'system_notification'
      }
    }
    blocks.push(JSON.stringify(structured), '```')
    return blocks.join('\n')
  }

  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content?.trim()
  if (lastUser) {
    return `（mock）收到：${lastUser.slice(0, 120)}`
  }

  if (text.includes('plan create ask') || text.includes('Skill 或插件')) {
    const userLine =
      [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
    const core = userLine.match(/需保留的核心意思：(.+)/)?.[1]?.trim()
    if (core) return `（mock 口吻）${core}`
    return '（mock）要不要我帮你做成 Skill 或插件？'
  }

  return '{"ok":true}'
}

/** Short assistant reply for streaming chat in mock mode. */
export function mockChatStreamText(messages: unknown[]): string {
  const msgs = messages as Array<{ role?: string; content?: unknown }>
  const lastUser = [...msgs].reverse().find((m) => m.role === 'user')
  const content =
    typeof lastUser?.content === 'string'
      ? lastUser.content
      : Array.isArray(lastUser?.content)
        ? String((lastUser.content as Array<{ text?: string }>)[0]?.text ?? '')
        : ''
  if (!content.trim()) return '（mock）你好，我在这里。'
  return `（mock）${content.trim().slice(0, 200)}`
}

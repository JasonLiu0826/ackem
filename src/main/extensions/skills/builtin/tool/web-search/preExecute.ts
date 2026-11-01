// [web-search/preExecute] — 渠道侧联网搜索预执行
// QQ/微信渠道禁用了聊天工具（disableChatTools），模型无法自己调用 web_search。
// 这里在回合开始前识别「明确要联网查」的请求，直接执行 web-search 技能并把结果注入上下文。
import type { ExtensionsCoordinator } from '../../../../coordinator'
import { WEB_SEARCH_MANIFEST } from './manifest'
import {
  detectKnowledgeWorkIntent,
  resolveForcedWebSearchQuery
} from '../../../../plugins/builtin/knowledge-presentation/intent'

const MAX_INJECT_CHARS = 4000

export async function preExecuteWebSearch(
  coordinator: ExtensionsCoordinator,
  userText: string,
  recentMessages?: Array<{ role: string; content: string }>
): Promise<string | null> {
  const intent = detectKnowledgeWorkIntent(userText, recentMessages)
  if (!intent || intent.intent !== 'search_web') return null

  const query = resolveForcedWebSearchQuery(intent) ?? intent.extractedQuery?.trim()
  if (!query || query.length < 2) return null

  if (coordinator.skills.get(WEB_SEARCH_MANIFEST.id)?.status !== 'active') return null

  const invocation = coordinator.skills.createInvocation(
    WEB_SEARCH_MANIFEST.id,
    'llm_function_call',
    'web_search',
    { query },
    userText
  )
  if (!invocation) return null

  const result = await coordinator.skills.execute(invocation)
  if (!result.ok || !result.output) return null

  const body =
    result.output.length > MAX_INJECT_CHARS
      ? `${result.output.slice(0, MAX_INJECT_CHARS)}…（已截断）`
      : result.output
  return `[联网搜索结果] ${body}\n请据此回答；引用事实或数据时在句末附上来源链接。`
}

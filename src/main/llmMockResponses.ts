/** LLM mock 妯″紡涓嬬殑鍥哄畾鍥炲锛堝紑鍙?绂荤嚎鐢紝闈炲崟鍏冩祴璇曪級 */
import { extractImplicitCapabilityHint } from './extensions/openforu/extensionIntentClassifier'

type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string }

function blob(messages: ChatMsg[]): string {
  return messages.map((m) => m.content).join('\n')
}

export function mockJsonCompletion(messages: ChatMsg[]): string {
  const text = blob(messages)

  if (text.includes('鎵╁睍璋冨害') || text.includes('extension_id')) {
    return JSON.stringify({ matched: false, reasoning: 'mock:no_match' })
  }

  if (
    text.includes('capability probe') ||
    text.includes('capability_gap') ||
    text.includes('implementable_as_skill')
  ) {
    const userLine =
      [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
    const quoted = userLine.match(/鐢ㄦ埛娑堟伅锛?(.+?)"/)?.[1] ?? userLine
    const hint = extractImplicitCapabilityHint(quoted)
    if (hint && !/(?:闄??:鎴憒浣?|瀛ょ嫭|瀵傚癁)/u.test(hint)) {
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
    text.includes('鎶藉彇') ||
    text.includes('extract') ||
    text.includes('"facts"') ||
    text.includes('memory facts')
  ) {
    return JSON.stringify({ facts: [] })
  }

  if (text.includes('insights') || text.includes('瀹¤涓€缁?) || text.includes('楂樺眰娲炲療')) {
    return JSON.stringify({ insights: [] })
  }

  if (text.includes('contradiction') || text.includes('鐭涚浘')) {
    return JSON.stringify({ contradictions: [] })
  }

  if (text.includes('episode') || text.includes('鎯呰妭') || text.includes('episodes')) {
    return JSON.stringify({ episodes: [] })
  }

  if (text.includes('userSix') || text.includes('寮€婧愬叚缁?) || text.includes('蹇冪悊鐢诲儚')) {
    return JSON.stringify({
      userSix: {
        E: 50,
        A: 50,
        D: 50,
        P: 50,
        N: 50,
        O: 50,
        summary: 'mock 鐢诲儚鎽樿'
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

  if (text.includes('rerank') || text.includes('閲嶆帓')) {
    return JSON.stringify({ ranked: [] })
  }

  if (text.includes('search query') || text.includes('鎼滅储璇?)) {
    return JSON.stringify({ query: 'mock search', needsSearch: false })
  }

  if (
    text.includes('manifestDescription') ||
    text.includes('keywordReply') ||
    text.includes('injectTemplate') ||
    text.includes('鎵╁睍鏂囨娑﹁壊') ||
    text.includes('uplugin 鏂囨娑﹁壊')
  ) {
    return JSON.stringify({
      manifestDescription: '锛坢ock 娑﹁壊锛夋牴鎹?Plan 鏂规瀹氬埗鐨勬墿灞曡鏄庯紝璇皵璐磋繎 Ackem 浼翠荆銆?,
      keywordReply: '锛坢ock 娑﹁壊锛夊凡鎸変綘鐨勪範鎯Е鍙戯紝鎴戜細鐢ㄦ柟妗堥噷绾﹀畾鐨勬柟寮忓洖搴斾綘銆?,
      contextInjection: '锛坢ock 娑﹁壊锛夌粨鍚堝綋鍓嶅璇濅笌 Plan 鎽樿锛岃惤瀹炴柟妗堜腑鐨勫叿浣撹涓恒€?,
      injectTemplate: '锛坢ock 娑﹁壊锛塒lugin 宸叉寜鏂规娉ㄥ叆涓婁笅鏂囷紝璇锋寜绾﹀畾鍗忓姪鐢ㄦ埛銆?
    })
  }

  if (
    text.includes('uplugin main.ts 浠ｇ爜鐢熸垚') ||
    text.includes('OpenForU uplugin main.ts 浠ｇ爜鐢熸垚鍔╂墜')
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
      '    if (!userMessage.includes("娌欑鎺㈤拡")) return { contextInjections: [] }',
      '    return { contextInjections: ["銆恗ock Worker銆憁ain.ts 鎵ц鎴愬姛"] }',
      '  }',
      '})',
      '```'
    ].join('\n')
  }

  if (
    text.includes('鎵╁睍寮€鍙?Agent') ||
    text.includes('plan-structured') ||
    text.includes('dispatchProgress')
  ) {
    const userMsgs = messages.filter((m) => m.role === 'user')
    const turn = userMsgs.length
    const blocks: string[] = ['锛坢ock Plan Agent锛夎缁х画纭鏂规銆?, '', '**A.** 缁х画', '', '```plan-structured']
    const structured: Record<string, unknown> = { artifactType: 'uskill' }
    const dp: Record<string, unknown> = {}
    if (turn >= 1) dp.keywords = ['mock', '娴嬭瘯']
    if (turn >= 2) dp.habits = ['鐢ㄦ埛璇?mock 瑙﹀彂']
    if (turn >= 3) dp.scenarios = ['鏃ュ父']
    if (turn >= 4) dp.summary = 'mock 涓撴敞鎻愰啋'
    if (turn >= 5) dp.mode = 'dispatched'
    if (Object.keys(dp).length) structured.dispatchProgress = dp
    if (turn >= 6) {
      structured.shouldConverge = true
      structured.planSummary = {
        artifactType: 'uskill',
        trigger: '鍏抽敭璇?dispatched',
        output: '绯荤粺閫氱煡',
        permissions: 'system_notification'
      }
    }
    blocks.push(JSON.stringify(structured), '```')
    return blocks.join('\n')
  }

  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content?.trim()
  if (lastUser) {
    return `锛坢ock锛夋敹鍒帮細${lastUser.slice(0, 120)}`
  }

  if (text.includes('plan create ask') || text.includes('Skill 鎴栨彃浠?)) {
    const userLine =
      [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
    const core = userLine.match(/闇€淇濈暀鐨勬牳蹇冩剰鎬濓細(.+)/)?.[1]?.trim()
    if (core) return `锛坢ock 鍙ｅ惢锛?{core}`
    return '锛坢ock锛夎涓嶈鎴戝府浣犲仛鎴?Skill 鎴栨彃浠讹紵'
  }

  return '{"ok":true}'
}

export function mockChatStreamText(messages: unknown[]): string {
  const msgs = messages as Array<{ role?: string; content?: unknown }>
  const lastUser = [...msgs].reverse().find((m) => m.role === 'user')
  const content =
    typeof lastUser?.content === 'string'
      ? lastUser.content
      : Array.isArray(lastUser?.content)
        ? String((lastUser.content as Array<{ text?: string }>)[0]?.text ?? '')
        : ''
  if (!content.trim()) return '锛坢ock锛変綘濂斤紝鎴戝湪杩欓噷銆?
  return `锛坢ock锛?{content.trim().slice(0, 200)}`
}

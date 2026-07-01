import { userRefersToAckemSelf } from './ackemProductIdentity'
import { createLlmJsonClient } from '../llmClient'
import {
  defaultPaperCardTitle,
  extractTitleFromCardBody,
  isPoorPaperCardTitle,
  type PaperCardKind
} from '../../shared/paperCardTitle'

const KIND_LABEL: Record<PaperCardKind, string> = {
  plan: '计划书',
  knowledge: '知识整理',
  search: '检索摘录',
  table: '对比表'
}

/** 解析纸面卡 UI 展示标题：正文标题 > 规则主题 > LLM 推断 > 类型默认 */
export async function resolvePaperCardDisplayTitle(
  settings: AppSettings,
  kind: PaperCardKind,
  userQuestion: string,
  ruleTopic: string,
  cardBody: string
): Promise<string> {
  const fromBody = extractTitleFromCardBody(cardBody, kind)
  if (fromBody) return fromBody

  const rule = ruleTopic.trim().slice(0, 28)
  if (rule && !isPoorPaperCardTitle(rule)) return rule

  try {
    const client = createLlmJsonClient(settings)
    const text = (
      await client.chatCompletionJson({
        messages: [
          {
            role: 'system',
            content:
              `你是标题助手。为这份「${KIND_LABEL[kind]}」起一个 **6～16 字**的中文主题名。\n` +
              '只输出标题本身：不要引号、不要问号、不要复述用户抱怨或整句原话、不要「计划书/整理卡」等类型词。' +
              (userRefersToAckemSelf(userQuestion)
                ? '\n用户在与 Ackem（你）对比时：标题须体现 Ackem，**禁止**用 DeepSeek/GPT/Claude 等模型名代替 Ackem。'
                : '')
          },
          {
            role: 'user',
            content:
              `用户原话：${userQuestion.slice(0, 240)}\n\n` +
              `正文开头：\n${cardBody.slice(0, 420)}`
          }
        ],
        temperature: 0.25,
        max_tokens: 48
      })
    ).trim()

    const cleaned = text
      .replace(/^["「『]|["」』]$/gu, '')
      .replace(/[。！？?!.…]+$/u, '')
      .trim()
      .slice(0, 28)

    if (cleaned && !isPoorPaperCardTitle(cleaned)) return cleaned
  } catch {
    /* fallback below */
  }

  return defaultPaperCardTitle(kind)
}

// [prompt/search-query-resolver] — 查询解析 prompt（v1.1 设计文档）
// 迁移自 knowledge-presentation/presentation/searchQueryResolver.ts

import { getLocale } from '../i18n'
import { SEARCH_RESOLVE_SYSTEM_EN, buildSearchResolveUserMsgEn } from './prompt-i18n'

export const SEARCH_RESOLVE_TEMPERATURE = 0.15

export const SEARCH_RESOLVE_SYSTEM_ZH = `你是搜索意图解析器。根据用户原话和候选搜索词，判断用户真正想查什么，并输出适合交给通用网页搜索引擎的查询串。

── 规则 ──
· 消除歧义（同一词可能指不同事物时，查询串须带上用户关心的领域/实体/版本等限定）
· 修正口语残缺候选（如「一下xxx」），保留英文专名、版本号、型号
· 不要编造用户未提及的主题
· 禁止输出单字或不足 4 字的歧义查询
· 如果用户最近在聊某个话题，优先关联该话题
· 用户用「你」指 Ackem 并与 Cursor/Codex 等对比时：search_query 应查 **Ackem 伴侣应用** 与对方产品，**禁止**把 DeepSeek/GPT/Claude 等底层模型名当作 Ackem 的搜索词

── 输出 ──
仅输出一行 JSON，不要 markdown：{"search_query":"...","display_label":"短标题","intent_summary":"一句话意图"}`

export const SEARCH_RESOLVE_SYSTEM = SEARCH_RESOLVE_SYSTEM_ZH

export function getSearchResolveSystem(): string {
  return getLocale() === 'en' ? SEARCH_RESOLVE_SYSTEM_EN : SEARCH_RESOLVE_SYSTEM_ZH
}

export function buildSearchResolveUserMsg(
  userMessage: string,
  candidateBlock: string,
  recentContext?: string,
): string {
  if (getLocale() === 'en') return buildSearchResolveUserMsgEn(userMessage, candidateBlock, recentContext)
  return [
    `用户原话：\n${userMessage || '（空）'}`,
    '',
    recentContext ? `最近对话上下文（只供消歧，不要编造）：${recentContext}` : '',
    '',
    `候选搜索词：\n${candidateBlock || '（无，请仅根据用户原话生成）'}`,
  ]
    .filter(Boolean)
    .join('\n')
}

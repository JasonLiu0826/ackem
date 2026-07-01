// [S-15] 网页搜索 — Bing Skill manifest

import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const WEB_SEARCH_DISPATCH: DispatchConfig = {
  mode: 'dispatched',
  subtype: 'llm_function_call',
  time: {
    active_hours: '00:00-23:59',
    cooldown_minutes: 5
  },
  habits: [
    "用户说'帮我搜''搜索一下''查一下'",
    '用户询问需要联网的实时信息（新闻、价格、版本；天气由 get_weather 处理）'
  ],
  scenarios: [
    '用户需要实时或联网信息',
    '新闻、文档、版本更新等查询（天气除外）',
    'Companion 自身知识不足以回答的事实性问题'
  ],
  summary: '通过 Bing 搜索网页获取实时信息，供 companion 引用后回答。',
  keywords: ['搜索', '搜一下', '查一下', '百度', 'google', 'bing', '新闻', '最新'],
  personality_hint: 'neutral'
}

export const WEB_SEARCH_MANIFEST: SkillManifest = {
  id: 'ackem/web-search@1.0.0',
  name: '网页搜索',
  version: '1.0.0',
  category: 'skill',
  skillType: 'tool',
  description: '通过 Bing 搜索网页，获取实时信息（新闻、文档等；天气请用 get_weather）',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['llm_function_call'],
  permissions: ['engine_read', 'network_outbound'],
  timeoutMs: 30000,
  adultModeSafe: true,
  functionDef: {
    name: 'web_search',
    description:
      '通过 Bing 搜索网页获取实时信息。用于新闻、价格、版本、最新事件等。**禁止**用于天气查询（天气必须用 get_weather）。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词，由 LLM 从用户意图提取，尽量具体完整'
        }
      },
      required: ['query']
    }
  },
  tags: ['builtin', 'search', 'bing', 's-15', 'core'],
  dispatch: WEB_SEARCH_DISPATCH
}

export const SKILL_ID = WEB_SEARCH_MANIFEST.id
export const SPEC_ID = 'S-15'


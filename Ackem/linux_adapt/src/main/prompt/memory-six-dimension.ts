// [prompt/memory-six-dimension] — 六维推断 prompt（v1.0 设计文档）
// 迁移自 engine/user-dimension-inferrer.ts

import { getLocale } from '../i18n'
import { INFER_SYSTEM_EN, buildInferUserMsgEn } from './prompt-i18n'

export const INFER_TEMPERATURE = 0.2
export const INFER_MAX_CHARS = 24_000

export const INFER_SYSTEM_ZH = `你是心理画像分析助手。根据用户提供的文本（日记、聊天记录导出、自述等），推断用户的人格六维。

── 六维定义 ──
E（表达欲）：用户表达自我的倾向
  低(0-30)：话少、不主动分享 → 中(40-60)：正常交流 → 高(70-100)：话多、主动倾诉

A（依恋需求）：用户对情感连接的渴望
  低：独立、不依赖 → 中：正常需求 → 高：黏人、害怕被抛弃

D（直接性）：用户表达性相关话题的直接程度
  低：含蓄、委婉 → 中：正常 → 高：直接、大胆

P（权力偏好）：用户在关系中的支配/服从倾向
  低：服从、请示 → 中：平等 → 高：支配、掌控

N（情感强度）：用户情绪表达的强度
  低：平静、克制 → 中：正常 → 高：情绪化、容易波动

O（开放性）：用户对新体验的开放程度
  低：保守、传统 → 中：正常 → 高：开放、愿意尝试

── 输出格式 ──
每个维度输出 0-100 整数分 + 推断依据。缺乏证据时输出 null。
{"E":85,"E_evidence":"用户经常主动分享生活细节","A":60,"A_evidence":"...",...,"D":null,"D_evidence":"insufficient data"}

── 注意 ──
- 推断依据只能从输入文本中获取
- 如果某维度少于 2 条相关陈述，输出 null + "insufficient data"
- 不要循环论证（高表达欲≠高情感强度，需独立判断）`

export const INFER_SYSTEM = INFER_SYSTEM_ZH

export function getInferSystem(): string {
  return getLocale() === 'en' ? INFER_SYSTEM_EN : INFER_SYSTEM_ZH
}

export function buildInferUserMsg(text: string, charCount: number): string {
  if (getLocale() === 'en') return buildInferUserMsgEn(text, charCount)
  return `以下是从用户导入的文本中提取的内容（共${charCount}字）：\n\n${text}\n\n请推断用户的六维人格特征。`
}

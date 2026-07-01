/**
 * 计划书意图 — 纯规则（无主题实体词表）
 * 与 OpenForU Create（做 Skill/插件）、L0.5 知识整理正交。
 */

import { isPlanDocumentMetaOrComplaint, isPoorPaperCardTitle } from './paperCardTitle'

/** 用户要求生成可保存的计划书 / 规划文档 */
const PLAN_DOCUMENT_RE =
  /生成(?:一)?份.{0,24}计划|生成计划|帮我生成.{0,24}计划|做个.{0,24}计划|做个计划|做(?:一)?份.{0,24}计划|做一份计划|制定.{0,24}计划|制定计划|帮我规划|帮我计划|写个.{0,24}计划|写个计划|写一份计划|出一份计划|计划书|行程规划|规划一下|安排一下|帮我安排|排个计划|列个计划|(?:给|帮)(?:我|你).{0,12}做.{0,24}计划/u

/** OpenForU / 扩展制品（含「生成 Skill」类，非生活计划书） */
const OPENFORU_PLAN_UI_RE =
  /确认方案|部署完成|plan:deploy|OpenForU\s*Plan|工作区/u

export function wantsPlanDocument(msg: string): boolean {
  const t = msg.trim()
  if (!t) return false
  if (isPlanDocumentMetaOrComplaint(t)) return false
  if (/不要\s*计划书|别\s*计划书|不用\s*生成计划/u.test(t)) return false
  if (OPENFORU_PLAN_UI_RE.test(t)) return false
  return PLAN_DOCUMENT_RE.test(t)
}

/** 从原话剥离计划动作词，剩余为主题（由用户原话决定） */
export function extractPlanTopicFromMessage(msg: string): string {
  let t = msg.trim()
  if (!t) return '计划'

  t = t.replace(/^(?:那)?(?:请|帮我|给我|你个我|那你个我)\s*/u, '')

  const patterns = [
    /^(?:生成|制定|做|写|出)(?:一份|个|一个)?(.+?)的(?:计划|规划)(?:书)?[。！？!?]?$/u,
    /^(?:生成|制定|做|写|出)(?:一份|个|一个)?(.+?)计划(?:书)?[。！？!?]?$/u,
    /^(?:生成|制定|做|写|出)(?:一份|个)?计划(?:书)?(?:[:：关于针对]\s*)?(.+?)[。！？!?]?$/u,
    /^(?:帮我)?(?:规划|安排)(?:一下)?(?:[:：]?\s*)?(.+?)[。！？!?]?$/u,
    /^(?:行程|学习|项目)规划(?:[:：]?\s*)?(.+?)[。！？!?]?$/u,
    /^计划书(?:[:：]?\s*)?(.+?)[。！？!?]?$/u
  ]
  for (const p of patterns) {
    const m = t.match(p)
    if (m?.[1]) {
      const topic = m[1].trim().replace(/^[的地得]+/u, '')
      if (topic.length >= 2 && !isPoorPaperCardTitle(topic)) return topic.slice(0, 120)
    }
  }

  for (const kw of [
    '生成计划',
    '做个计划',
    '做一份计划',
    '制定计划',
    '帮我规划',
    '帮我计划',
    '写个计划',
    '写一份计划',
    '出一份计划',
    '计划书',
    '行程规划',
    '规划一下',
    '安排一下',
    '帮我安排',
    '排个计划',
    '列个计划'
  ]) {
    const idx = t.indexOf(kw)
    if (idx >= 0) {
      const rest = t.slice(idx + kw.length).replace(/^[：:\s，、]+/u, '').trim()
      if (rest.length >= 2 && !isPoorPaperCardTitle(rest)) return rest.slice(0, 120)
    }
  }

  const fallback = t.slice(0, 120)
  return isPoorPaperCardTitle(fallback) ? '计划' : fallback
}

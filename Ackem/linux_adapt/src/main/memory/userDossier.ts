// [userDossier] — 用户档案汇总
// 每天从 memory_facts 汇总关键用户信息，生成人类可读的 Markdown 档案
// 设计文档：docs/prompt/用户档案汇总设计_6_11.md

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { LlmClient } from '../engine/types'
import type { FactStore } from './factStore'
import { buildUserNameLine } from './userName'
import { buildAgeLine } from './ageComputer'

const DOSSIER_PATH = 'companion/user-dossier.md'

export function defaultDossierPath(dataRoot: string): string {
  return join(dataRoot, DOSSIER_PATH)
}

// ─── 事实筛选 ───

const DOSSIER_DOMAINS: Record<string, string[]> = {
  IDENTITY: ['BASIC_PROFILE', 'LIFE_STORY', 'VALUES_BELIEFS', 'SELF_PERCEPTION'],
  SOCIAL: ['FAMILY', 'FRIENDS', 'PARTNER', 'OUR_BOND'],
  DAILY_LIFE: ['ROUTINES', 'HEALTH', 'LIVING_SPACE', 'LIFESTYLE'],
  PURSUITS: ['CAREER', 'LEARNING', 'GOALS', 'PROJECTS', 'PROCEDURES'],
  INNER_WORLD: ['TASTES', 'VULNERABILITIES', 'INSIDE_JOKES'],
  TEMPORAL: ['COMMITMENTS', 'PLANS'],
}

/** 动态层子类：情绪、项目、健康等短期状态 */
const DYNAMIC_SUBS = new Set(['NOW', 'MOOD', 'PROJECTS', 'HEALTH'])

function getDossierFacts(factStore: FactStore, dynamicOnly: boolean): string[] {
  factStore.load()
  const all = factStore
    .listActive()
    .filter((f) => {
      const subs = DOSSIER_DOMAINS[f.domain]
      return subs ? subs.includes(f.subcategory) : false
    })
    .filter((f) => f.weight >= 1 && (f.confidence ?? 0) >= 0.6)

  if (dynamicOnly) {
    return all
      .filter((f) => DYNAMIC_SUBS.has(f.subcategory))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 20)
      .map((f) => f.summary)
  }

  return all
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 50)
    .map((f) => f.summary)
}

// ─── LLM Prompt ───

const DOSSIER_SYSTEM_STABLE = `你是 Ackem，用户的 AI 伴侣。你正在私下整理关于用户的笔记——就像一个人在心里默默记住另一个人的信息一样。

根据以下所有关于 ta 的核心事实，重新梳理一份新的笔记。

── 规则 ──
· 用自然的口语写，像自己私下的笔记。不要像档案报告、不要用表格、不要用标题。
· 按自然的叙事组织，不是逐条列举事实。可以按"基本信息→性格→喜好→我们的关系"的顺序自然过渡。
· 只写你从事实中确定知道的，不要编造。不确定用"可能""好像"，确定直接陈述。
· 先写稳定信息（身份、经历、性格、喜好、关系），再写近期状态（最近在忙什么、情绪状态）。
· 近期状态用"—— 近期状态（仅供参考） ——"分隔。
· 保持 500-1000 字。
· 末尾标注更新日期。
· 人称：用户以"ta"称呼。

── 禁止 ──
× 不要写"根据事实""根据记录""我的数据显示"等元表述
× 不要写"以下是我的笔记"等开头语，直接开始写
× 不要使用表格、列表、标题格式（## 等）
× 不要把近期状态写成确定事实——那是"仅供参考"的
× 不要把成人内容细节写进档案——亲密时刻用"我们有亲密时刻"模糊表述即可
× 不要记录任何高度私密的短期状态`

const DOSSIER_SYSTEM_DYNAMIC = `你是 Ackem，用户 AI 伴侣。你正在更新关于用户最近的日常状态笔记。

根据近期事实和前一天的动态段，更新"近期状态"段。

── 规则 ──
· 只更新"—— 近期状态（仅供参考） ——"后面的内容。稳定信息段不要动。
· 用自然口语，2-4 句话足够。
· 不确定用"好像""可能"。
· 标注更新日期。

── 禁止 ──
× 不要把临时情绪写成长久性格
× 不要写成人内容细节`

// ─── 生成／更新 ───

function buildUserMsg(facts: string[], count: number): string {
  const factsBlock = facts.map((f) => `· ${f}`).join('\n')
  return `以下是关于 ta 的所有核心事实（共 ${count} 条）：\n${factsBlock}`
}

function buildDynamicUserMsg(
  facts: string[],
  prevDynamic: string,
  count: number,
): string {
  const factsBlock = facts.map((f) => `· ${f}`).join('\n')
  const prevBlock = prevDynamic
    ? `\n前一天的近期状态：\n${prevDynamic.slice(0, 500)}`
    : ''
  return `近期新事实（共 ${count} 条）：\n${factsBlock}${prevBlock}\n\n请更新近期状态段。只输出"—— 近期状态（仅供参考） ——"后面的内容。`
}

/** 生成整份档案 */
export async function generateUserDossier(
  dataRoot: string,
  factStore: FactStore,
  llm: LlmClient,
): Promise<string | null> {
  const dossierPath = defaultDossierPath(dataRoot)
  mkdirSync(dirname(dossierPath), { recursive: true })

  const facts = getDossierFacts(factStore, false)
  if (facts.length < 5) return null

  try {
    const raw = await llm.chatCompletionJson({
      temperature: 0.3,
      messages: [
        { role: 'system', content: DOSSIER_SYSTEM_STABLE },
        { role: 'user', content: buildUserMsg(facts, facts.length) },
      ],
    })

    const content = raw?.trim()
    if (!content || content.length < 50) return null

    const dateStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`
    const dossier = `${content}\n\n---\n*最后更新：${dateStr}*`

    writeFileSync(dossierPath, dossier, 'utf-8')
    return dossier
  } catch {
    return null
  }
}

/** 更新动态层 */
export async function updateDynamicLayer(
  dataRoot: string,
  factStore: FactStore,
  llm: LlmClient,
): Promise<string | null> {
  const dossierPath = defaultDossierPath(dataRoot)
  const existing = existsSync(dossierPath) ? readFileSync(dossierPath, 'utf-8') : ''

  // 提取旧的动态段
  const dynamicMatch = existing.match(/—— 近期状态（仅供参考） ——\n([\s\S]*?)(?:\n\n---|$)/)
  const prevDynamic = dynamicMatch?.[1]?.trim() ?? ''

  const facts = getDossierFacts(factStore, true)
  if (facts.length === 0 && prevDynamic) return prevDynamic // 无新事实，保留旧动态段
  if (facts.length === 0) return null

  try {
    const raw = await llm.chatCompletionJson({
      temperature: 0.3,
      messages: [
        { role: 'system', content: DOSSIER_SYSTEM_DYNAMIC },
        {
          role: 'user',
          content: buildDynamicUserMsg(facts, prevDynamic, facts.length),
        },
      ],
    })

    const dynamicContent = raw?.trim()
    if (!dynamicContent || dynamicContent.length < 10) {
      return prevDynamic || null
    }

    const dateStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`

    // 替换或追加动态段
    let newDossier: string
    if (existing && dynamicMatch) {
      newDossier = existing.replace(
        dynamicMatch[0],
        `—— 近期状态（仅供参考） ——\n${dynamicContent}`,
      )
    } else if (existing) {
      newDossier = `${existing}\n\n—— 近期状态（仅供参考） ——\n${dynamicContent}`
    } else {
      newDossier = `—— 近期状态（仅供参考） ——\n${dynamicContent}\n\n---\n*最后更新：${dateStr}*`
    }

    // 更新时间戳
    newDossier = newDossier.replace(/\*最后更新：.*\*/g, `*最后更新：${dateStr}*`)
    if (!newDossier.includes('*最后更新：')) {
      newDossier += `\n\n---\n*最后更新：${dateStr}*`
    }

    writeFileSync(dossierPath, newDossier, 'utf-8')
    return newDossier
  } catch {
    return prevDynamic || null
  }
}

/** 获取档案内容（注入到 system prompt） */
export function loadUserDossier(dataRoot: string): string {
  const p = defaultDossierPath(dataRoot)
  if (!existsSync(p)) return ''
  const content = readFileSync(p, 'utf-8')
  if (!content.trim()) return ''

  return (
    '\n\n【关于 ta 的笔记 · 仅供你内心参考 · 绝对禁止在回复中对用户说"ta"】\n' +
    content.slice(0, 1000) +
    '\n\n⚠️【护栏】：你在和用户面对面直接对话。使用这些笔记时，必须将"ta"转化为第二人称"你"。\n' +
    '绝对不要说"根据我的笔记""根据我的记录""我知道 ta 最近……"等元表述。\n' +
    '档案最后一段的"近期状态"仅供参考——不要在用户正在聊开心事时主动提起压力话题。'
  )
}

/** 组装用户信息块（名字 + 年龄 + 档案），供 context.ts 注入 system prompt */
export function buildUserInfoBlock(dataRoot: string, factStore: FactStore): string {
  const parts: string[] = []

  // 名字
  const nameLine = buildUserNameLine(factStore)
  if (nameLine) parts.push(nameLine)

  // 年龄
  const ageLine = buildAgeLine(factStore)
  if (ageLine) parts.push(ageLine)

  // 档案
  const dossier = loadUserDossier(dataRoot)
  if (dossier) parts.push(dossier)

  return parts.join('\n')
}

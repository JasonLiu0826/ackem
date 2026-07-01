// [archiveExporter] — 记忆档案导出器
// 职责：将 FactStore + EpisodicStore 导出为人类可读的 markdown 档案
// 按领域/子类分目录组织，用户可像翻阅档案库一样浏览记忆
// 引用：./factStore, ./episodicStore, ./taxonomy

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatConfidencePercent } from '../../shared/confidence'
import type { FactStore } from './factStore'
import type { EpisodicStore } from './episodicStore'

const DOMAIN_ZH: Record<string, string> = {
  IDENTITY: '自我与身份',
  SOCIAL: '关系与社交',
  DAILY_LIFE: '日常生活',
  PURSUITS: '事业与成长',
  INNER_WORLD: '内心世界',
  TEMPORAL: '当下与未来'
}

const SUBCAT_ZH: Record<string, string> = {
  BASIC_PROFILE: '基本信息',
  LIFE_STORY: '人生经历',
  VALUES_BELIEFS: '价值观与信念',
  SELF_PERCEPTION: '自我认知',
  OUR_BOND: '我们的羁绊',
  FAMILY: '家庭',
  FRIENDS: '朋友',
  PARTNER: '伴侣',
  ROUTINES: '日常习惯',
  HEALTH: '身心健康',
  LIVING_SPACE: '居住环境',
  LIFESTYLE: '生活方式',
  CAREER: '事业与工作',
  LEARNING: '学习与技能',
  GOALS: '目标与梦想',
  PROJECTS: '项目与创作',
  PROCEDURES: '做事方式',
  MOOD: '情绪状态',
  TASTES: '喜好与品味',
  VULNERABILITIES: '脆弱与秘密',
  INSIDE_JOKES: '默契与暗号',
  NOW: '当下状态',
  COMMITMENTS: '承诺与约定',
  PLANS: '近期计划',
  WORLD: '外部世界'
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function escapeMd(text: string): string {
  return text.replace(/\*/g, '\\*').replace(/_/g, '\\_').replace(/#/g, '\\#')
}

export interface ExportStats {
  filesWritten: number
  factsExported: number
  episodesExported: number
  coreCount: number
}

export function exportMemoryArchive(
  dataRoot: string,
  factStore: FactStore,
  episodicStore?: EpisodicStore
): ExportStats {
  const archiveDir = join(dataRoot, 'memory', 'archive')
  mkdirSync(archiveDir, { recursive: true })

  factStore.load()
  const active = factStore.listActive()
  const coreFacts = factStore.getCoreFacts()
  const stats: ExportStats = { filesWritten: 0, factsExported: 0, episodesExported: 0, coreCount: coreFacts.length }

  // 按领域→子类分组
  const grouped = new Map<string, Map<string, typeof active>>()
  for (const d of Object.keys(DOMAIN_ZH)) {
    const subMap = new Map<string, typeof active>()
    for (const f of active) {
      if (f.domain !== d) continue
      const sub = f.subcategory
      if (!subMap.has(sub)) subMap.set(sub, [])
      subMap.get(sub)!.push(f)
    }
    grouped.set(d, subMap)
  }

  // 为每个子类生成 .md 文件
  for (const [domain, subMap] of grouped) {
    const domainDir = join(archiveDir, domain)
    mkdirSync(domainDir, { recursive: true })
    let domainHasContent = false

    for (const [subcat, facts] of subMap) {
      if (facts.length === 0) continue
      domainHasContent = true

      const coreInFile = facts.filter(f => f.tier === 'core')
      let md = `# ${SUBCAT_ZH[subcat] || subcat}\n\n`
      md += `> 领域：${DOMAIN_ZH[domain] || domain} | `
      md += `活跃事实：${facts.length} 条`
      if (coreInFile.length > 0) md += ` | 核心记忆：${coreInFile.length} 条`
      md += `\n> 最后更新：${new Date().toISOString().slice(0, 16).replace('T', ' ')}\n\n`
      md += `---\n\n`

      for (const f of facts) {
        const prefix = f.tier === 'core' ? '★ ' : ''
        const layer = f.factLayer === 'consolidated' ? ' [整合洞察]' : ''
        md += `## ${prefix}${escapeMd(f.subject)}${layer}\n\n`
        md += `> 权重：${f.weight.toFixed(1)} | 置信度：${formatConfidencePercent(f.confidence)}`
        if (f.tier === 'core') md += ` | 核心记忆`
        md += `\n> 创建：${formatDate(f.createdAt)} | 更新：${formatDate(f.updatedAt)}`
        if (f.emotionalContext) {
          const emo = f.emotionalContext
          const valenceLabel = emo.valence > 0.3 ? '正向' : emo.valence < -0.3 ? '负向' : '中性'
          md += `\n> 记录时情绪：${valenceLabel} | 信任度：${emo.trust} | 关系阶段：${emo.relStage}`
        }
        if (f.triggers.length > 0) {
          md += `\n> 触发词：${f.triggers.join('、')}`
        }
        md += `\n\n${escapeMd(f.summary)}\n\n---\n\n`
        stats.factsExported++
      }

      const filePath = join(domainDir, `${subcat}.md`)
      writeFileSync(filePath, md, 'utf-8')
      stats.filesWritten++
    }
  }

  // 情节记忆时间线
  if (episodicStore) {
    episodicStore.load()
    const episodes = episodicStore.listAll()
    if (episodes.length > 0) {
      let epMd = `# 情节记忆时间线\n\n> 共 ${episodes.length} 段对话故事\n\n---\n\n`
      const sorted = [...episodes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      for (const ep of sorted) {
        const intensityBar = '█'.repeat(Math.round(ep.emotionalIntensity * 10)) + '░'.repeat(10 - Math.round(ep.emotionalIntensity * 10))
        epMd += `## ${formatDate(ep.createdAt)}\n\n`
        epMd += `> 情感强度：${intensityBar} (${(ep.emotionalIntensity*100).toFixed(0)}%) | 主导情绪：${ep.dominantEmotion}\n`
        if (ep.keywords.length > 0) {
          epMd += `> 关键词：${ep.keywords.join('、')}\n`
        }
        epMd += `> 第 ${ep.startTurn}-${ep.endTurn} 轮\n\n`
        epMd += `${escapeMd(ep.summary)}\n\n---\n\n`
        stats.episodesExported++
      }
      writeFileSync(join(archiveDir, '情节记忆时间线.md'), epMd, 'utf-8')
      stats.filesWritten++
    }
  }

  // 核心记忆精选
  if (coreFacts.length > 0) {
    let coreMd = `# 核心记忆精选\n\n> ${coreFacts.length} 条始终在场的核心记忆，按权重排序\n\n---\n\n`
    const sorted = [...coreFacts].sort((a, b) => b.weight - a.weight)
    for (const f of sorted) {
      coreMd += `## ★ ${escapeMd(f.subject)}\n\n`
      coreMd += `> 权重：${f.weight.toFixed(1)} | 置信度：${formatConfidencePercent(f.confidence)} | ${SUBCAT_ZH[f.subcategory] || f.subcategory}\n\n`
      coreMd += `${escapeMd(f.summary)}\n\n---\n\n`
    }
    writeFileSync(join(archiveDir, '核心记忆精选.md'), coreMd, 'utf-8')
    stats.filesWritten++
  }

  // 总索引 README
  let readme = `# 🗂️ Ackem 记忆档案\n\n`
  readme += `> 自动生成 | ${new Date().toISOString().slice(0, 16).replace('T', ' ')}\n`
  readme += `> 总事实：${active.length} 条 | 核心记忆：${coreFacts.length} 条 | 情节：${stats.episodesExported} 段\n\n`
  readme += `---\n\n`
  readme += `## 如何使用这个档案\n\n`
  readme += `- 这是 Ackem 对你的所有记忆的结构化归档\n`
  readme += `- 按领域分目录，每个子类一个 .md 文件\n`
  readme += `- 你可以直接打开任何文件阅读、修改\n`
  readme += `- 修改后，在 Ackem 中点击「重建索引」即可让修改生效\n`
  readme += `- ★ 标记的条目是伴侣的「核心记忆」——始终铭记在心\n`
  readme += `- **需要 Ackem 记住某事时，请在对话里明确说「请帮我记住……」**（例如：「请帮我记住：我妈妈生日是 10 月 16 日」）。Ackem 会按你的原话写入记忆，具体归类与整理由系统在后台完成\n\n`
  readme += `---\n\n## 目录\n\n`

  for (const [domain, subMap] of grouped) {
    let domainFacts = 0
    for (const facts of subMap.values()) domainFacts += facts.length
    if (domainFacts === 0) continue
    readme += `### ${DOMAIN_ZH[domain] || domain}（${domainFacts} 条）\n\n`
    for (const [subcat, facts] of subMap) {
      if (facts.length === 0) continue
      const coreCount = facts.filter(f => f.tier === 'core').length
      const coreLabel = coreCount > 0 ? ` ⭐×${coreCount}` : ''
      readme += `- [${SUBCAT_ZH[subcat] || subcat}](${domain}/${subcat}.md) — ${facts.length} 条${coreLabel}\n`
    }
    readme += '\n'
  }

  if (stats.episodesExported > 0) {
    readme += `### 📖 情节记忆\n\n`
    readme += `- [情节记忆时间线](情节记忆时间线.md) — ${stats.episodesExported} 段\n\n`
  }
  if (coreFacts.length > 0) {
    readme += `### ⭐ 核心记忆\n\n`
    readme += `- [核心记忆精选](核心记忆精选.md) — ${coreFacts.length} 条\n\n`
  }

  writeFileSync(join(archiveDir, 'README.md'), readme, 'utf-8')
  stats.filesWritten++

  // 写入元数据，供前端展示"上次导出时间"
  writeFileSync(
    join(archiveDir, '_meta.json'),
    JSON.stringify({
      lastExportAt: new Date().toISOString(),
      factsExported: stats.factsExported,
      episodesExported: stats.episodesExported,
      coreCount: stats.coreCount,
      filesWritten: stats.filesWritten
    }),
    'utf-8'
  )

  return stats
}

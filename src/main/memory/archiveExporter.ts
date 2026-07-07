// [archiveExporter] 鈥?璁板繂妗ｆ瀵煎嚭鍣?
// 鑱岃矗锛氬皢 FactStore + EpisodicStore 瀵煎嚭涓轰汉绫诲彲璇荤殑 markdown 妗ｆ
// 鎸夐鍩?瀛愮被鍒嗙洰褰曠粍缁囷紝鐢ㄦ埛鍙儚缈婚槄妗ｆ搴撲竴鏍锋祻瑙堣蹇?
// 寮曠敤锛?/factStore, ./episodicStore, ./taxonomy

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatConfidencePercent } from '../../shared/confidence'
import type { FactStore } from './factStore'
import type { EpisodicStore } from './episodicStore'

const DOMAIN_ZH: Record<string, string> = {
  IDENTITY: '鑷垜涓庤韩浠?,
  SOCIAL: '鍏崇郴涓庣ぞ浜?,
  DAILY_LIFE: '鏃ュ父鐢熸椿',
  PURSUITS: '浜嬩笟涓庢垚闀?,
  INNER_WORLD: '鍐呭績涓栫晫',
  TEMPORAL: '褰撲笅涓庢湭鏉?
}

const SUBCAT_ZH: Record<string, string> = {
  BASIC_PROFILE: '鍩烘湰淇℃伅',
  LIFE_STORY: '浜虹敓缁忓巻',
  VALUES_BELIEFS: '浠峰€艰涓庝俊蹇?,
  SELF_PERCEPTION: '鑷垜璁ょ煡',
  OUR_BOND: '鎴戜滑鐨勭緛缁?,
  FAMILY: '瀹跺涵',
  FRIENDS: '鏈嬪弸',
  PARTNER: '浼翠荆',
  ROUTINES: '鏃ュ父涔犳儻',
  HEALTH: '韬績鍋ュ悍',
  LIVING_SPACE: '灞呬綇鐜',
  LIFESTYLE: '鐢熸椿鏂瑰紡',
  CAREER: '浜嬩笟涓庡伐浣?,
  LEARNING: '瀛︿範涓庢妧鑳?,
  GOALS: '鐩爣涓庢ⅵ鎯?,
  PROJECTS: '椤圭洰涓庡垱浣?,
  PROCEDURES: '鍋氫簨鏂瑰紡',
  MOOD: '鎯呯华鐘舵€?,
  TASTES: '鍠滃ソ涓庡搧鍛?,
  VULNERABILITIES: '鑴嗗急涓庣瀵?,
  INSIDE_JOKES: '榛樺涓庢殫鍙?,
  NOW: '褰撲笅鐘舵€?,
  COMMITMENTS: '鎵胯涓庣害瀹?,
  PLANS: '杩戞湡璁″垝',
  WORLD: '澶栭儴涓栫晫'
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

  // 鎸夐鍩熲啋瀛愮被鍒嗙粍
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

  // 涓烘瘡涓瓙绫荤敓鎴?.md 鏂囦欢
  for (const [domain, subMap] of grouped) {
    const domainDir = join(archiveDir, domain)
    mkdirSync(domainDir, { recursive: true })
    let domainHasContent = false

    for (const [subcat, facts] of subMap) {
      if (facts.length === 0) continue
      domainHasContent = true

      const coreInFile = facts.filter(f => f.tier === 'core')
      let md = `# ${SUBCAT_ZH[subcat] || subcat}\n\n`
      md += `> 棰嗗煙锛?{DOMAIN_ZH[domain] || domain} | `
      md += `娲昏穬浜嬪疄锛?{facts.length} 鏉
      if (coreInFile.length > 0) md += ` | 鏍稿績璁板繂锛?{coreInFile.length} 鏉
      md += `\n> 鏈€鍚庢洿鏂帮細${new Date().toISOString().slice(0, 16).replace('T', ' ')}\n\n`
      md += `---\n\n`

      for (const f of facts) {
        const prefix = f.tier === 'core' ? '鈽?' : ''
        const layer = f.factLayer === 'consolidated' ? ' [鏁村悎娲炲療]' : ''
        md += `## ${prefix}${escapeMd(f.subject)}${layer}\n\n`
        md += `> 鏉冮噸锛?{f.weight.toFixed(1)} | 缃俊搴︼細${formatConfidencePercent(f.confidence)}`
        if (f.tier === 'core') md += ` | 鏍稿績璁板繂`
        md += `\n> 鍒涘缓锛?{formatDate(f.createdAt)} | 鏇存柊锛?{formatDate(f.updatedAt)}`
        if (f.emotionalContext) {
          const emo = f.emotionalContext
          const valenceLabel = emo.valence > 0.3 ? '姝ｅ悜' : emo.valence < -0.3 ? '璐熷悜' : '涓€?
          md += `\n> 璁板綍鏃舵儏缁細${valenceLabel} | 淇′换搴︼細${emo.trust} | 鍏崇郴闃舵锛?{emo.relStage}`
        }
        if (f.triggers.length > 0) {
          md += `\n> 瑙﹀彂璇嶏細${f.triggers.join('銆?)}`
        }
        md += `\n\n${escapeMd(f.summary)}\n\n---\n\n`
        stats.factsExported++
      }

      const filePath = join(domainDir, `${subcat}.md`)
      writeFileSync(filePath, md, 'utf-8')
      stats.filesWritten++
    }
  }

  // 鎯呰妭璁板繂鏃堕棿绾?
  if (episodicStore) {
    episodicStore.load()
    const episodes = episodicStore.listAll()
    if (episodes.length > 0) {
      let epMd = `# 鎯呰妭璁板繂鏃堕棿绾縗n\n> 鍏?${episodes.length} 娈靛璇濇晠浜媆n\n---\n\n`
      const sorted = [...episodes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      for (const ep of sorted) {
        const intensityBar = '鈻?.repeat(Math.round(ep.emotionalIntensity * 10)) + '鈻?.repeat(10 - Math.round(ep.emotionalIntensity * 10))
        epMd += `## ${formatDate(ep.createdAt)}\n\n`
        epMd += `> 鎯呮劅寮哄害锛?{intensityBar} (${(ep.emotionalIntensity*100).toFixed(0)}%) | 涓诲鎯呯华锛?{ep.dominantEmotion}\n`
        if (ep.keywords.length > 0) {
          epMd += `> 鍏抽敭璇嶏細${ep.keywords.join('銆?)}\n`
        }
        epMd += `> 绗?${ep.startTurn}-${ep.endTurn} 杞甛n\n`
        epMd += `${escapeMd(ep.summary)}\n\n---\n\n`
        stats.episodesExported++
      }
      writeFileSync(join(archiveDir, '鎯呰妭璁板繂鏃堕棿绾?md'), epMd, 'utf-8')
      stats.filesWritten++
    }
  }

  // 鏍稿績璁板繂绮鹃€?
  if (coreFacts.length > 0) {
    let coreMd = `# 鏍稿績璁板繂绮鹃€塡n\n> ${coreFacts.length} 鏉″缁堝湪鍦虹殑鏍稿績璁板繂锛屾寜鏉冮噸鎺掑簭\n\n---\n\n`
    const sorted = [...coreFacts].sort((a, b) => b.weight - a.weight)
    for (const f of sorted) {
      coreMd += `## 鈽?${escapeMd(f.subject)}\n\n`
      coreMd += `> 鏉冮噸锛?{f.weight.toFixed(1)} | 缃俊搴︼細${formatConfidencePercent(f.confidence)} | ${SUBCAT_ZH[f.subcategory] || f.subcategory}\n\n`
      coreMd += `${escapeMd(f.summary)}\n\n---\n\n`
    }
    writeFileSync(join(archiveDir, '鏍稿績璁板繂绮鹃€?md'), coreMd, 'utf-8')
    stats.filesWritten++
  }

  // 鎬荤储寮?README
  let readme = `# 馃梻锔?Ackem 璁板繂妗ｆ\n\n`
  readme += `> 鑷姩鐢熸垚 | ${new Date().toISOString().slice(0, 16).replace('T', ' ')}\n`
  readme += `> 鎬讳簨瀹烇細${active.length} 鏉?| 鏍稿績璁板繂锛?{coreFacts.length} 鏉?| 鎯呰妭锛?{stats.episodesExported} 娈礬n\n`
  readme += `---\n\n`
  readme += `## 濡備綍浣跨敤杩欎釜妗ｆ\n\n`
  readme += `- 杩欐槸 Ackem 瀵逛綘鐨勬墍鏈夎蹇嗙殑缁撴瀯鍖栧綊妗n`
  readme += `- 鎸夐鍩熷垎鐩綍锛屾瘡涓瓙绫讳竴涓?.md 鏂囦欢\n`
  readme += `- 浣犲彲浠ョ洿鎺ユ墦寮€浠讳綍鏂囦欢闃呰銆佷慨鏀筡n`
  readme += `- 淇敼鍚庯紝鍦?Ackem 涓偣鍑汇€岄噸寤虹储寮曘€嶅嵆鍙淇敼鐢熸晥\n`
  readme += `- 鈽?鏍囪鐨勬潯鐩槸浼翠荆鐨勩€屾牳蹇冭蹇嗐€嶁€斺€斿缁堥摥璁板湪蹇僜n`
  readme += `- **闇€瑕?Ackem 璁颁綇鏌愪簨鏃讹紝璇峰湪瀵硅瘽閲屾槑纭銆岃甯垜璁颁綇鈥︹€︺€?*锛堜緥濡傦細銆岃甯垜璁颁綇锛氭垜濡堝鐢熸棩鏄?10 鏈?16 鏃ャ€嶏級銆侭ritney 浼氭寜浣犵殑鍘熻瘽鍐欏叆璁板繂锛屽叿浣撳綊绫讳笌鏁寸悊鐢辩郴缁熷湪鍚庡彴瀹屾垚\n\n`
  readme += `---\n\n## 鐩綍\n\n`

  for (const [domain, subMap] of grouped) {
    let domainFacts = 0
    for (const facts of subMap.values()) domainFacts += facts.length
    if (domainFacts === 0) continue
    readme += `### ${DOMAIN_ZH[domain] || domain}锛?{domainFacts} 鏉★級\n\n`
    for (const [subcat, facts] of subMap) {
      if (facts.length === 0) continue
      const coreCount = facts.filter(f => f.tier === 'core').length
      const coreLabel = coreCount > 0 ? ` 猸惷?{coreCount}` : ''
      readme += `- [${SUBCAT_ZH[subcat] || subcat}](${domain}/${subcat}.md) 鈥?${facts.length} 鏉?{coreLabel}\n`
    }
    readme += '\n'
  }

  if (stats.episodesExported > 0) {
    readme += `### 馃摉 鎯呰妭璁板繂\n\n`
    readme += `- [鎯呰妭璁板繂鏃堕棿绾縘(鎯呰妭璁板繂鏃堕棿绾?md) 鈥?${stats.episodesExported} 娈礬n\n`
  }
  if (coreFacts.length > 0) {
    readme += `### 猸?鏍稿績璁板繂\n\n`
    readme += `- [鏍稿績璁板繂绮鹃€塢(鏍稿績璁板繂绮鹃€?md) 鈥?${coreFacts.length} 鏉n\n`
  }

  writeFileSync(join(archiveDir, 'README.md'), readme, 'utf-8')
  stats.filesWritten++

  // 鍐欏叆鍏冩暟鎹紝渚涘墠绔睍绀?涓婃瀵煎嚭鏃堕棿"
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

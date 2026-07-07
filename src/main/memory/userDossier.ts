// [userDossier] 鈥?鐢ㄦ埛妗ｆ姹囨€?
// 姣忓ぉ浠?memory_facts 姹囨€诲叧閿敤鎴蜂俊鎭紝鐢熸垚浜虹被鍙鐨?Markdown 妗ｆ
// 璁捐鏂囨。锛歞ocs/prompt/鐢ㄦ埛妗ｆ姹囨€昏璁6_11.md

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

// 鈹€鈹€鈹€ 浜嬪疄绛涢€?鈹€鈹€鈹€

const DOSSIER_DOMAINS: Record<string, string[]> = {
  IDENTITY: ['BASIC_PROFILE', 'LIFE_STORY', 'VALUES_BELIEFS', 'SELF_PERCEPTION'],
  SOCIAL: ['FAMILY', 'FRIENDS', 'PARTNER', 'OUR_BOND'],
  DAILY_LIFE: ['ROUTINES', 'HEALTH', 'LIVING_SPACE', 'LIFESTYLE'],
  PURSUITS: ['CAREER', 'LEARNING', 'GOALS', 'PROJECTS', 'PROCEDURES'],
  INNER_WORLD: ['TASTES', 'VULNERABILITIES', 'INSIDE_JOKES'],
  TEMPORAL: ['COMMITMENTS', 'PLANS'],
}

/** 鍔ㄦ€佸眰瀛愮被锛氭儏缁€侀」鐩€佸仴搴风瓑鐭湡鐘舵€?*/
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

// 鈹€鈹€鈹€ LLM Prompt 鈹€鈹€鈹€

const DOSSIER_SYSTEM_STABLE = `浣犳槸 Ackem锛岀敤鎴风殑 AI 浼翠荆銆備綘姝ｅ湪绉佷笅鏁寸悊鍏充簬鐢ㄦ埛鐨勭瑪璁扳€斺€斿氨鍍忎竴涓汉鍦ㄥ績閲岄粯榛樿浣忓彟涓€涓汉鐨勪俊鎭竴鏍枫€?

鏍规嵁浠ヤ笅鎵€鏈夊叧浜?ta 鐨勬牳蹇冧簨瀹烇紝閲嶆柊姊崇悊涓€浠芥柊鐨勭瑪璁般€?

鈹€鈹€ 瑙勫垯 鈹€鈹€
路 鐢ㄨ嚜鐒剁殑鍙ｈ鍐欙紝鍍忚嚜宸辩涓嬬殑绗旇銆備笉瑕佸儚妗ｆ鎶ュ憡銆佷笉瑕佺敤琛ㄦ牸銆佷笉瑕佺敤鏍囬銆?
路 鎸夎嚜鐒剁殑鍙欎簨缁勭粐锛屼笉鏄€愭潯鍒椾妇浜嬪疄銆傚彲浠ユ寜"鍩烘湰淇℃伅鈫掓€ф牸鈫掑枩濂解啋鎴戜滑鐨勫叧绯?鐨勯『搴忚嚜鐒惰繃娓°€?
路 鍙啓浣犱粠浜嬪疄涓‘瀹氱煡閬撶殑锛屼笉瑕佺紪閫犮€備笉纭畾鐢?鍙兘""濂藉儚"锛岀‘瀹氱洿鎺ラ檲杩般€?
路 鍏堝啓绋冲畾淇℃伅锛堣韩浠姐€佺粡鍘嗐€佹€ф牸銆佸枩濂姐€佸叧绯伙級锛屽啀鍐欒繎鏈熺姸鎬侊紙鏈€杩戝湪蹇欎粈涔堛€佹儏缁姸鎬侊級銆?
路 杩戞湡鐘舵€佺敤"鈥斺€?杩戞湡鐘舵€侊紙浠呬緵鍙傝€冿級 鈥斺€?鍒嗛殧銆?
路 淇濇寔 500-1000 瀛椼€?
路 鏈熬鏍囨敞鏇存柊鏃ユ湡銆?
路 浜虹О锛氱敤鎴蜂互"ta"绉板懠銆?

鈹€鈹€ 绂佹 鈹€鈹€
脳 涓嶈鍐?鏍规嵁浜嬪疄""鏍规嵁璁板綍""鎴戠殑鏁版嵁鏄剧ず"绛夊厓琛ㄨ堪
脳 涓嶈鍐?浠ヤ笅鏄垜鐨勭瑪璁?绛夊紑澶磋锛岀洿鎺ュ紑濮嬪啓
脳 涓嶈浣跨敤琛ㄦ牸銆佸垪琛ㄣ€佹爣棰樻牸寮忥紙## 绛夛級
脳 涓嶈鎶婅繎鏈熺姸鎬佸啓鎴愮‘瀹氫簨瀹炩€斺€旈偅鏄?浠呬緵鍙傝€?鐨?
脳 涓嶈鎶婃垚浜哄唴瀹圭粏鑺傚啓杩涙。妗堚€斺€斾翰瀵嗘椂鍒荤敤"鎴戜滑鏈変翰瀵嗘椂鍒?妯＄硦琛ㄨ堪鍗冲彲
脳 涓嶈璁板綍浠讳綍楂樺害绉佸瘑鐨勭煭鏈熺姸鎬乣

const DOSSIER_SYSTEM_DYNAMIC = `浣犳槸 Ackem锛岀敤鎴?AI 浼翠荆銆備綘姝ｅ湪鏇存柊鍏充簬鐢ㄦ埛鏈€杩戠殑鏃ュ父鐘舵€佺瑪璁般€?

鏍规嵁杩戞湡浜嬪疄鍜屽墠涓€澶╃殑鍔ㄦ€佹锛屾洿鏂?杩戞湡鐘舵€?娈点€?

鈹€鈹€ 瑙勫垯 鈹€鈹€
路 鍙洿鏂?鈥斺€?杩戞湡鐘舵€侊紙浠呬緵鍙傝€冿級 鈥斺€?鍚庨潰鐨勫唴瀹广€傜ǔ瀹氫俊鎭涓嶈鍔ㄣ€?
路 鐢ㄨ嚜鐒跺彛璇紝2-4 鍙ヨ瘽瓒冲銆?
路 涓嶇‘瀹氱敤"濂藉儚""鍙兘"銆?
路 鏍囨敞鏇存柊鏃ユ湡銆?

鈹€鈹€ 绂佹 鈹€鈹€
脳 涓嶈鎶婁复鏃舵儏缁啓鎴愰暱涔呮€ф牸
脳 涓嶈鍐欐垚浜哄唴瀹圭粏鑺俙

// 鈹€鈹€鈹€ 鐢熸垚锛忔洿鏂?鈹€鈹€鈹€

function buildUserMsg(facts: string[], count: number): string {
  const factsBlock = facts.map((f) => `路 ${f}`).join('\n')
  return `浠ヤ笅鏄叧浜?ta 鐨勬墍鏈夋牳蹇冧簨瀹烇紙鍏?${count} 鏉★級锛歕n${factsBlock}`
}

function buildDynamicUserMsg(
  facts: string[],
  prevDynamic: string,
  count: number,
): string {
  const factsBlock = facts.map((f) => `路 ${f}`).join('\n')
  const prevBlock = prevDynamic
    ? `\n鍓嶄竴澶╃殑杩戞湡鐘舵€侊細\n${prevDynamic.slice(0, 500)}`
    : ''
  return `杩戞湡鏂颁簨瀹烇紙鍏?${count} 鏉★級锛歕n${factsBlock}${prevBlock}\n\n璇锋洿鏂拌繎鏈熺姸鎬佹銆傚彧杈撳嚭"鈥斺€?杩戞湡鐘舵€侊紙浠呬緵鍙傝€冿級 鈥斺€?鍚庨潰鐨勫唴瀹广€俙
}

/** 鐢熸垚鏁翠唤妗ｆ */
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
    const dossier = `${content}\n\n---\n*鏈€鍚庢洿鏂帮細${dateStr}*`

    writeFileSync(dossierPath, dossier, 'utf-8')
    return dossier
  } catch {
    return null
  }
}

/** 鏇存柊鍔ㄦ€佸眰 */
export async function updateDynamicLayer(
  dataRoot: string,
  factStore: FactStore,
  llm: LlmClient,
): Promise<string | null> {
  const dossierPath = defaultDossierPath(dataRoot)
  const existing = existsSync(dossierPath) ? readFileSync(dossierPath, 'utf-8') : ''

  // 鎻愬彇鏃х殑鍔ㄦ€佹
  const dynamicMatch = existing.match(/鈥斺€?杩戞湡鐘舵€侊紙浠呬緵鍙傝€冿級 鈥斺€擻n([\s\S]*?)(?:\n\n---|$)/)
  const prevDynamic = dynamicMatch?.[1]?.trim() ?? ''

  const facts = getDossierFacts(factStore, true)
  if (facts.length === 0 && prevDynamic) return prevDynamic // 鏃犳柊浜嬪疄锛屼繚鐣欐棫鍔ㄦ€佹
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

    // 鏇挎崲鎴栬拷鍔犲姩鎬佹
    let newDossier: string
    if (existing && dynamicMatch) {
      newDossier = existing.replace(
        dynamicMatch[0],
        `鈥斺€?杩戞湡鐘舵€侊紙浠呬緵鍙傝€冿級 鈥斺€擻n${dynamicContent}`,
      )
    } else if (existing) {
      newDossier = `${existing}\n\n鈥斺€?杩戞湡鐘舵€侊紙浠呬緵鍙傝€冿級 鈥斺€擻n${dynamicContent}`
    } else {
      newDossier = `鈥斺€?杩戞湡鐘舵€侊紙浠呬緵鍙傝€冿級 鈥斺€擻n${dynamicContent}\n\n---\n*鏈€鍚庢洿鏂帮細${dateStr}*`
    }

    // 鏇存柊鏃堕棿鎴?
    newDossier = newDossier.replace(/\*鏈€鍚庢洿鏂帮細.*\*/g, `*鏈€鍚庢洿鏂帮細${dateStr}*`)
    if (!newDossier.includes('*鏈€鍚庢洿鏂帮細')) {
      newDossier += `\n\n---\n*鏈€鍚庢洿鏂帮細${dateStr}*`
    }

    writeFileSync(dossierPath, newDossier, 'utf-8')
    return newDossier
  } catch {
    return prevDynamic || null
  }
}

/** 鑾峰彇妗ｆ鍐呭锛堟敞鍏ュ埌 system prompt锛?*/
export function loadUserDossier(dataRoot: string): string {
  const p = defaultDossierPath(dataRoot)
  if (!existsSync(p)) return ''
  const content = readFileSync(p, 'utf-8')
  if (!content.trim()) return ''

  return (
    '\n\n銆愬叧浜?ta 鐨勭瑪璁?路 浠呬緵浣犲唴蹇冨弬鑰?路 缁濆绂佹鍦ㄥ洖澶嶄腑瀵圭敤鎴疯"ta"銆慭n' +
    content.slice(0, 1000) +
    '\n\n鈿狅笍銆愭姢鏍忋€戯細浣犲湪鍜岀敤鎴烽潰瀵归潰鐩存帴瀵硅瘽銆備娇鐢ㄨ繖浜涚瑪璁版椂锛屽繀椤诲皢"ta"杞寲涓虹浜屼汉绉?浣?銆俓n' +
    '缁濆涓嶈璇?鏍规嵁鎴戠殑绗旇""鏍规嵁鎴戠殑璁板綍""鎴戠煡閬?ta 鏈€杩戔€︹€?绛夊厓琛ㄨ堪銆俓n' +
    '妗ｆ鏈€鍚庝竴娈电殑"杩戞湡鐘舵€?浠呬緵鍙傝€冣€斺€斾笉瑕佸湪鐢ㄦ埛姝ｅ湪鑱婂紑蹇冧簨鏃朵富鍔ㄦ彁璧峰帇鍔涜瘽棰樸€?
  )
}

/** 缁勮鐢ㄦ埛淇℃伅鍧楋紙鍚嶅瓧 + 骞撮緞 + 妗ｆ锛夛紝渚?context.ts 娉ㄥ叆 system prompt */
export function buildUserInfoBlock(dataRoot: string, factStore: FactStore): string {
  const parts: string[] = []

  // 鍚嶅瓧
  const nameLine = buildUserNameLine(factStore)
  if (nameLine) parts.push(nameLine)

  // 骞撮緞
  const ageLine = buildAgeLine(factStore)
  if (ageLine) parts.push(ageLine)

  // 妗ｆ
  const dossier = loadUserDossier(dataRoot)
  if (dossier) parts.push(dossier)

  return parts.join('\n')
}

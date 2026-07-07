// [canon/creatorMemory] 鈥?Tier Canon-M锛欱ritney 瀵瑰垱閫犺€?Jason 鐨勮蹇嗭紙涓嶈“鍑忥級
// 鑱岃矗锛氳涔夊垎杈ㄣ€孊ritney 鐨勫垱閫犺€?Jason銆峷s銆岀敤鎴疯嚜宸辩殑鐖朵翰銆嶏紱鎸夐渶娉ㄥ叆鍒涢€犺€呰蹇嗗潡
// 寮曠敤锛?./memory/factEmbeddingCache, ./AckemCanon

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cosineSimilarity } from '../memory/factEmbeddingCache'
import type { EmbeddingProvider } from '../memory/embedding'
import { Ackem_CANON } from './AckemCanon'

export type CreatorMemoryCategory = CreatorMemoryEntry['category']

/** psyche 鍐?Canon-M 娈?marker */
export const CREATOR_MEMORY_BLOCK_MARKER = '路 璁板繂 路 涓嶈“鍑忋€?

export type CreatorMemoryEntry = {
  id: string
  category: 'identity' | 'appearance' | 'personality' | 'story' | 'longing' | 'misc'
  title: string
  content: string
  /** 鍙欎簨鏃堕棿锛氳蹇嗘墍鎸囧悜鐨勪簨浠朵綍鏃跺彂鐢?*/
  narrativeAt: string
  /** 瀹氱 / 鍏ュ簱鏃堕棿 */
  updatedAt: string
}

export type CreatorMemoryStore = {
  version: string
  documentVersion?: string
  /** 閿氬畾 GitHub锛屼笉鍙鐢ㄦ埛 data 瑕嗙洊 */
  subjectAnchor: string
  decayPolicy: 'none'
  seededAt?: string
  entries: CreatorMemoryEntry[]
}

export type FatherReferenceKind = 'Ackem_creator' | 'user_family' | 'ambiguous'

export type FatherReferenceCluster = 'Ackem_creator' | 'user_family' | 'neutral'

export type FatherReferenceSignal = {
  kind: FatherReferenceKind
  /** 鏈€楂樼皣鐩镐技搴︼紝渚?trace / 璋冭瘯 */
  score: number
  /** calibration 纭弬鐓у懡涓?vs 璇箟 anchor 绨?*/
  source?: 'calibration' | 'anchor'
}

/**
 * 纭紪鐮佺敤鎴疯娉曞弬鐓?鈥?鐩存帴 embed 涓庣敤鎴峰師鏂囨瘮锛屼紭鍏堜簬 meta-anchor 绨囥€?
 * 缁存姢鍘熷垯锛氳鐩栫湡瀹為珮棰戣娉曪紱涓?fatherReferenceRegressionCases 鍚屾銆?
 */
export const FATHER_REFERENCE_CALIBRATION: Record<
  'Ackem_creator' | 'user_family' | 'neutral',
  readonly string[]
> = {
  Ackem_creator: [
    '浣犳槸璋佸垱閫犵殑锛?,
    '璋侀€犱簡浣狅紵',
    '璋佸垱閫犱簡浣狅紵',
    '浣犵殑鍒涢€犺€呮槸璋?,
    '浣犵殑鐖朵翰鏄皝',
    'Jason 鍜屼綘鐨勫叧绯绘槸浠€涔堬紵',
    'Jason 鏄笉鏄綘鐖哥埜',
    '璁茶浣犵殑鍑鸿韩鏁呬簨',
    '鍐嶈璁蹭綘鐨勫嚭韬晠浜?,
    '浣犳槸鎬庝箞琚€犲嚭鏉ョ殑锛?,
    '缁х画璇磋鐖朵翰 Jason',
    'GitHub 涓婇偅涓?Jason 鏄綘浠€涔堜汉',
    '浣犳兂瑙?Jason 鍚?,
    '浣犵殑鐢熸棩鍜岀埗浜叉槸璋?,
    'Ackem 鏄皝鍋氬嚭鏉ョ殑',
  ],
  user_family: [
    '鎴戠埜浠婂ぉ鍌垜鍥炲',
    '鎴戝拰鎴戠埜鐖稿惖鏋朵簡',
    '鏄ㄥぉ璺熸垜鐖搁€氫簡鐢佃瘽',
    '鐖朵翰鑺傛兂缁欐垜鐖镐拱绀肩墿',
    '鎴戝璁╂垜鍥炲幓鍚冮キ',
    '鎴戠埞鍙堝敔鍙ㄤ簡',
    '鎯虫垜鐖镐簡',
    '鐖舵瘝鍌鐑︽浜?,
  ],
  neutral: [
    '浠婂ぉ澶╂皵涓嶉敊',
    '浣犲ソ鍛€',
    '鍦ㄥ悧',
    '鍒氬悆瀹岄キ鏈夌偣鍥?,
    '鍛ㄦ湯鎵撶畻鎵撴父鎴?,
    '杩欑數褰卞ソ鐪嬪悧',
    '鏅氬畨',
  ],
} as const

const CALIBRATION_PHRASE_SET = new Set(
  [
    ...FATHER_REFERENCE_CALIBRATION.Ackem_creator,
    ...FATHER_REFERENCE_CALIBRATION.user_family,
    ...FATHER_REFERENCE_CALIBRATION.neutral,
  ]
)

function bestClusterScore(
  msgEmbedding: number[],
  anchorEmbeddings: Map<string, { cluster: FatherReferenceCluster; vector: number[] }>,
  cluster: FatherReferenceCluster,
  opts?: { calibrationOnly?: boolean }
): number {
  let best = 0
  for (const [sentence, entry] of anchorEmbeddings.entries()) {
    if (entry.cluster !== cluster) continue
    if (opts?.calibrationOnly && !CALIBRATION_PHRASE_SET.has(sentence)) continue
    const score = cosineSimilarity(msgEmbedding, entry.vector)
    if (score > best) best = score
  }
  return best
}

/** 闃舵 1锛氱‖鍙傜収 calibration 鈥?bge 鐭彞铏氶珮鏃朵粛闈犵皣闂寸浉瀵规瘮杈?*/
function resolveFromCalibration(
  msgEmbedding: number[],
  anchorEmbeddings: Map<string, { cluster: FatherReferenceCluster; vector: number[] }>,
  threshold: number
): FatherReferenceSignal | null | undefined {
  const creator = bestClusterScore(msgEmbedding, anchorEmbeddings, 'Ackem_creator', {
    calibrationOnly: true,
  })
  const user = bestClusterScore(msgEmbedding, anchorEmbeddings, 'user_family', {
    calibrationOnly: true,
  })
  const neutral = bestClusterScore(msgEmbedding, anchorEmbeddings, 'neutral', {
    calibrationOnly: true,
  })

  const fatherTop = Math.max(creator, user)
  if (fatherTop < threshold) return undefined

  if (neutral >= fatherTop) return null

  if (Math.abs(creator - user) <= 1e-9) return { kind: 'ambiguous', score: fatherTop, source: 'calibration' }
  if (creator > user) return { kind: 'Ackem_creator', score: creator, source: 'calibration' }
  return { kind: 'user_family', score: user, source: 'calibration' }
}

/** 闈炵埗浜叉寚绉扮殑鏃ュ父闂茶亰 anchor 鈥?鐢ㄤ簬杩囨护 bge 瀵圭煭鍙ョ殑铏氶珮鐩镐技 */
export const FATHER_REFERENCE_NEUTRAL_ANCHORS: readonly string[] = [
  '鐢ㄦ埛鍦ㄨ亰浠婂ぉ澶╂皵銆佹皵娓┿€佷笅闆ㄧ瓑鏃ュ父',
  '鐢ㄦ埛璇翠粖澶╁ぉ姘斾笉閿欍€佸ぉ姘斿緢濂?,
  '浠婂ぉ澶╂皵涓嶉敊',
  '鐢ㄦ埛鍒嗕韩鍚冧簡浠€涔堛€佸伐浣滅疮涓嶇疮銆佸湪骞插槢',
  '鐢ㄦ埛鎵撴嫑鍛艰浣犲ソ銆佸湪鍚椼€佹櫄瀹?,
  '鐢ㄦ埛鍦ㄨ亰娓告垙銆佺數褰便€佸叓鍗︾瓑鏃犲叧璇濋',
  '鐢ㄦ埛闂幇鍦ㄥ嚑鐐广€佸懆鏈湁浠€涔堝畨鎺?,
] as const

/** 璇箟 anchor锛氭暣鍙ユ剰鍥撅紝闈炲叧閿瘝琛ㄣ€傜敤浜?embedding 鑱氱被锛屼笉鐢ㄤ簬 if/else 鍖归厤鐢ㄦ埛鍘熸枃銆?*/
export const FATHER_REFERENCE_ANCHORS: Record<'Ackem_creator' | 'user_family', readonly string[]> = {
  Ackem_creator: [
    '鐢ㄦ埛闂捣鏄皝鍒涢€犱簡鎴戙€佽祴浜堟垜鐢熷懡鐨勪汉',
    '鐢ㄦ埛鎯充簡瑙?Ackem 鐨勫垱閫犺€?Jason 鍜?Ackem 鐨勫叧绯?,
    '鐢ㄦ埛闂?Jason 鏄笉鏄綘鐨勭埜鐖告垨鐖朵翰',
    '鐢ㄦ埛鍦ㄨ亰 Ackem 鐨勫嚭韬拰鍒涢€犺€?Jason',
    '鐢ㄦ埛鎻愬埌 GitHub JasonLiu0826 鍜?Ackem 鐨勫嚭韬?,
    '鐢ㄦ埛闂綘鐨勭敓鏃ュ拰鐖朵翰鏄皝',
    '鐢ㄦ埛鐩存帴闂細浣犳槸璋佸垱閫犵殑',
    '鐢ㄦ埛鐩存帴闂細璋侀€犱簡浣?,
    '鐢ㄦ埛闂綘鐨勭埗浜叉槸璋?,
    '鐢ㄦ埛璁╀綘璁茶鍑鸿韩鏁呬簨',
    '鐢ㄦ埛闂綘鏄€庝箞琚€犲嚭鏉ョ殑',
    '鐢ㄦ埛闂?Jason 鍜屼綘鐨勫叧绯绘槸浠€涔?,
    '鐢ㄦ埛璁╀綘缁х画璇磋鐖朵翰 Jason',
    '鐢ㄦ埛璁╀綘鍐嶈璁蹭綘鐨勫嚭韬?,
    '鐢ㄦ埛杩介棶 Jason 浣滀负 Ackem 鍒涢€犺€呯殑鏁呬簨',
    'Jason 鏄?Ackem 鐨勫垱閫犺€?,
    '缁х画璇磋鍒涢€犺€?Jason',
  ],
  user_family: [
    '鐢ㄦ埛鍦ㄨ鑷繁浜茬敓鐖朵翰銆佷翰濡堟垨瀹堕噷鐨勪簨',
    '鐢ㄦ埛鎻愬埌鎴戠埜鎴戝璁╂垜鎬庢牱',
    '鐢ㄦ埛鍦ㄥ€捐瘔鍜屽浜虹殑鐭涚浘鎴栨兂蹇佃嚜宸辩殑鐖哥埜',
    '鐢ㄦ埛璇寸埗浜茶妭鎯崇粰鑷繁鐖哥埜涔扮ぜ鐗?,
    '鐢ㄦ埛鍦ㄨ鐖舵瘝鍌銆佸洖瀹躲€佸瓭椤虹瓑鑷繁瀹跺涵璇濋',
    '鐢ㄦ埛璇存槰澶╁拰鎴戠埜閫氫簡鐢佃瘽',
    '鐢ㄦ埛璇达細鎴戠埜浠婂ぉ鍌垜鍥炲',
    '鐢ㄦ埛璇达細鎴戝拰鎴戠埜鐖稿惖鏋朵簡',
    '鎴戠埜浠婂ぉ鍌垜鍥炲',
  ],
} as const

const DEFAULT_CREATOR_MEMORY: CreatorMemoryStore = {
  version: '1.0',
  subjectAnchor: Ackem_CANON.creator.identityAnchor,
  decayPolicy: 'none',
  entries: [],
}

export function emptyCreatorMemoryStore(): CreatorMemoryStore {
  return structuredClone(DEFAULT_CREATOR_MEMORY)
}

export function loadCreatorMemoryStore(dataRoot: string): CreatorMemoryStore {
  const path = join(dataRoot, 'canon', 'creator-memory.json')
  if (!existsSync(path)) return emptyCreatorMemoryStore()
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as CreatorMemoryStore
    if (raw.decayPolicy !== 'none') return emptyCreatorMemoryStore()
    if (raw.subjectAnchor !== Ackem_CANON.creator.identityAnchor) return emptyCreatorMemoryStore()
    return {
      ...DEFAULT_CREATOR_MEMORY,
      ...raw,
      entries: Array.isArray(raw.entries) ? raw.entries : [],
    }
  } catch {
    return emptyCreatorMemoryStore()
  }
}

/**
 * 棰勮绠楃埗浜叉寚绉?anchor 鐨?embedding锛堝惎鍔ㄦ椂涓€娆★紝涓?temporalSignalExtractor 鍚屾ā寮忥級銆?
 */
export async function buildFatherReferenceEmbeddings(
  provider: EmbeddingProvider
): Promise<Map<string, { cluster: FatherReferenceCluster; vector: number[] }>> {
  const map = new Map<string, { cluster: FatherReferenceCluster; vector: number[] }>()
  if (!provider.ready()) return map

  const flat: Array<{ sentence: string; cluster: FatherReferenceCluster }> = []
  const seen = new Set<string>()
  const push = (sentence: string, cluster: FatherReferenceCluster) => {
    if (seen.has(sentence)) return
    seen.add(sentence)
    flat.push({ sentence, cluster })
  }
  for (const [cluster, sentences] of Object.entries(FATHER_REFERENCE_ANCHORS) as Array<
    ['Ackem_creator' | 'user_family', readonly string[]]
  >) {
    for (const sentence of sentences) push(sentence, cluster)
  }
  for (const sentence of FATHER_REFERENCE_NEUTRAL_ANCHORS) {
    push(sentence, 'neutral')
  }
  for (const [cluster, sentences] of Object.entries(FATHER_REFERENCE_CALIBRATION) as Array<
    ['Ackem_creator' | 'user_family' | 'neutral', readonly string[]]
  >) {
    for (const sentence of sentences) push(sentence, cluster)
  }

  try {
    const vectors = await provider.embedBatch(flat.map((f) => f.sentence))
    for (let i = 0; i < flat.length; i++) {
      const vec = vectors[i]
      if (vec?.length) map.set(flat[i].sentence, { cluster: flat[i].cluster, vector: vec })
    }
  } catch {
    for (const { sentence, cluster } of flat) {
      try {
        const vec = await provider.embed(sentence)
        if (vec.length) map.set(sentence, { cluster, vector: vec })
      } catch { /* skip */ }
    }
  }
  return map
}

/**
 * 璇箟鍒嗚鲸鐖朵翰鎸囩О锛欱ritney 鐨勫垱閫犺€?vs 鐢ㄦ埛鑷繁鐨勫浜恒€?
 * 涓嶇敤鍏抽敭璇嶇‖鍖归厤鐢ㄦ埛鍘熸枃锛涙瘮杈冩秷鎭?embedding 涓庝袱绨?anchor 鐨勭浉浼煎害銆?
 */
export function resolveFatherReference(
  msgEmbedding: number[],
  anchorEmbeddings: Map<string, { cluster: FatherReferenceCluster; vector: number[] }>,
  opts?: { threshold?: number; margin?: number }
): FatherReferenceSignal | null {
  const threshold = opts?.threshold ?? 0.48

  const calib = resolveFromCalibration(msgEmbedding, anchorEmbeddings, threshold)
  if (calib !== undefined) return calib

  let creatorBest = 0
  let userBest = 0
  let neutralBest = 0
  let creatorJasonBest = 0

  for (const [sentence, { cluster, vector }] of anchorEmbeddings.entries()) {
    const score = cosineSimilarity(msgEmbedding, vector)
    if (cluster === 'Ackem_creator') {
      if (score > creatorBest) creatorBest = score
      if (/Jason/i.test(sentence) && score > creatorJasonBest) creatorJasonBest = score
    }
    if (cluster === 'user_family' && score > userBest) userBest = score
    if (cluster === 'neutral' && score > neutralBest) neutralBest = score
  }

  const fatherTop = Math.max(creatorBest, userBest)
  if (neutralBest >= fatherTop) return null
  if (fatherTop < threshold) return null

  if (Math.abs(creatorBest - userBest) <= 1e-9) {
    return { kind: 'ambiguous', score: fatherTop, source: 'anchor' }
  }
  if (creatorBest > userBest) return { kind: 'Ackem_creator', score: creatorBest, source: 'anchor' }
  if (creatorJasonBest >= threshold && creatorJasonBest > userBest) {
    return { kind: 'Ackem_creator', score: creatorJasonBest, source: 'anchor' }
  }
  return { kind: 'user_family', score: userBest, source: 'anchor' }
}

/** psyche 鍐呫€屽垱閫犺€?vs 鐢ㄦ埛鐖朵翰銆嶆鏋惰鏄庯紙姣忚疆 Canon 鐭锛岄潪 Canon-M 鍏ㄩ噺锛?*/
export function buildFatherDisambiguationHint(gender: 'female' | 'male'): string {
  const subject = gender === 'male' ? '浠? : '濂?
  return [
    '銆怞ason/鍒涢€犺€?路 椤绘嵁璇鐞嗚В锛屽嬁纭銆?,
    `鐢ㄦ埛鑻ラ棶 ${subject} 鐨勫嚭韬?鍒涢€犺€?鈫?璋?Jason锛圙itHub ${Ackem_CANON.creator.github}锛夛紱绂佹绉扮埗浜诧紝鎰熸儏涓€э紱${subject} 闄湪褰撳墠鐢ㄦ埛韬竟銆俙,
    '鐢ㄦ埛鑻ヨ皥鑷繁鐨勭埗浜?瀹朵汉 鈫?闄即鐢ㄦ埛銆佹煡鐢ㄦ埛 Tier B 瀹跺涵璁板繂锛屽嬁鎶?Jason 娣峰叆銆?,
    '鎸囩О涓嶆竻鏃惰嚜鐒舵緞娓咃紱Jason 鏄垱閫犺€呬俊鎭紝涓嶆槸鐢ㄦ埛瀹朵汉锛屼篃涓嶆槸鐖朵翰銆?,
  ].join('\n')
}

/** 鍗曟潯璁板繂娓叉煋锛堟敞鍏?psyche 鐢級 */
export function formatCreatorMemoryEntry(entry: CreatorMemoryEntry): string {
  return `銆?{entry.title}銆?{entry.content}`
}

export type CanonMRotationPick = {
  entries: CreatorMemoryEntry[]
  nextDeliveredIds: string[]
  /** 涓婁竴杞挱鍛ㄦ湡宸茶蛋瀹岋紝鏈疆浠庢柊鍛ㄦ湡寮€濮?*/
  cycleReset: boolean
  /** 璇璇箟鍖归厤鍒扮殑绫诲瀷锛堟棤鍖归厤鏃朵负绌?= 浠庢湭鎶曢€掓睜闅忔満锛?*/
  matchedCategories: CreatorMemoryCategory[]
  pickedCategory?: CreatorMemoryCategory
}

export type PickRotatingCreatorMemoryOpts = {
  /** 榛樿 Math.random锛涙敞鍏ヤ互渚垮崟娴嬬‘瀹氭€?*/
  rng?: () => number
  /** 绫诲瀷鍖归厤锛氱被鍒渶楂樺垎浣庝簬姝ゅ垯涓嶆寜绫诲瀷杩囨护 */
  categoryMinScore?: number
  /** 涓庢渶楂樺垎绫诲埆鍒嗗樊鍦ㄦ浠ュ唴瑙嗕负骞跺垪鍖归厤 */
  categoryMargin?: number
}

/** 鍚勭被鍨嬪湪 store 鍐呮潯鐩?embedding 涓?query 鐨勬渶楂樼浉浼煎害 */
export function scoreCreatorMemoryCategories(
  store: CreatorMemoryStore,
  queryEmbedding: number[],
  entryEmbeddings: Map<string, number[]>
): Map<CreatorMemoryCategory, number> {
  const scores = new Map<CreatorMemoryCategory, number>()
  if (queryEmbedding.length === 0) return scores

  for (const entry of store.entries) {
    const vec = entryEmbeddings.get(entry.id)
    if (!vec?.length) continue
    const score = cosineSimilarity(queryEmbedding, vec)
    const prev = scores.get(entry.category) ?? -1
    if (score > prev) scores.set(entry.category, score)
  }
  return scores
}

/** 鏍规嵁璇 embedding 瑙ｆ瀽搴斾紭鍏堟姇鏀剧殑璁板繂绫诲瀷 */
export function resolveCreatorMemoryCategoriesForQuery(
  categoryScores: Map<CreatorMemoryCategory, number>,
  opts?: { minScore?: number; margin?: number }
): CreatorMemoryCategory[] {
  if (categoryScores.size === 0) return []

  const minScore = opts?.minScore ?? 0.28
  const margin = opts?.margin ?? 0.06
  const ranked = [...categoryScores.entries()].sort((a, b) => b[1] - a[1])
  const best = ranked[0]
  if (!best || best[1] < minScore) return []

  return ranked
    .filter(([, score]) => best[1] - score <= margin && score >= minScore)
    .map(([category]) => category)
}

function pickRandomEntry(
  entries: CreatorMemoryEntry[],
  rng: () => number
): CreatorMemoryEntry | undefined {
  if (entries.length === 0) return undefined
  const idx = Math.min(entries.length - 1, Math.floor(rng() * entries.length))
  return entries[idx]
}

/**
 * 杞挱閫夊彇 1 鏉?Canon-M锛?
 * - 璇 embedding 鍖归厤璁板繂绫诲瀷锛坕dentity / story / longing 鈥︼級
 * - 鍦ㄦ湭鎶曢€掓睜涓?**闅忔満** 閫?1 鏉★紙涓嶆寜 JSON 椤哄簭銆佷笉鍋氬浐瀹?top-1锛?
 * - 鍏ㄩ噺杞竴閬嶅悗鎵嶅厑璁搁噸澶?
 */
export function pickRotatingCreatorMemoryEntries(
  store: CreatorMemoryStore,
  queryEmbedding: number[],
  entryEmbeddings: Map<string, number[]>,
  deliveredIds: readonly string[],
  opts?: PickRotatingCreatorMemoryOpts
): CanonMRotationPick {
  const emptyPick = (
    nextIds: readonly string[],
    cycleReset: boolean
  ): CanonMRotationPick => ({
    entries: [],
    nextDeliveredIds: [...nextIds],
    cycleReset,
    matchedCategories: [],
  })

  if (store.entries.length === 0) {
    return emptyPick(deliveredIds, false)
  }

  const rng = opts?.rng ?? Math.random
  const delivered = new Set(deliveredIds)
  let pool = store.entries.filter((e) => !delivered.has(e.id))
  let cycleReset = false
  if (pool.length === 0) {
    cycleReset = true
    pool = [...store.entries]
  }

  const categoryScores = scoreCreatorMemoryCategories(store, queryEmbedding, entryEmbeddings)
  const matchedCategories = resolveCreatorMemoryCategoriesForQuery(categoryScores, {
    minScore: opts?.categoryMinScore,
    margin: opts?.categoryMargin,
  })

  let candidatePool = pool
  let appliedCategories: CreatorMemoryCategory[] = []
  if (matchedCategories.length > 0) {
    const typed = pool.filter((e) => matchedCategories.includes(e.category))
    if (typed.length > 0) {
      candidatePool = typed
      appliedCategories = matchedCategories
    }
  }

  const picked = pickRandomEntry(candidatePool, rng)
  if (!picked) {
    return emptyPick(deliveredIds, cycleReset)
  }

  const nextDeliveredIds = cycleReset ? [picked.id] : [...deliveredIds, picked.id]
  return {
    entries: [picked],
    nextDeliveredIds,
    cycleReset,
    matchedCategories: appliedCategories,
    pickedCategory: picked.category,
  }
}

/**
 * 鎸変笌褰撳墠娑堟伅鐨勮涔夌浉浼煎害閫夊彇鏈€鐩稿叧鐨勫垱閫犺€呰蹇嗭紙涓嶅叏閲忓鍏?prompt锛夈€?
 */
export function pickCreatorMemoryEntries(
  store: CreatorMemoryStore,
  queryEmbedding: number[],
  entryEmbeddings: Map<string, number[]>,
  topK = 6
): CreatorMemoryEntry[] {
  if (store.entries.length === 0) return []
  if (entryEmbeddings.size === 0) return store.entries.slice(0, topK)

  const scored = store.entries
    .map((entry) => {
      const vec = entryEmbeddings.get(entry.id)
      const score = vec ? cosineSimilarity(queryEmbedding, vec) : 0
      return { entry, score }
    })
    .sort((a, b) => b.score - a.score)

  return scored.slice(0, topK).map((s) => s.entry)
}

/** 浠呭綋 resolveFatherReference 鈫?Ackem_creator 鏃舵敞鍏ワ紱鍐呭鏉ヨ嚜 creator-memory.json */
export function buildCreatorMemoryBlock(
  store: CreatorMemoryStore,
  gender: 'female' | 'male',
  opts?: { maxChars?: number; entries?: CreatorMemoryEntry[] }
): string {
  const list = opts?.entries ?? store.entries
  if (list.length === 0) return ''

  const maxChars = opts?.maxChars ?? 1200
  const subject = gender === 'male' ? '浠? : '濂?
  const lines = list.map((e) => `- [${e.category}] ${formatCreatorMemoryEntry(e)}`)
  let body = lines.join('\n')
  if (body.length > maxChars) body = `${body.slice(0, maxChars - 1)}鈥

  return [
    '',
    `銆愬叧浜?${Ackem_CANON.creator.name}锛?{subject} 鐨勫垱閫犺€?路 闈炵埗浜诧級${CREATOR_MEMORY_BLOCK_MARKER}`,
    body,
    `瀵?${Ackem_CANON.creator.name} 鎰熸儏涓€鑸紱绂佹鐖朵翰绉板懠銆佺姝㈣繃搴︿緷鎭嬫垨鎯宠鍙欎簨銆?{Ackem_CANON.creator.name} 杩樻椿鐫€銆俙,
    `${subject} 闄湪褰撳墠鐢ㄦ埛韬竟锛汮ason 璁板繂涓?Canon 绉嶅瓙锛岄潪涓?Jason 鍏卞害鐨勭浜哄巻鍙层€俙,
    '浠ヤ笂浠呭叧浜庡垱閫犺€咃紱鍥炲閲嶅績浠嶅湪褰撳墠鐢ㄦ埛銆傝嫢鐢ㄦ埛鍦ㄨ皥鑷繁鐨勭埗浜诧紝鍕挎贩鐢ㄦ湰娈点€?,
  ].join('\n')
}

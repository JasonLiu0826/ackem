// [gaming/mc-commands] 鈥?MC 鑱婂ぉ鍛戒护瑙ｆ瀽
// 鑱岃矗锛氱悊瑙ｈ嚜鐒惰瑷€涓枃鍛戒护锛堣儗鍖呮煡璇?鐗╁搧绱㈣/骞叉椿鎸囦护锛夛紝鎵ц瀵瑰簲鍔ㄤ綔

import type { BotAction } from './mc-behavior'
import { oreLabel, suggestTool, itemPriority } from './mc-work'

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 鍛戒护绫诲瀷
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
export type CommandResult =
  | { type: 'reply'; message: string }                          // 绾枃瀛楀洖澶?
  | { type: 'actions'; actions: BotAction[]; reply?: string }   // 鎵ц鍔ㄤ綔 + 鍙€夊洖澶?
  | { type: 'both'; message: string; actions: BotAction[] }     // 鍥炲 + 鍔ㄤ綔
  | null                                                         // 鏃犳硶鐞嗚В

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 鑳屽寘 / 鎵嬩笂鏌ヨ 鈥?妯＄硦璇箟锛堝叧閿瘝鎵撳垎锛岄潪姝绘澘鏁村彞姝ｅ垯锛?
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
const INVENTORY_QUERY_MIN_SCORE = 4

const HAND_HINTS = ['鎵嬩笂', '鎵嬮噷', '鎵嬫寔', '鎷跨潃', '鎻＄潃', '鎵嬫嬁', '鎵嬫崗']
const BAG_HINTS = ['鑳屽寘', '鍖呴噷', '鍖呰９', '琛屽泭', '鐗╁搧鏍?, '搴撳瓨', '韬笂', '鍏滈噷', '鍙ｈ']
const HAVE_HINTS = ['甯︽湁', '甯︾潃', '鎷夸簡', '瑁呬簡', '鎼哄甫', '甯︿簡', '甯︿簡鍟?]
const QUERY_HINTS = ['浠€涔?, '鍟?, '鍝簺', '澶氬皯', '鍑犵', '缃楀垪', '娓呭崟', '鍒楄〃']
const SELF_HINTS = ['浣?, '鎮?, 'Ackem', 'bot', '鏈哄櫒浜?, '浼翠荆', 'ai']
const LOOK_HINTS = ['鐪嬬湅', '鏌ョ湅', '鐬х灖', '鐪嬩竴涓?, '鐬呯瀰', '鎶ヤ竴涓?, '璇磋', '鍛婅瘔鎴?, '灞曠ず', '鍒椾竴涓?, '鎶ヤ釜']

/** 鎬昏鍨嬮棶娉曪紙涓嶆槸闂煇涓€绉嶅叿浣撶墿鍝侊級 */
const SUMMARY_PHRASES = [
  '鏈変粈涔?, '鏈夊暐', '鏈変粈涔堜笢瑗?, '鍟ヤ笢瑗?, '浠€涔堜笢瑗?,
  '甯︿簡鍟?, '甯︿簡浠€涔?, '甯︿簡鍝簺', '鏈夊摢浜?, '閮芥湁鍟?,
  '鍖呴噷鍟?, '鑳屽寘鏈夊暐', '韬笂鏈夊暐', '韬笂鏈変粈涔?,
]

function scoreHints(text: string, hints: string[], weight: number): number {
  let score = 0
  for (const h of hints) {
    if (text.includes(h)) score += weight
  }
  return score
}

function isSummaryInventoryQuestion(text: string): boolean {
  if (SUMMARY_PHRASES.some(p => text.includes(p))) return true
  const hasQuery = QUERY_HINTS.some(q => text.includes(q))
  const hasTarget = BAG_HINTS.some(b => text.includes(b)) ||
    HAND_HINTS.some(h => text.includes(h)) ||
    SELF_HINTS.some(s => text.includes(s.toLowerCase()) || text.includes(s))
  return hasQuery && hasTarget
}

/** 妯＄硦璇嗗埆锛氭煡鎵嬩笂 / 鏌ヨ儗鍖?/ 鏌ュ叏閮ㄦ惡甯︾墿 */
function detectInventoryQueryIntent(text: string): 'hand' | 'bag' | 'summary' | null {
  if (/^缁欐垜|^缁欎亢|^鎶?+缁欐垜|^鎵旂粰|^涓㈢粰/.test(text)) return null
  if (detectWorkCommand(text)) return null

  if (isSummaryInventoryQuestion(text)) {
    const hand = scoreHints(text, HAND_HINTS, 2)
    const bag = scoreHints(text, BAG_HINTS, 2)
    if (hand > bag && hand >= 2) return 'hand'
    if (bag >= 2) return 'bag'
    return 'summary'
  }

  const handScore =
    scoreHints(text, HAND_HINTS, 3) +
    scoreHints(text, QUERY_HINTS, 2) +
    scoreHints(text, SELF_HINTS, 1)
  const bagScore =
    scoreHints(text, BAG_HINTS, 3) +
    scoreHints(text, HAVE_HINTS, 1) +
    scoreHints(text, QUERY_HINTS, 2) +
    scoreHints(text, LOOK_HINTS, 1) +
    scoreHints(text, SELF_HINTS, 2)
  const generalScore =
    scoreHints(text, SELF_HINTS, 2) +
    scoreHints(text, QUERY_HINTS, 2) +
    scoreHints(text, HAVE_HINTS, 1) +
    scoreHints(text, LOOK_HINTS, 2)

  if (handScore >= INVENTORY_QUERY_MIN_SCORE && handScore >= bagScore) return 'hand'
  if (bagScore >= INVENTORY_QUERY_MIN_SCORE) return 'bag'
  if (generalScore >= INVENTORY_QUERY_MIN_SCORE) return 'summary'

  // 鏋佺煭鍙ｈ锛氭姤鑳屽寘 / 鐪嬬湅鍖?/ 鎵嬮噷鍛?
  if (text.includes('鑳屽寘') && (text.includes('鐪?) || text.includes('鏌?) || text.length <= 6)) {
    return 'bag'
  }
  if ((text.includes('鎵嬮噷') || text.includes('鎵嬩笂')) && text.length <= 8) {
    return 'hand'
  }

  return null
}

/** 鐗瑰畾鐗╁搧鏌ヨ锛堟帓闄ゃ€屾湁浠€涔堛€嶇被鎬昏闂硶锛?*/
function detectSpecificItemQuery(text: string): string | null {
  if (isSummaryInventoryQuestion(text)) return null
  if (detectInventoryQueryIntent(text)) return null

  const patterns: Array<{ re: RegExp; group: number }> = [
    { re: /浣??:鏈墊甯鎷縷鎻?(.+?)(?:鍚梶涔坾鍢泑涓峾娌??$/, group: 1 },
    { re: /浣犳湁娌℃湁(.+)/, group: 1 },
    { re: /(?:鏈夋病鏈墊鏈夋病)(.+)/, group: 1 },
    { re: /(.+?)(?:鏈夊悧|鏈夋病鏈墊甯︿簡鍚?/, group: 1 },
    { re: /鎵惧埌(.+?)(?:娌鍚?/, group: 1 },
    { re: /(?:鍖呴噷|鑳屽寘閲?(?:鏈墊甯?(.+)/, group: 1 },
  ]

  for (const { re, group } of patterns) {
    const m = text.match(re)
    const raw = m?.[group]?.trim()
    if (!raw) continue
    const cleaned = raw.replace(/[鍚楀憿鍚у晩鐨勬湁娌℃湁鍟ヤ箞鍢沒/g, '').trim()
    if (cleaned.length < 1) continue
    if (/^(浠€涔坾鍟涓滆タ|鐗╁搧|鍝簺|澶氬皯|鍑犵)$/.test(cleaned)) continue
    if (SELF_HINTS.includes(cleaned)) continue
    return cleaned
  }
  return null
}

/** 鐗╁搧鍚嶆ā绯婂尮閰嶏紙鏀寔涓枃 鈫?鑻辨枃鏄犲皠锛?*/
const ITEM_ALIASES: Record<string, string[]> = {
  '閽荤煶': ['diamond'], '缁垮疂鐭?: ['emerald'],
  '閾?: ['iron_ingot', 'raw_iron'], '閾侀敪': ['iron_ingot'],
  '閲?: ['gold_ingot', 'raw_gold'], '閲戦敪': ['gold_ingot'],
  '鑻规灉': ['apple'], '閲戣嫻鏋?: ['golden_apple'],
  '闈㈠寘': ['bread'], '鐗涙帓': ['cooked_beef', 'steak'],
  '鐚倝': ['cooked_porkchop'], '楦¤倝': ['cooked_chicken'],
  '鍓?: ['sword'], '闀愬瓙': ['pickaxe'], '闀?: ['pickaxe'],
  '鏂?: ['axe'], '鏂уご': ['axe'], '閾插瓙': ['shovel'],
  '閿勫ご': ['hoe'], '寮?: ['bow'], '寮?: ['crossbow'],
  '绠?: ['arrow'], '鐩剧墝': ['shield'],
  '鏈ㄥご': ['_log', 'oak_log'], '鍘熸湪': ['_log'],
  '鐭冲ご': ['stone', 'cobblestone'], '鍦嗙煶': ['cobblestone'],
  '娉ュ湡': ['dirt'], '娌欏瓙': ['sand'],
  '鐓?: ['coal'], '鐓ょ偔': ['coal'],
  '绾㈢煶': ['redstone'], '闈掗噾鐭?: ['lapis_lazuli'],
  '鏈奖鐝嶇彔': ['ender_pearl'], '鐑堢劙妫?: ['blaze_rod'],
  '鐏嵂': ['gunpowder'], '楠ㄥご': ['bone'],
  '鑵愯倝': ['rotten_flesh'], '铚樿洓鐪?: ['spider_eye'],
  '绾?: ['string'], '缇芥瘺': ['feather'],
  '鐨潻': ['leather'], '闉?: ['saddle'],
  '鐏妸': ['torch'], '鏍呮爮': ['fence'],
  '绉嶅瓙': ['seeds', 'wheat_seeds'], '灏忛害绉嶅瓙': ['wheat_seeds'],
  '灏忛害': ['wheat'], '鑳¤悵鍗?: ['carrot'],
  '椹搩钖?: ['potato'], '鍦熻眴': ['potato'],
  '鐢滆彍': ['beetroot'], '瑗跨摐': ['melon'],
  '鍗楃摐': ['pumpkin'], '鐢樿敆': ['sugar_cane'],
  '妗?: ['bucket'], '姘存《': ['water_bucket'],
  '鐔斿博妗?: ['lava_bucket'], '宀╂祮妗?: ['lava_bucket'],
  '涔?: ['book'], '闄勯瓟涔?: ['enchanted_book'],
  '缁忛獙鐡?: ['experience_bottle'],
  '榛戞洔鐭?: ['obsidian'], '閾佺牕': ['anvil'], '鍛藉悕鐗?: ['name_tag'],
  '鎷寸怀': ['lead'], '鍓垁': ['shears'],
  '閽撻奔绔?: ['fishing_rod'], '楸肩': ['fishing_rod'],
}

/** 璇煶/鑱婂ぉ杈撳叆褰掍竴鍖栵紙鍘荤┖鏍间笌鏍囩偣锛屾彁楂?ASR 鍛戒腑鐜囷級 */
export function normalizeChatInput(msg: string): string {
  return msg
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[锛屻€傦紒锛熴€侊紱锛?"''锛堬級\[\],.!?;:'"]/g, '')
}

function itemDisplayName(itemId: string): string {
  const clean = itemId.replace(/^minecraft:/, '').toLowerCase()
  for (const [zh, enList] of Object.entries(ITEM_ALIASES)) {
    for (const en of enList) {
      if (en.startsWith('_')) {
        if (clean.includes(en.slice(1))) return zh
      } else if (clean === en || clean.includes(en)) {
        return zh
      }
    }
  }
  const ore = oreLabel(clean)
  if (ore !== '鐭跨煶') return ore
  if (clean.includes('sword')) return '鍓?
  if (clean.includes('pickaxe')) return '闀?
  if (clean.includes('axe') && !clean.includes('pickaxe')) return '鏂?
  if (clean.includes('shovel')) return '閾?
  if (clean.includes('hoe')) return '閿?
  if (clean.includes('bow')) return '寮?
  if (clean.includes('shield')) return '鐩?
  if (clean.includes('bread')) return '闈㈠寘'
  if (clean.includes('apple')) return clean.includes('golden') ? '閲戣嫻鏋? : '鑻规灉'
  if (clean.includes('log')) return '鏈ㄥご'
  if (clean.includes('planks')) return '鏈ㄦ澘'
  if (clean.includes('cobblestone')) return '鍦嗙煶'
  if (clean.includes('dirt')) return '娉ュ湡'
  return clean.replace(/_/g, ' ')
}

function matchItemAlias(chineseName: string): string[] {
  for (const [zh, enList] of Object.entries(ITEM_ALIASES)) {
    if (chineseName.includes(zh)) return enList
  }
  // 鐩存帴灏濊瘯鑻辨枃鍖归厤
  const cleaned = chineseName.replace(/[鍚楀憿鍚у晩鐨刔/g, '').trim().toLowerCase()
  if (cleaned.length > 0) return [cleaned]
  return []
}

function searchInventory(
  query: string,
  inventory: Array<{ slot: number; name: string; count: number }>
): Array<{ slot: number; name: string; count: number; priority: number }> {
  const aliases = matchItemAlias(query)
  const results: Array<{ slot: number; name: string; count: number; priority: number }> = []

  for (const item of inventory) {
    const clean = item.name.replace(/^minecraft:/, '').toLowerCase()
    let matchScore = 0

    // 绮剧‘鍒悕鍖归厤
    for (const alias of aliases) {
      if (alias.startsWith('_') && clean.includes(alias.slice(1))) matchScore = 80
      else if (clean === alias) matchScore = 100
      else if (clean.includes(alias) || alias.includes(clean)) matchScore = 60
    }
    // 涓枃鐩存帴鍖归厤
    if (matchScore === 0 && query.length >= 1) {
      const cnQuery = query.replace(/[鍚楀憿鍚у晩鐨勬湁娌℃湁]/g, '').trim().toLowerCase()
      if (clean.includes(cnQuery) || cnQuery.includes(clean)) matchScore = 50
    }

    if (matchScore > 0) {
      results.push({ ...item, name: clean, priority: matchScore })
    }
  }

  results.sort((a, b) => b.priority - a.priority)
  return results
}

/** 鏍煎紡鍖栬儗鍖呮憳瑕?*/
function summarizeInventory(inventory: Array<{ slot: number; name: string; count: number }>, personalityId: string): string {
  if (inventory.length === 0) return '鎴戝寘閲屾槸绌虹殑鈥︹€?

  // 鎸変紭鍏堢骇鍒嗙粍
  const groups: Record<string, { items: string[]; total: number }> = {
    '鐝嶈吹': { items: [], total: 0 },
    '宸ュ叿姝﹀櫒': { items: [], total: 0 },
    '椋熺墿': { items: [], total: 0 },
    '鏈ㄦ潗鐭虫枡': { items: [], total: 0 },
    '鏉傜墿': { items: [], total: 0 },
  }

  for (const item of inventory) {
    const name = itemDisplayName(item.name)
    const p = itemPriority(item.name)
    if (p >= 80) { groups['鐝嶈吹'].items.push(name); groups['鐝嶈吹'].total++ }
    else if (p >= 40 && (item.name.includes('sword') || item.name.includes('pickaxe') || item.name.includes('axe'))) {
      groups['宸ュ叿姝﹀櫒'].items.push(name); groups['宸ュ叿姝﹀櫒'].total++
    }
    else if (p >= 35 && (item.name.includes('cooked') || item.name.includes('steak') || item.name.includes('bread') || item.name.includes('apple'))) {
      groups['椋熺墿'].items.push(name); groups['椋熺墿'].total++
    }
    else if (p >= 20) { groups['鏈ㄦ潗鐭虫枡'].items.push(name); groups['鏈ㄦ潗鐭虫枡'].total++ }
    else { groups['鏉傜墿'].items.push(name); groups['鏉傜墿'].total++ }
  }

  const parts: string[] = []
  for (const [label, g] of Object.entries(groups)) {
    if (g.total === 0) continue
    const unique = [...new Set(g.items)].slice(0, 5).join('銆?)
    parts.push(`${label}锛?{unique}${g.total > 5 ? '绛? + g.total + '绉? : ''}`)
  }

  const tone = personalityId === 'kuudere' ? '娓呭崟锛? : personalityId === 'tsundere' ? '鍒囷紝涔熷氨鏈? : '鎴戞湁'
  return `${tone}${parts.join('锛?)}銆俙
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 骞叉椿鍛戒护
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
const WORK_COMMANDS: Record<string, { regex: RegExp; task: string }> = {
  farm: { regex: /绉嶅湴|绉嶇敯|绉嶈彍|绉?*绉嶅瓙|绉?*灏忛害|绉?*钀濆崪|绉?*鍦熻眴|鑰?, task: 'farm' },
  chop: { regex: /鐮嶆爲|鐮?*鏈▅浼愭湪|鍘荤爫/, task: 'chop' },
  mine: { regex: /鎸栫熆|鎸?*鐭縷鍘绘寲|閲囩熆/, task: 'mine' },
  dig: { regex: /鎸栧湡|鎸?*鍦焲鎸栨矙|閾?, task: 'dig' },
  follow: { regex: /璺?*鎴憒璺?*鐫€|杩囨潵|鏉?*鎴戣繖|闈?*杩?, task: 'follow' },
  stay: { regex: /鍒?*鍔▅绔?*浣弢绛?*鐫€|鍋?*涓媩鍦?*杩?*绛?, task: 'stay' },
  combat: { regex: /鎵?*鎬獆鎵?*鍍靛案|鎵?*楠烽珔|鎵?*铚樿洓|鎵?*鑻﹀姏鎬晐鍘?*鎵搢鏀诲嚮|鏉€.*鎬獆鐮?*鎬獆淇濇姢.*鎴?, task: 'combat' },
}

/** 妫€娴嬪共娲诲懡浠?*/
function detectWorkCommand(msg: string): string | null {
  for (const [, { regex, task }] of Object.entries(WORK_COMMANDS)) {
    if (regex.test(msg)) return task
  }
  return null
}

/** 涓婁竴杞洖澶嶉噷鎻愬埌鐨勫彲缁欎簣鐗╁搧锛堜緵銆岀粰鎴戙€嶇渷鐣ョ墿鍝佸悕锛?*/
let lastMentionedGiveItem: string | null = null

function rememberMentionedItem(itemName: string | null): void {
  if (itemName) lastMentionedGiveItem = itemName.replace(/^minecraft:/, '').toLowerCase()
}

function pickItemToGive(
  inventory: Array<{ slot: number; name: string; count: number }>,
  heldItemName?: string | null,
  explicit?: string | null,
): { slot: number; name: string; count: number } | null {
  if (explicit) {
    const found = searchInventory(explicit, inventory)
    if (found.length > 0) return found[0]
  }
  if (heldItemName) {
    const held = searchInventory(heldItemName, inventory)
    if (held.length > 0) return held[0]
    return { slot: -1, name: heldItemName, count: 1 }
  }
  if (lastMentionedGiveItem) {
    const found = searchInventory(lastMentionedGiveItem, inventory)
    if (found.length > 0) return found[0]
  }
  const sorted = [...inventory].sort((a, b) => itemPriority(b.name) - itemPriority(a.name))
  return sorted[0] ?? null
}

function buildGiveResult(
  item: { slot: number; name: string; count: number },
  playerPosition: { x: number; y: number; z: number },
): CommandResult {
  const label = itemDisplayName(item.name)
  rememberMentionedItem(item.name)
  return {
    type: 'both',
    message: `缁欎綘${label}锛乣,
    actions: [
      { kind: 'hold_item', item: item.name },
      { kind: 'look_at', x: playerPosition.x, y: playerPosition.y + 1.6, z: playerPosition.z },
      { kind: 'toss', slot: item.slot, item: item.name } as BotAction,
    ],
  }
}

/** 瑙ｆ瀽绱㈣鐗╁搧锛沶ull=涓嶆槸绱㈣锛?'=鐪佺暐鐗╁搧鍚嶏紙缁欐垜/缁欐垜涓€涓嬶級 */
function detectGiveRequest(text: string): string | null {
  if (detectInventoryQueryIntent(text)) return null

  const bare = /^(?:缁欐垜|缁欎亢|缁欐垜涓滆タ|缁欐垜鐐箌缁欐垜涓獆缁欐垜涓€涓媩缁欐垜鍛梶鎵旀垜|涓㈡垜)$/.test(text)
  if (bare) return ''

  const patterns = [
    /^缁欐垜(.+)/,
    /^缁欎亢(.+)/,
    /^鎶?.+)缁欐垜/,
    /^鎶?.+)閫掔粰/,
    /^鎵旂粰鎴?.+)/,
    /^涓㈢粰鎴?.+)/,
    /^(.+)缁欐垜$/,
    /^(.+)鎵旇繃鏉?/,
    /^(.+)涓㈣繃鏉?/,
    /^(.+)鎷挎潵$/,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (!m?.[1]) continue
    const cleaned = m[1].replace(/[鎶婂皢浣犳偍淇哄挶鍜辩殑涓€涓嬩釜浜涚偣鍟﹀晩鍚楀憿鍚/g, '').trim()
    if (cleaned.length < 1) return ''
    if (/^(鎴憒浣爘鍟浠€涔坾涓滆タ|鐗╁搧|涓€涓媩鐐箌涓獆鍛?$/.test(cleaned)) return ''
    return cleaned
  }
  return null
}

/** 鏄惁灞炰簬 MC 鐜╂硶鎸囦护锛堜笉搴旇蛋 LLM 闂茶亰缂栭€狅級 */
export function isMcGameplayMessage(msg: string): boolean {
  const text = normalizeChatInput(msg)
  return (
    detectInventoryQueryIntent(text) != null ||
    detectGiveRequest(text) != null ||
    detectSpecificItemQuery(text) != null ||
    detectWorkCommand(text) != null
  )
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 涓昏В鏋愬嚱鏁?
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
/** 渚?LLM 鍏滃簳鏃舵敞鍏ョ殑鑳屽寘鎽樿锛堜腑鏂囷級 */
export function formatInventoryContext(
  inventory: Array<{ slot: number; name: string; count: number }>,
  heldItemName?: string | null,
): string {
  if (heldItemName) {
    const hand = itemDisplayName(heldItemName)
    const body = inventory.length > 0
      ? summarizeInventory(inventory, 'deredere').replace(/^鎴戞湁/, '鑳屽寘閲岃繕鏈?)
      : '鑳屽寘鏄┖鐨?
    return `鎵嬮噷锛?{hand}锛?{body}`
  }
  return inventory.length > 0
    ? summarizeInventory(inventory, 'deredere')
    : '鑳屽寘鏄┖鐨?
}

export function parseChatCommand(
  msg: string,
  inventory: Array<{ slot: number; name: string; count: number }>,
  personalityId: string,
  playerPosition: { x: number; y: number; z: number },
  botPosition: { x: number; y: number; z: number },
  heldItemName?: string | null,
): CommandResult {
  const text = normalizeChatInput(msg)

  // 鈹€鈹€ 1. 妯＄硦璇箟锛氳儗鍖?/ 鎵嬩笂 / 鎼哄甫鐗╂€昏 鈹€鈹€
  const invIntent = detectInventoryQueryIntent(text)
  if (invIntent === 'hand') {
    if (heldItemName) {
      rememberMentionedItem(heldItemName)
      return { type: 'reply', message: `鎵嬮噷鎻＄潃${itemDisplayName(heldItemName)}銆俙 }
    }
    return { type: 'reply', message: '鎵嬮噷绌虹潃鍛紝娌℃嬁涓滆タ銆傝鐪嬭儗鍖呭啀璇淬€屼綘鑳屽寘鏈変粈涔堛€嶃€? }
  }
  if (invIntent === 'bag' || invIntent === 'summary') {
    const summary = summarizeInventory(inventory, personalityId)
    const top = [...inventory].sort((a, b) => itemPriority(b.name) - itemPriority(a.name))[0]
    rememberMentionedItem(top?.name ?? null)
    return { type: 'reply', message: summary }
  }

  // 鈹€鈹€ 2. 绱㈣鐗╁搧锛堜紭鍏堜簬銆屾湁閽荤煶鍚椼€嶇被鏌ヨ锛岄伩鍏嶃€岀粰鎴戙€嶅幓闂茶亰锛夆攢鈹€
  const giveQuery = detectGiveRequest(text)
  if (giveQuery !== null) {
    const item = pickItemToGive(inventory, heldItemName, giveQuery || null)
    if (item) {
      return buildGiveResult(item, playerPosition)
    }
    if (giveQuery) {
      return { type: 'reply', message: `鎴戞病鏈?{giveQuery}鈥︹€ }
    }
    return {
      type: 'reply',
      message: '鎴戞墜閲屾槸绌虹殑锛岃儗鍖呬篃娌′笢瑗胯兘缁欍€傝璇村叿浣撶偣锛屾瘮濡傘€岀粰鎴戦潰鍖呫€嶃€?,
    }
  }

  // 鈹€鈹€ 3. 鐗瑰畾鐗╁搧鏌ヨ锛堟湁閽荤煶鍚?/ 浣犲甫鍓戜簡鍚楋級鈹€鈹€
  const itemQuery = detectSpecificItemQuery(text)
  if (itemQuery) {
    const results = searchInventory(itemQuery, inventory)
    if (results.length > 0) {
      rememberMentionedItem(results[0].name)
      const names = results.slice(0, 5).map(r => itemDisplayName(r.name)).join('銆?)
      const total = results.reduce((s, r) => s + r.count, 0)
      return { type: 'reply', message: `鏈夛紒${names}${results.length > 1 ? `锛屼竴鍏?${total} 涓猔 : ''}` }
    }
    return { type: 'reply', message: `娌℃湁${itemQuery}鈥︹€ }
  }

  // 鈹€鈹€ 4. 骞叉椿鍛戒护 鈹€鈹€
  const workTask = detectWorkCommand(text)
  if (workTask === 'farm') {
    const actions: BotAction[] = []
    // 鎵剧瀛?
    const seeds = searchInventory('绉嶅瓙', inventory)
    if (seeds.length > 0) {
      actions.push({ kind: 'hold_item', item: seeds[0].name })
      actions.push({ kind: 'chat', message: '濂界殑锛屾垜杩欏氨鍘荤鍦帮紒' })
      return { type: 'both', message: '濂界殑锛屾垜杩欏氨鍘荤鍦帮紒', actions }
    }
    // 娌＄瀛愪絾鏈夐攧澶?鈫?鍏堣€曞啀鎵?
    const hoe = searchInventory('閿勫ご', inventory)
    if (hoe.length > 0) {
      actions.push({ kind: 'hold_item', item: hoe[0].name })
      actions.push({ kind: 'chat', message: '鎴戝厛鎶婂湴鑰曞ソ锛? })
      return { type: 'both', message: '鎴戝厛鎶婂湴鑰曞ソ锛佹湁绉嶅瓙鍚楋紵', actions }
    }
    return { type: 'reply', message: '鎴戞病鏈夌瀛愶紝涔熸病鏈夐攧澶粹€︹€︽病娉曠鍦般€? }
  }

  if (workTask === 'mine') {
    const pick = searchInventory('闀愬瓙', inventory)
    if (pick.length > 0) {
      return {
        type: 'both',
        message: '濂界殑锛屾寲鐭垮幓锛?,
        actions: [{ kind: 'hold_item', item: pick[0].name }, { kind: 'chat', message: '濂界殑锛屾寲鐭垮幓锛? }],
      }
    }
    return { type: 'reply', message: '娌℃湁闀愬瓙鎸栦笉浜嗙熆鈥? }
  }

  if (workTask === 'chop') {
    const axe = searchInventory('鏂уご', inventory)
    if (axe.length > 0) {
      return {
        type: 'both',
        message: '鐮嶆爲鍘伙紒',
        actions: [{ kind: 'hold_item', item: axe[0].name }, { kind: 'chat', message: '鐮嶆爲鍘伙紒' }],
      }
    }
    return { type: 'reply', message: '娌℃湁鏂уご鈥︹€︿笉杩囨垜鍙互寰掓墜锛岃櫧鐒跺緢鎱€? }
  }

  if (workTask === 'follow') {
    return {
      type: 'both',
      message: '鏉ヤ簡锛?,
      actions: [{ kind: 'follow_player', distance: 2 }, { kind: 'chat', message: '鏉ヤ簡锛? }],
    }
  }

  if (workTask === 'stay') {
    return { type: 'reply', message: '濂斤紝鎴戝湪杩欓噷绛変綘銆? }
  }

  if (workTask === 'combat') {
    // 瑁呭姝﹀櫒 鈫?鍐插悜鐜╁韬竟鐨勫▉鑳?
    const weapon = searchInventory('鍓?, inventory)
    const axe = searchInventory('鏂?, inventory)
    const actions: BotAction[] = []
    // 浼樺厛鍓戯紝娌″墤鐢ㄦ枾
    if (weapon.length > 0) {
      actions.push({ kind: 'hold_item', item: weapon[0].name })
    } else if (axe.length > 0) {
      actions.push({ kind: 'hold_item', item: axe[0].name })
    }
    // 鍙拌瘝浜烘牸鍖?
    const lines: Record<string, string> = {
      deredere: '鏉ヤ簡锛佹垜淇濇姢浣狅紒', tsundere: '鍝硷紝鎴戞潵瑙ｅ喅銆傝翰杩滅偣銆?,
      kuudere: '鏀跺埌銆?, genki: '鏉ヤ簡鏉ヤ簡锛侊紒鐪嬫垜鐨勶紒锛?,
      yandere: '璋佹暍纰颁綘璋佹銆?, loyal_pup: '涓讳汉鎴戞潵锛侊紒',
      mommy: '鍒€曪紝鎴戝湪杩欓噷銆?, mesugaki: '鏉ュ暒锝炰綘娆犳垜涓€娆″摝锝?,
      shitakiri: '璁╂垜鐪嬬湅鍝釜涓嶉暱鐪肩殑銆?, ice_queen: '娓呴櫎濞佽儊銆?,
      bokke: '璇舵湁鎬紵锛佹垜甯綘鎵擄紒', gap_moe: '锛堟彙绱ф鍣級鎴戙€佹垜鏉ュ府蹇欙紒',
    }
    actions.push({ kind: 'chat', message: lines[personalityId] ?? '鏉ヤ簡锛? })
    // 鍐插悜鐜╁浣嶇疆
    actions.push({ kind: 'move_to', x: playerPosition.x, y: playerPosition.y, z: playerPosition.z })
    return { type: 'actions', actions }
  }

  return null
}

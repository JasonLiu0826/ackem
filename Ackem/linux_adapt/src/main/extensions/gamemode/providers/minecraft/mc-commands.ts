// [gaming/mc-commands] — MC 聊天命令解析
// 职责：理解自然语言中文命令（背包查询/物品索要/干活指令），执行对应动作

import type { BotAction } from './mc-behavior'
import { oreLabel, suggestTool, itemPriority } from './mc-work'

// ═══════════════════════════════════════════════════════════════
// 命令类型
// ═══════════════════════════════════════════════════════════════
export type CommandResult =
  | { type: 'reply'; message: string }                          // 纯文字回复
  | { type: 'actions'; actions: BotAction[]; reply?: string }   // 执行动作 + 可选回复
  | { type: 'both'; message: string; actions: BotAction[] }     // 回复 + 动作
  | null                                                         // 无法理解

// ═══════════════════════════════════════════════════════════════
// 背包 / 手上查询 — 模糊语义（关键词打分，非死板整句正则）
// ═══════════════════════════════════════════════════════════════
const INVENTORY_QUERY_MIN_SCORE = 4

const HAND_HINTS = ['手上', '手里', '手持', '拿着', '握着', '手拿', '手捏']
const BAG_HINTS = ['背包', '包里', '包裹', '行囊', '物品栏', '库存', '身上', '兜里', '口袋']
const HAVE_HINTS = ['带有', '带着', '拿了', '装了', '携带', '带了', '带了啥']
const QUERY_HINTS = ['什么', '啥', '哪些', '多少', '几种', '罗列', '清单', '列表']
const SELF_HINTS = ['你', '您', 'ackem', 'bot', '机器人', '伴侣', 'ai']
const LOOK_HINTS = ['看看', '查看', '瞧瞧', '看一下', '瞅瞅', '报一下', '说说', '告诉我', '展示', '列一下', '报个']

/** 总览型问法（不是问某一种具体物品） */
const SUMMARY_PHRASES = [
  '有什么', '有啥', '有什么东西', '啥东西', '什么东西',
  '带了啥', '带了什么', '带了哪些', '有哪些', '都有啥',
  '包里啥', '背包有啥', '身上有啥', '身上有什么',
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

/** 模糊识别：查手上 / 查背包 / 查全部携带物 */
function detectInventoryQueryIntent(text: string): 'hand' | 'bag' | 'summary' | null {
  if (/^给我|^给俺|^把.+给我|^扔给|^丢给/.test(text)) return null
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

  // 极短口语：报背包 / 看看包 / 手里呢
  if (text.includes('背包') && (text.includes('看') || text.includes('查') || text.length <= 6)) {
    return 'bag'
  }
  if ((text.includes('手里') || text.includes('手上')) && text.length <= 8) {
    return 'hand'
  }

  return null
}

/** 特定物品查询（排除「有什么」类总览问法） */
function detectSpecificItemQuery(text: string): string | null {
  if (isSummaryInventoryQuestion(text)) return null
  if (detectInventoryQueryIntent(text)) return null

  const patterns: Array<{ re: RegExp; group: number }> = [
    { re: /你(?:有|带|拿|揣)(.+?)(?:吗|么|嘛|不|没)?$/, group: 1 },
    { re: /你有没有(.+)/, group: 1 },
    { re: /(?:有没有|有没)(.+)/, group: 1 },
    { re: /(.+?)(?:有吗|有没有|带了吗)/, group: 1 },
    { re: /找到(.+?)(?:没|吗)/, group: 1 },
    { re: /(?:包里|背包里)(?:有|带)(.+)/, group: 1 },
  ]

  for (const { re, group } of patterns) {
    const m = text.match(re)
    const raw = m?.[group]?.trim()
    if (!raw) continue
    const cleaned = raw.replace(/[吗呢吧啊的有没有啥么嘛]/g, '').trim()
    if (cleaned.length < 1) continue
    if (/^(什么|啥|东西|物品|哪些|多少|几种)$/.test(cleaned)) continue
    if (SELF_HINTS.includes(cleaned)) continue
    return cleaned
  }
  return null
}

/** 物品名模糊匹配（支持中文 → 英文映射） */
const ITEM_ALIASES: Record<string, string[]> = {
  '钻石': ['diamond'], '绿宝石': ['emerald'],
  '铁': ['iron_ingot', 'raw_iron'], '铁锭': ['iron_ingot'],
  '金': ['gold_ingot', 'raw_gold'], '金锭': ['gold_ingot'],
  '苹果': ['apple'], '金苹果': ['golden_apple'],
  '面包': ['bread'], '牛排': ['cooked_beef', 'steak'],
  '猪肉': ['cooked_porkchop'], '鸡肉': ['cooked_chicken'],
  '剑': ['sword'], '镐子': ['pickaxe'], '镐': ['pickaxe'],
  '斧': ['axe'], '斧头': ['axe'], '铲子': ['shovel'],
  '锄头': ['hoe'], '弓': ['bow'], '弩': ['crossbow'],
  '箭': ['arrow'], '盾牌': ['shield'],
  '木头': ['_log', 'oak_log'], '原木': ['_log'],
  '石头': ['stone', 'cobblestone'], '圆石': ['cobblestone'],
  '泥土': ['dirt'], '沙子': ['sand'],
  '煤': ['coal'], '煤炭': ['coal'],
  '红石': ['redstone'], '青金石': ['lapis_lazuli'],
  '末影珍珠': ['ender_pearl'], '烈焰棒': ['blaze_rod'],
  '火药': ['gunpowder'], '骨头': ['bone'],
  '腐肉': ['rotten_flesh'], '蜘蛛眼': ['spider_eye'],
  '线': ['string'], '羽毛': ['feather'],
  '皮革': ['leather'], '鞍': ['saddle'],
  '火把': ['torch'], '栅栏': ['fence'],
  '种子': ['seeds', 'wheat_seeds'], '小麦种子': ['wheat_seeds'],
  '小麦': ['wheat'], '胡萝卜': ['carrot'],
  '马铃薯': ['potato'], '土豆': ['potato'],
  '甜菜': ['beetroot'], '西瓜': ['melon'],
  '南瓜': ['pumpkin'], '甘蔗': ['sugar_cane'],
  '桶': ['bucket'], '水桶': ['water_bucket'],
  '熔岩桶': ['lava_bucket'], '岩浆桶': ['lava_bucket'],
  '书': ['book'], '附魔书': ['enchanted_book'],
  '经验瓶': ['experience_bottle'],
  '黑曜石': ['obsidian'], '铁砧': ['anvil'], '命名牌': ['name_tag'],
  '拴绳': ['lead'], '剪刀': ['shears'],
  '钓鱼竿': ['fishing_rod'], '鱼竿': ['fishing_rod'],
}

/** 语音/聊天输入归一化（去空格与标点，提高 ASR 命中率） */
export function normalizeChatInput(msg: string): string {
  return msg
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。！？、；：""''（）\[\],.!?;:'"]/g, '')
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
  if (ore !== '矿石') return ore
  if (clean.includes('sword')) return '剑'
  if (clean.includes('pickaxe')) return '镐'
  if (clean.includes('axe') && !clean.includes('pickaxe')) return '斧'
  if (clean.includes('shovel')) return '铲'
  if (clean.includes('hoe')) return '锄'
  if (clean.includes('bow')) return '弓'
  if (clean.includes('shield')) return '盾'
  if (clean.includes('bread')) return '面包'
  if (clean.includes('apple')) return clean.includes('golden') ? '金苹果' : '苹果'
  if (clean.includes('log')) return '木头'
  if (clean.includes('planks')) return '木板'
  if (clean.includes('cobblestone')) return '圆石'
  if (clean.includes('dirt')) return '泥土'
  return clean.replace(/_/g, ' ')
}

function matchItemAlias(chineseName: string): string[] {
  for (const [zh, enList] of Object.entries(ITEM_ALIASES)) {
    if (chineseName.includes(zh)) return enList
  }
  // 直接尝试英文匹配
  const cleaned = chineseName.replace(/[吗呢吧啊的]/g, '').trim().toLowerCase()
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

    // 精确别名匹配
    for (const alias of aliases) {
      if (alias.startsWith('_') && clean.includes(alias.slice(1))) matchScore = 80
      else if (clean === alias) matchScore = 100
      else if (clean.includes(alias) || alias.includes(clean)) matchScore = 60
    }
    // 中文直接匹配
    if (matchScore === 0 && query.length >= 1) {
      const cnQuery = query.replace(/[吗呢吧啊的有没有]/g, '').trim().toLowerCase()
      if (clean.includes(cnQuery) || cnQuery.includes(clean)) matchScore = 50
    }

    if (matchScore > 0) {
      results.push({ ...item, name: clean, priority: matchScore })
    }
  }

  results.sort((a, b) => b.priority - a.priority)
  return results
}

/** 格式化背包摘要 */
function summarizeInventory(inventory: Array<{ slot: number; name: string; count: number }>, personalityId: string): string {
  if (inventory.length === 0) return '我包里是空的……'

  // 按优先级分组
  const groups: Record<string, { items: string[]; total: number }> = {
    '珍贵': { items: [], total: 0 },
    '工具武器': { items: [], total: 0 },
    '食物': { items: [], total: 0 },
    '木材石料': { items: [], total: 0 },
    '杂物': { items: [], total: 0 },
  }

  for (const item of inventory) {
    const name = itemDisplayName(item.name)
    const p = itemPriority(item.name)
    if (p >= 80) { groups['珍贵'].items.push(name); groups['珍贵'].total++ }
    else if (p >= 40 && (item.name.includes('sword') || item.name.includes('pickaxe') || item.name.includes('axe'))) {
      groups['工具武器'].items.push(name); groups['工具武器'].total++
    }
    else if (p >= 35 && (item.name.includes('cooked') || item.name.includes('steak') || item.name.includes('bread') || item.name.includes('apple'))) {
      groups['食物'].items.push(name); groups['食物'].total++
    }
    else if (p >= 20) { groups['木材石料'].items.push(name); groups['木材石料'].total++ }
    else { groups['杂物'].items.push(name); groups['杂物'].total++ }
  }

  const parts: string[] = []
  for (const [label, g] of Object.entries(groups)) {
    if (g.total === 0) continue
    const unique = [...new Set(g.items)].slice(0, 5).join('、')
    parts.push(`${label}：${unique}${g.total > 5 ? '等' + g.total + '种' : ''}`)
  }

  const tone = personalityId === 'kuudere' ? '清单：' : personalityId === 'tsundere' ? '切，也就有' : '我有'
  return `${tone}${parts.join('；')}。`
}

// ═══════════════════════════════════════════════════════════════
// 干活命令
// ═══════════════════════════════════════════════════════════════
const WORK_COMMANDS: Record<string, { regex: RegExp; task: string }> = {
  farm: { regex: /种地|种田|种菜|种.*种子|种.*小麦|种.*萝卜|种.*土豆|耕/, task: 'farm' },
  chop: { regex: /砍树|砍.*木|伐木|去砍/, task: 'chop' },
  mine: { regex: /挖矿|挖.*矿|去挖|采矿/, task: 'mine' },
  dig: { regex: /挖土|挖.*土|挖沙|铲/, task: 'dig' },
  follow: { regex: /跟.*我|跟.*着|过来|来.*我这|靠.*近/, task: 'follow' },
  stay: { regex: /别.*动|站.*住|等.*着|停.*下|在.*这.*等/, task: 'stay' },
  combat: { regex: /打.*怪|打.*僵尸|打.*骷髅|打.*蜘蛛|打.*苦力怕|去.*打|攻击|杀.*怪|砍.*怪|保护.*我/, task: 'combat' },
}

/** 检测干活命令 */
function detectWorkCommand(msg: string): string | null {
  for (const [, { regex, task }] of Object.entries(WORK_COMMANDS)) {
    if (regex.test(msg)) return task
  }
  return null
}

/** 上一轮回复里提到的可给予物品（供「给我」省略物品名） */
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
    message: `给你${label}！`,
    actions: [
      { kind: 'hold_item', item: item.name },
      { kind: 'look_at', x: playerPosition.x, y: playerPosition.y + 1.6, z: playerPosition.z },
      { kind: 'toss', slot: item.slot, item: item.name } as BotAction,
    ],
  }
}

/** 解析索要物品；null=不是索要；''=省略物品名（给我/给我一下） */
function detectGiveRequest(text: string): string | null {
  if (detectInventoryQueryIntent(text)) return null

  const bare = /^(?:给我|给俺|给我东西|给我点|给我个|给我一下|给我呗|扔我|丢我)$/.test(text)
  if (bare) return ''

  const patterns = [
    /^给我(.+)/,
    /^给俺(.+)/,
    /^把(.+)给我/,
    /^把(.+)递给/,
    /^扔给我(.+)/,
    /^丢给我(.+)/,
    /^(.+)给我$/,
    /^(.+)扔过来$/,
    /^(.+)丢过来$/,
    /^(.+)拿来$/,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (!m?.[1]) continue
    const cleaned = m[1].replace(/[把将你您俺咱咱的一下个些点啦啊吗呢吧]/g, '').trim()
    if (cleaned.length < 1) return ''
    if (/^(我|你|啥|什么|东西|物品|一下|点|个|呗)$/.test(cleaned)) return ''
    return cleaned
  }
  return null
}

/** 是否属于 MC 玩法指令（不应走 LLM 闲聊编造） */
export function isMcGameplayMessage(msg: string): boolean {
  const text = normalizeChatInput(msg)
  return (
    detectInventoryQueryIntent(text) != null ||
    detectGiveRequest(text) != null ||
    detectSpecificItemQuery(text) != null ||
    detectWorkCommand(text) != null
  )
}

// ═══════════════════════════════════════════════════════════════
// 主解析函数
// ═══════════════════════════════════════════════════════════════
/** 供 LLM 兜底时注入的背包摘要（中文） */
export function formatInventoryContext(
  inventory: Array<{ slot: number; name: string; count: number }>,
  heldItemName?: string | null,
): string {
  if (heldItemName) {
    const hand = itemDisplayName(heldItemName)
    const body = inventory.length > 0
      ? summarizeInventory(inventory, 'deredere').replace(/^我有/, '背包里还有')
      : '背包是空的'
    return `手里：${hand}；${body}`
  }
  return inventory.length > 0
    ? summarizeInventory(inventory, 'deredere')
    : '背包是空的'
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

  // ── 1. 模糊语义：背包 / 手上 / 携带物总览 ──
  const invIntent = detectInventoryQueryIntent(text)
  if (invIntent === 'hand') {
    if (heldItemName) {
      rememberMentionedItem(heldItemName)
      return { type: 'reply', message: `手里握着${itemDisplayName(heldItemName)}。` }
    }
    return { type: 'reply', message: '手里空着呢，没拿东西。要看背包再说「你背包有什么」。' }
  }
  if (invIntent === 'bag' || invIntent === 'summary') {
    const summary = summarizeInventory(inventory, personalityId)
    const top = [...inventory].sort((a, b) => itemPriority(b.name) - itemPriority(a.name))[0]
    rememberMentionedItem(top?.name ?? null)
    return { type: 'reply', message: summary }
  }

  // ── 2. 索要物品（优先于「有钻石吗」类查询，避免「给我」去闲聊）──
  const giveQuery = detectGiveRequest(text)
  if (giveQuery !== null) {
    const item = pickItemToGive(inventory, heldItemName, giveQuery || null)
    if (item) {
      return buildGiveResult(item, playerPosition)
    }
    if (giveQuery) {
      return { type: 'reply', message: `我没有${giveQuery}……` }
    }
    return {
      type: 'reply',
      message: '我手里是空的，背包也没东西能给。要说具体点，比如「给我面包」。',
    }
  }

  // ── 3. 特定物品查询（有钻石吗 / 你带剑了吗）──
  const itemQuery = detectSpecificItemQuery(text)
  if (itemQuery) {
    const results = searchInventory(itemQuery, inventory)
    if (results.length > 0) {
      rememberMentionedItem(results[0].name)
      const names = results.slice(0, 5).map(r => itemDisplayName(r.name)).join('、')
      const total = results.reduce((s, r) => s + r.count, 0)
      return { type: 'reply', message: `有！${names}${results.length > 1 ? `，一共 ${total} 个` : ''}` }
    }
    return { type: 'reply', message: `没有${itemQuery}……` }
  }

  // ── 4. 干活命令 ──
  const workTask = detectWorkCommand(text)
  if (workTask === 'farm') {
    const actions: BotAction[] = []
    // 找种子
    const seeds = searchInventory('种子', inventory)
    if (seeds.length > 0) {
      actions.push({ kind: 'hold_item', item: seeds[0].name })
      actions.push({ kind: 'chat', message: '好的，我这就去种地！' })
      return { type: 'both', message: '好的，我这就去种地！', actions }
    }
    // 没种子但有锄头 → 先耕再找
    const hoe = searchInventory('锄头', inventory)
    if (hoe.length > 0) {
      actions.push({ kind: 'hold_item', item: hoe[0].name })
      actions.push({ kind: 'chat', message: '我先把地耕好！' })
      return { type: 'both', message: '我先把地耕好！有种子吗？', actions }
    }
    return { type: 'reply', message: '我没有种子，也没有锄头……没法种地。' }
  }

  if (workTask === 'mine') {
    const pick = searchInventory('镐子', inventory)
    if (pick.length > 0) {
      return {
        type: 'both',
        message: '好的，挖矿去！',
        actions: [{ kind: 'hold_item', item: pick[0].name }, { kind: 'chat', message: '好的，挖矿去！' }],
      }
    }
    return { type: 'reply', message: '没有镐子挖不了矿…' }
  }

  if (workTask === 'chop') {
    const axe = searchInventory('斧头', inventory)
    if (axe.length > 0) {
      return {
        type: 'both',
        message: '砍树去！',
        actions: [{ kind: 'hold_item', item: axe[0].name }, { kind: 'chat', message: '砍树去！' }],
      }
    }
    return { type: 'reply', message: '没有斧头……不过我可以徒手，虽然很慢。' }
  }

  if (workTask === 'follow') {
    return {
      type: 'both',
      message: '来了！',
      actions: [{ kind: 'follow_player', distance: 2 }, { kind: 'chat', message: '来了！' }],
    }
  }

  if (workTask === 'stay') {
    return { type: 'reply', message: '好，我在这里等你。' }
  }

  if (workTask === 'combat') {
    // 装备武器 → 冲向玩家身边的威胁
    const weapon = searchInventory('剑', inventory)
    const axe = searchInventory('斧', inventory)
    const actions: BotAction[] = []
    // 优先剑，没剑用斧
    if (weapon.length > 0) {
      actions.push({ kind: 'hold_item', item: weapon[0].name })
    } else if (axe.length > 0) {
      actions.push({ kind: 'hold_item', item: axe[0].name })
    }
    // 台词人格化
    const lines: Record<string, string> = {
      deredere: '来了！我保护你！', tsundere: '哼，我来解决。躲远点。',
      kuudere: '收到。', genki: '来了来了！！看我的！！',
      yandere: '谁敢碰你谁死。', loyal_pup: '主人我来！！',
      mommy: '别怕，我在这里。', mesugaki: '来啦～你欠我一次哦～',
      shitakiri: '让我看看哪个不长眼的。', ice_queen: '清除威胁。',
      bokke: '诶有怪？！我帮你打！', gap_moe: '（握紧武器）我、我来帮忙！',
    }
    actions.push({ kind: 'chat', message: lines[personalityId] ?? '来了！' })
    // 冲向玩家位置
    actions.push({ kind: 'move_to', x: playerPosition.x, y: playerPosition.y, z: playerPosition.z })
    return { type: 'actions', actions }
  }

  return null
}

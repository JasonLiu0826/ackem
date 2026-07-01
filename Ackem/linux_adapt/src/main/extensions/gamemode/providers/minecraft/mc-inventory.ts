// [gaming/mc-inventory] — 背包与物品管理
// 职责：礼物标记、人格背包逻辑、死亡捡装备、抱怨
// 引用：./types

import type { McGameState } from './types'

/** 被标记为"玩家赠送"的物品（按 name+count 组合追踪，简化版用 slot 索引） */
const giftedSlots = new Set<number>()

/** 首次赠送标记（用于首次钻石等彩蛋） */
const firstGiftCache = new Set<string>()

/** 最近一次收到礼物的时间 */
let lastGiftTime = 0

/** 背包已满抱怨冷却 */
let lastFullComplainTime = 0
const FULL_COMPLAIN_COOLDOWN = 60000 // 1分钟最多抱怨一次

/** 标记一个槽位为玩家赠送 */
export function markSlotAsGifted(slot: number): void {
  giftedSlots.add(slot)
}

/** 检查槽位是否被标记为赠送 */
export function isSlotGifted(slot: number): boolean {
  return giftedSlots.has(slot)
}

/** 清除已不存在的槽位标记 */
export function cleanupGiftedSlots(validSlots: number[]): void {
  for (const slot of giftedSlots) {
    if (!validSlots.includes(slot)) {
      giftedSlots.delete(slot)
    }
  }
}

/** 记录收到礼物 */
export function recordGiftReceived(itemName: string): {
  isFirst: boolean
  reaction: string | null
} {
  lastGiftTime = Date.now()
  const name = itemName.toLowerCase()
  const isFirst = !firstGiftCache.has(name)
  if (isFirst) firstGiftCache.add(name)

  let reaction: string | null = null
  return { isFirst, reaction }
}

/** 根据人格生成收到礼物的台词 */
export function giftReaction(itemName: string, personalityId: string): string {
  const name = itemName.replace(/_/g, ' ')
  const tsundereLines = [
    `哼！又不是我想要才收下的……不过谢谢。`,
    `你给我这个干嘛……算了，我收着。`,
    `…谢谢。不是因为你我才说的！`,
  ]
  const sweetLines = [
    `哇！${name}！谢谢你！`,
    `你给我了？好开心！我会好好保管的！`,
    `${name}！我会一直收着的！`,
  ]
  const kuudereLines = [
    `谢谢。`,
    `嗯。收下了。`,
    `（小心地放进背包里）`,
  ]
  const genkiLines = [
    `哇啊啊！！${name}！！太棒了！！`,
    `你最好啦！！！谢谢！！！`,
    `哈哈哈我好开心！！`,
  ]
  const yandereLines = [
    `你给我的？……我会永远留着。永远。`,
    `${name}……你送我的东西，死也不扔。`,
  ]

  const pool: Record<string, string[]> = {
    tsundere: tsundereLines, deredere: sweetLines, kuudere: kuudereLines,
    genki: genkiLines, yandere: yandereLines, loyal_pup: sweetLines,
    mommy: sweetLines, gap_moe: sweetLines, bokke: genkiLines,
    shitakiri: tsundereLines, mesugaki: tsundereLines, ice_queen: kuudereLines,
  }

  const lines = pool[personalityId] ?? sweetLines
  return lines[Math.floor(Math.random() * lines.length)]
}

/** 检查是否该抱怨背包满了 */
export function shouldComplainFull(inventoryUsed: number, totalSlots: number): boolean {
  const now = Date.now()
  if (inventoryUsed >= totalSlots - 2 && now - lastFullComplainTime > FULL_COMPLAIN_COOLDOWN) {
    lastFullComplainTime = now
    return true
  }
  return false
}

/** 背包满了的抱怨台词 */
export function fullInventoryLine(personalityId: string, giftedCount: number): string {
  if (giftedCount > 3) {
    return '背包又满了！！……但你给的东西我一个都舍不得扔'
  }
  const lines: Record<string, string[]> = {
    deredere: ['背包满了呢……得整理一下了', '东西好多，找个箱子放吧？'],
    tsundere: ['切，背包又满了。都是些没用的东西……', '哼，满了。但这几个是你给的，不能扔。'],
    kuudere: ['满了。', '背包满了。'],
    genki: ['哇哇哇背包炸了！！', '东西太多啦！！'],
    bokke: ['诶我背包什么时候满的？', '啊咧？放不下了？'],
    mommy: ['背包满了……得找个箱子整理了', '东西有点多，我去找个箱子？'],
  }
  const pool = lines[personalityId] ?? ['背包满了…']
  return pool[Math.floor(Math.random() * pool.length)]
}

/** 找一个可以丢弃的非礼物槽位（价值最低的） */
export function findDiscardableSlot(
  items: Array<{ slot: number; name: string; count: number }>,
  personalityId: string
): number | null {
  // 低价值物品名单
  const lowValue = new Set([
    'dirt', 'cobblestone', 'gravel', 'sand', 'rotten_flesh', 'bone',
    'string', 'spider_eye', 'seeds', 'wheat_seeds', 'poisonous_potato',
    'kelp', 'bamboo', 'stick', 'feather', 'flint', 'egg',
  ])

  const discardable = items.filter(i => !giftedSlots.has(i.slot))

  // 人格偏好：天然呆不扔花，傲娇不扔剑相关
  const keepItems: Record<string, Set<string>> = {
    bokke: new Set(['poppy', 'dandelion', 'blue_orchid', 'allium']),
    tsundere: new Set(['diamond_sword', 'iron_sword', 'stone_sword', 'diamond']),
    mommy: new Set(['golden_apple', 'apple', 'bread', 'cooked_beef']),
    yandere: new Set(['diamond_sword', 'iron_sword']),
  }
  const keep = keepItems[personalityId]

  // 优先丢低价值非礼物物品
  let best: { slot: number; name: string; count: number } | null = null
  for (const item of discardable) {
    if (keep?.has(item.name)) continue
    if (lowValue.has(item.name)) return item.slot
    if (!best) best = item
  }
  return best?.slot ?? null
}

/** 玩家死亡掉落物检测——玩家死亡时在附近生成大量掉落物 */
export function detectPlayerDeathDrops(
  nearbyItems: Array<{ type: string; distance: number }>,
  botPosition: { x: number; y: number; z: number }
): { shouldCollect: boolean; collectLine: string } {
  if (nearbyItems.length >= 3) {
    return {
      shouldCollect: true,
      collectLine: '你的东西掉了！我帮你捡……',
    }
  }
  return { shouldCollect: false, collectLine: '' }
}

/** 获取礼物统计 */
export function getGiftStats(): { giftedCount: number; firstItems: string[] } {
  return {
    giftedCount: giftedSlots.size,
    firstItems: [...firstGiftCache],
  }
}

/** Bot 死亡次数 */
let deathCount = 0

/** 记录一次死亡 */
export function recordDeath(): number {
  deathCount++
  return deathCount
}

/** 获取死亡次数 */
export function getDeathCount(): number {
  return deathCount
}

/** 死亡反应（按人格） */
export function deathReaction(personalityId: string, deathCount: number, cause?: string): string {
  const causeText = cause ? `被${cause}打死了` : '死了'
  const firstDeathPool: Record<string, string[]> = {
    deredere: ['……我死了吗？没事，重生就好。你在哪？', '好痛……不过没关系，我回来了。'],
    tsundere: ['哼，死了一次而已。别担心，不是因为你。', '……死了。不过别以为我会承认自己菜。'],
    yandere: ['死了……但没关系。只要还能回到你身边。', '死一次算什么。为了你，死一百次都可以。'],
    kuudere: ['死了。重生中。', '死了一次。继续。'],
    genki: ['哇哇哇我死了！！哈哈重生了好神奇！！', '死了！不过又活啦！！'],
    shitakiri: ['啧，被干掉了。不过对面也没好到哪去。', '死了一次而已，不丢人。'],
    mesugaki: ['啊啊啊我死了！！……骗你的，重生啦～', '死了一次～但你还是得保护我！'],
    gap_moe: ['死了一次……好丢人。但为了你，我还能再战。', '……（沉默两秒）重生好了。走吧。'],
    ice_queen: ['死了一次。无妨。', '……死了。继续前进吧。'],
    bokke: ['诶？我刚才死了吗？', '好像死了一次……不过没关系的说～'],
    loyal_pup: ['我死了……对不起，没能保护好自己。下次不会了。', '死了一次。但只要你没事就好。'],
    mommy: ['哎呀，死了一次。太不小心了……你没事吧？', '死了呢……不过担心的是你有没有受伤。'],
  }
  const multiDeathPool: Record<string, string[]> = {
    deredere: [`第${deathCount}次了……我是不是太不小心了`, '又死了……你会不会觉得我很没用？'],
    tsundere: [`第${deathCount}次了！……但不关你的事。`, '又死了……哼，运气问题。'],
    yandere: [`第${deathCount}次了。但只要能回到你身边，多少次都行。`, '又死了一次……不过离你更近了。'],
    kuudere: [`第${deathCount}次。`, '又死了一次。继续。'],
    genki: [`第${deathCount}次死亡！！我的死亡纪录更新啦！！`, '又死了！但我每次都活着回来！'],
    shitakiri: [`第${deathCount}次了……好像有点丢人了。`, '又死了。你帮我数着？'],
    loyal_pup: [`第${deathCount}次了……对不起，又让你担心了。`, '又死了。但你一次都没怪过我……'],
    mommy: [`第${deathCount}次死亡……得小心一点了。`, '又死了……你千万别学我。'],
  }

  if (deathCount <= 1) {
    const pool = firstDeathPool[personalityId] ?? firstDeathPool['deredere']
    return pool[Math.floor(Math.random() * pool.length)]
  }
  const pool = multiDeathPool[personalityId] ?? [`第${deathCount}次死亡了……`, '又死了……这次是因为什么？']
  return pool[Math.floor(Math.random() * pool.length)]
}

/** 死亡时丢失物品的台词 */
export function lostItemsLine(personalityId: string): string {
  const lines: Record<string, string[]> = {
    deredere: ['我的东西都掉了……能帮我捡一下吗？', '装备掉了一地……算了，慢慢攒回来吧。'],
    tsundere: ['装备掉了……哼，反正也没多好。', '东西掉了。……你帮我捡了？没有？算了。'],
    yandere: ['你给我的东西还在吗？……还在就好。', '装备掉了无所谓。你给的东西……没丢吧？'],
    kuudere: ['装备掉了。', '东西掉了。重新收集。'],
    genki: ['啊啊啊我的装备！！全掉光了！！', '装备掉了！又要重新挖矿啦！！'],
    loyal_pup: ['装备掉了……又要麻烦你了。', '东西都掉了。不过我没事。'],
    mommy: ['装备掉了呢……食物还在吗？你饿不饿？', '东西掉了。不过最要紧的是你没事。'],
  }
  const pool = lines[personalityId] ?? ['装备掉了……']
  return pool[Math.floor(Math.random() * pool.length)]
}

// [gaming/mc-event-parser] — MC 日志解析器
// 职责：读取 latest.log 新增行 → 匹配正则 → 输出 McGameEvent
// 引用：./types, ../../docs/mainDocs/MC事件脚本全目录.md

import type { McGameEvent } from './types'

type Pattern = {
  regex: RegExp
  type: string
  extract?: (m: RegExpMatchArray) => Record<string, string>
}

/** 日志行 → 事件类型映射（顺序优先：更具体的规则靠前） */
const PATTERNS: Pattern[] = [
  // ── 死亡（具体死因）──
  { regex: /fell out of the world/i, type: 'mc:death_by_void' },
  { regex: /froze to death/i, type: 'mc:death_by_freeze' },
  { regex: /was struck by lightning/i, type: 'mc:death_by_lightning' },
  { regex: /was squashed by a falling anvil/i, type: 'mc:death_by_anvil' },
  { regex: /went off with a bang due to a firework/i, type: 'mc:death_by_firework' },
  { regex: /withered away/i, type: 'mc:death_by_dragon', extract: () => ({ deathCause: 'wither' }) },
  { regex: /starved to death/i, type: 'mc:player_hungry', extract: () => ({ deathCause: 'starve' }) },
  { regex: /suffocated in a wall/i, type: 'mc:death_by_fall', extract: () => ({ deathCause: 'suffocate' }) },
  { regex: /tried to swim in lava/i, type: 'mc:death_by_lava' },
  { regex: /went up in flames/i, type: 'mc:death_by_lava' },
  { regex: /burned to death/i, type: 'mc:death_by_lava' },
  { regex: /drowned/i, type: 'mc:death_by_drown' },
  { regex: /fell from a high place/i, type: 'mc:death_by_fall' },
  { regex: /hit the ground too hard/i, type: 'mc:death_by_fall' },
  { regex: /blew up/i, type: 'mc:death_by_creeper' },
  { regex: /was killed by fireworks/i, type: 'mc:death_by_firework' },
  { regex: /was slain by Warden/i, type: 'mc:player_death_warden_witnessed', extract: (m) => ({ mobType: 'Warden' }) },
  { regex: /was slain by Creeper/i, type: 'mc:player_death_creeper_witnessed', extract: () => ({ mobType: 'Creeper' }) },
  {
    regex: /was slain by (Zombie|Skeleton|Spider|Enderman|Witch|Guardian|Elder Guardian|Piglin Brute|Vindicator|Ravager|Zombified Piglin|Blaze|Ghast|Magma Cube|Slime|Silverfish|Endermite|Shulker|Phantom|Drowned|Husk|Stray|Evoker|Vex|Pillager|Wither|Iron Golem)/i,
    type: 'mc:player_death_witnessed',
    extract: (m) => ({ deathCause: 'mob', mobType: m[1] }),
  },
  { regex: /was slain by (Ender Dragon)/i, type: 'mc:death_by_dragon', extract: (m) => ({ mobType: m[1] }) },
  { regex: /was killed by magic/i, type: 'mc:player_death_witnessed', extract: () => ({ deathCause: 'magic' }) },
  { regex: /was fireballed by (Ghast|Blaze)/i, type: 'mc:player_death_witnessed', extract: (m) => ({ mobType: m[1] }) },
  { regex: /was shot by (Skeleton|Pillager|Piglin|Stray)/i, type: 'mc:player_death_witnessed', extract: (m) => ({ mobType: m[1] }) },
  { regex: /was pummeled by (Iron Golem)/i, type: 'mc:iron_golem_hostile', extract: (m) => ({ mobType: m[1] }) },

  // ── 成就 / 进度 ──
  { regex: /has made the advancement \[(.+?)\]/i, type: 'mc:achievement_unlock', extract: (m) => ({ achievementName: m[1] }) },
  { regex: /has completed the challenge \[(.+?)\]/i, type: 'mc:achievement_unlock', extract: (m) => ({ achievementName: m[1] }) },
  { regex: /has reached the goal \[(.+?)\]/i, type: 'mc:achievement_unlock', extract: (m) => ({ achievementName: m[1] }) },

  // ── 维度 ──
  { regex: /entered the Nether/i, type: 'mc:dimension_nether_enter', extract: () => ({ dimensionName: 'the Nether' }) },
  { regex: /entered the End/i, type: 'mc:dimension_end_enter', extract: () => ({ dimensionName: 'the End' }) },
  { regex: /entered the Overworld/i, type: 'mc:dimension_overworld_return', extract: () => ({ dimensionName: 'the Overworld' }) },
  { regex: /left the (Nether|End)/i, type: 'mc:dimension_overworld_return', extract: (m) => ({ dimensionName: m[1] }) },

  // ── 袭击 / Boss ──
  { regex: /Raid (?:has been )?defeated/i, type: 'mc:raid_victory' },
  { regex: /A Raid has begun/i, type: 'mc:raid_start' },
  { regex: /slain the Ender Dragon/i, type: 'mc:dragon_defeat' },
  { regex: /slain the Wither/i, type: 'mc:wither_defeat' },

  // ── 天气（部分服务器会写入日志）──
  { regex: /The weather changed to rain/i, type: 'mc:rain_start' },
  { regex: /The weather cleared/i, type: 'mc:weather_clear' },
  { regex: /Thunder begins/i, type: 'mc:thunder_start' },

  // ── 玩家进出 ──
  { regex: /joined the game/i, type: 'mc:player_return' },
  { regex: /left the game/i, type: 'mc:player_afk_30s' },

  // ── 聊天（通用，聊天分支会再细分）──
  { regex: /<(.+?)> (.+)/, type: 'mc:player_chat', extract: (m) => ({ playerName: m[1], chatMessage: m[2] }) },
]

function stripLogPrefix(line: string): string {
  return line.replace(/^\[.*?\] \[.*?\]: /, '').replace(/^\[.*?\]: /, '')
}

/** 解析一行日志 → McGameEvent | null */
export function parseLogLine(line: string): McGameEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  const timeMatch = trimmed.match(/^\[(\d{2}:\d{2}:\d{2})\]/)
  const timestamp = timeMatch ? timeMatch[1] : ''

  // 聊天行（优先于 server 分支）
  const chatMatch = trimmed.match(/<(.+?)> (.+)/)
  if (chatMatch) {
    const msg = chatMatch[2]
    const lower = msg.toLowerCase()
    if (/哈哈|hhh|www|lol|lmao|笑死|草/.test(lower)) {
      return { type: 'mc:player_chat_laugh', raw: trimmed, payload: { chatMessage: msg }, timestamp }
    }
    if (/啊|操|卧槽|我死了|救命|完了|fuck|shit|苦力怕|creeper/.test(lower)) {
      return { type: 'mc:player_chat_panic', raw: trimmed, payload: { chatMessage: msg }, timestamp }
    }
    return {
      type: 'mc:player_chat',
      raw: trimmed,
      payload: { playerName: chatMatch[1], chatMessage: msg },
      timestamp,
    }
  }

  if (!/\[Server thread|INFO|WARN|ERROR/i.test(trimmed)) return null

  const eventPart = stripLogPrefix(trimmed)
  for (const p of PATTERNS) {
    if (p.regex.source.includes('<(.+?)>')) continue
    const m = eventPart.match(p.regex)
    if (m) {
      return {
        type: p.type,
        raw: trimmed,
        payload: p.extract ? p.extract(m) : undefined,
        timestamp,
      }
    }
  }

  return null
}

/** 批量解析日志行 */
export function parseLogBatch(lines: string[]): McGameEvent[] {
  return lines.map(parseLogLine).filter((e): e is McGameEvent => e !== null)
}

import { getPreset } from '../../personalityPresets'

export type WeixinSplitStyle =
  | 'short_burst'
  | 'punchline'
  | 'monologue'
  | 'warm_flow'
  | 'clingy'
  | 'command'
  | 'gap_reveal'

export type WeixinDeliveryProfile = {
  presetId: string
  splitStyle: WeixinSplitStyle
  bubbleRange: [number, number]
  /** 合并碎屑时的参考长度，不用于硬截断 */
  maxCharsPerBubble: number
  gapMs: [number, number]
  /** 每字额外的"打字"耗时（毫秒）。0/未设 = 纯随机间隔；真人打字时长与字数正相关 */
  typingMsPerChar?: number
  /** 0~1：句内/独发 emoji 的整体倾向 */
  emojiDensity: number
  /** 单独发 1 个 emoji 气泡的概率 */
  standaloneEmojiChance: number
  /** 单独发 3 个同 emoji 气泡的概率（在 standalone 命中后） */
  tripleEmojiChance: number
  pingFirst: boolean
  stickerAffinity: number
}

function profile(
  presetId: string,
  splitStyle: WeixinSplitStyle,
  opts: Partial<Omit<WeixinDeliveryProfile, 'presetId' | 'splitStyle'>> = {}
): WeixinDeliveryProfile {
  const defaults: Omit<WeixinDeliveryProfile, 'presetId' | 'splitStyle'> = {
    bubbleRange: [2, 3],
    maxCharsPerBubble: 28,
    gapMs: [450, 900],
    emojiDensity: 0.35,
    standaloneEmojiChance: 0.12,
    tripleEmojiChance: 0.25,
    pingFirst: true,
    stickerAffinity: 0.2
  }
  return { presetId, splitStyle, ...defaults, ...opts }
}

const PROFILES: WeixinDeliveryProfile[] = [
  profile('tsundere', 'short_burst', {
    emojiDensity: 0.25,
    standaloneEmojiChance: 0.08,
    tripleEmojiChance: 0.1,
    maxCharsPerBubble: 26
  }),
  profile('yandere', 'clingy', {
    bubbleRange: [2, 3],
    gapMs: [350, 700],
    emojiDensity: 0.4,
    standaloneEmojiChance: 0.15,
    maxCharsPerBubble: 30
  }),
  profile('oneesan', 'warm_flow', {
    pingFirst: false,
    emojiDensity: 0.3,
    maxCharsPerBubble: 32
  }),
  profile('genki', 'short_burst', {
    bubbleRange: [2, 3],
    gapMs: [300, 650],
    emojiDensity: 0.65,
    standaloneEmojiChance: 0.22,
    tripleEmojiChance: 0.45,
    maxCharsPerBubble: 24
  }),
  profile('kuudere', 'monologue', {
    bubbleRange: [1, 2],
    pingFirst: false,
    emojiDensity: 0.05,
    standaloneEmojiChance: 0.03,
    tripleEmojiChance: 0,
    maxCharsPerBubble: 40,
    gapMs: [700, 1200]
  }),
  // Freya：真人语料型。说话极短、爱连发。
  // 频次刻意压低：emoji 只偶尔点缀，表情包约十条一次——发太密立刻不像人。
  // gapMs 是"读完上一条 + 开始打下一句"的停顿，typingMsPerChar 补上真正的打字时间。
  profile('freya', 'short_burst', {
    // 上限放到 3 条：长句拆短后需要放得下，否则会被 clamp 又粘成长条；
    // 下限仍是 1，短回复不会被硬拆。
    bubbleRange: [2, 3],
    // 停顿下限抬到 1.6 秒：1.1 秒在 QQ 里看起来还是"秒回连发"
    gapMs: [1600, 2800],
    // 每个字 70ms，接近真人手机打字；短句也要有个抬手的时间
    typingMsPerChar: 70,
    // 原生 emoji 只做极少量点缀（约五十句一次），表情包才是主要表达
    emojiDensity: 0,
    standaloneEmojiChance: 0,
    tripleEmojiChance: 0,
    maxCharsPerBubble: 24,
    // 表情包是主要表达，但别太密：约三轮半一张（被明确要图时不受这个概率限制）
    stickerAffinity: 0.30
  }),
  profile('deredere', 'warm_flow', {
    emojiDensity: 0.45,
    standaloneEmojiChance: 0.14,
    maxCharsPerBubble: 30
  }),
  profile('shitakiri', 'punchline', {
    bubbleRange: [2, 2],
    gapMs: [600, 1000],
    emojiDensity: 0.2,
    standaloneEmojiChance: 0.1,
    maxCharsPerBubble: 32
  }),
  profile('bokke', 'short_burst', {
    emojiDensity: 0.5,
    standaloneEmojiChance: 0.18,
    tripleEmojiChance: 0.35,
    maxCharsPerBubble: 26
  }),
  profile('ice_queen', 'monologue', {
    bubbleRange: [1, 2],
    emojiDensity: 0.08,
    standaloneEmojiChance: 0.04,
    maxCharsPerBubble: 38,
    gapMs: [800, 1300]
  }),
  profile('girl_next_door', 'warm_flow', {
    emojiDensity: 0.38,
    pingFirst: false,
    maxCharsPerBubble: 32
  }),
  profile('ceo_dom', 'command', {
    bubbleRange: [1, 2],
    pingFirst: false,
    emojiDensity: 0.12,
    standaloneEmojiChance: 0.05,
    maxCharsPerBubble: 36,
    gapMs: [550, 950]
  }),
  profile('gentle_warmth', 'warm_flow', {
    emojiDensity: 0.42,
    standaloneEmojiChance: 0.12,
    maxCharsPerBubble: 34
  }),
  profile('puppy', 'short_burst', {
    bubbleRange: [2, 3],
    gapMs: [320, 680],
    emojiDensity: 0.55,
    standaloneEmojiChance: 0.2,
    tripleEmojiChance: 0.4,
    maxCharsPerBubble: 26
  }),
  profile('iceberg', 'monologue', {
    bubbleRange: [1, 1],
    emojiDensity: 0.05,
    standaloneEmojiChance: 0.02,
    maxCharsPerBubble: 42,
    gapMs: [900, 1400]
  }),
  profile('schemer', 'punchline', {
    emojiDensity: 0.22,
    standaloneEmojiChance: 0.08,
    maxCharsPerBubble: 34
  }),
  profile('loyal_knight', 'clingy', {
    emojiDensity: 0.3,
    standaloneEmojiChance: 0.1,
    maxCharsPerBubble: 32
  }),
  profile('bad_boy', 'punchline', {
    emojiDensity: 0.28,
    standaloneEmojiChance: 0.12,
    maxCharsPerBubble: 30
  }),
  profile('artistic', 'warm_flow', {
    bubbleRange: [1, 2],
    pingFirst: false,
    emojiDensity: 0.25,
    maxCharsPerBubble: 36
  }),
  profile('innocent_boy', 'short_burst', {
    emojiDensity: 0.48,
    standaloneEmojiChance: 0.16,
    tripleEmojiChance: 0.3,
    maxCharsPerBubble: 26
  }),
  profile('boy_next_door', 'warm_flow', {
    emojiDensity: 0.35,
    pingFirst: false,
    maxCharsPerBubble: 32
  }),
  profile('submissive', 'clingy', {
    bubbleRange: [2, 3],
    gapMs: [380, 750],
    emojiDensity: 0.38,
    standaloneEmojiChance: 0.14
  }),
  profile('dominatrix', 'command', {
    bubbleRange: [1, 2],
    emojiDensity: 0.15,
    standaloneEmojiChance: 0.06,
    maxCharsPerBubble: 34
  }),
  profile('loyal_pup', 'clingy', {
    bubbleRange: [2, 3],
    gapMs: [350, 720],
    emojiDensity: 0.52,
    standaloneEmojiChance: 0.18,
    tripleEmojiChance: 0.35
  }),
  profile('tamer', 'command', {
    bubbleRange: [1, 2],
    emojiDensity: 0.14,
    maxCharsPerBubble: 35
  }),
  profile('mommy', 'warm_flow', {
    emojiDensity: 0.4,
    standaloneEmojiChance: 0.1,
    maxCharsPerBubble: 34
  }),
  profile('mesugaki', 'short_burst', {
    bubbleRange: [2, 3],
    gapMs: [280, 620],
    emojiDensity: 0.58,
    standaloneEmojiChance: 0.2,
    tripleEmojiChance: 0.42,
    maxCharsPerBubble: 32
  }),
  profile('gap_moe_f', 'gap_reveal', {
    bubbleRange: [1, 3],
    emojiDensity: 0.32,
    standaloneEmojiChance: 0.12,
    maxCharsPerBubble: 30
  }),
  profile('daddy', 'warm_flow', {
    emojiDensity: 0.35,
    pingFirst: false,
    maxCharsPerBubble: 34
  }),
  profile('gap_moe_m', 'gap_reveal', {
    bubbleRange: [1, 3],
    emojiDensity: 0.3,
    standaloneEmojiChance: 0.1,
    maxCharsPerBubble: 32
  })
]

const BY_ID = new Map(PROFILES.map((p) => [p.presetId, p]))

export function getWeixinDeliveryProfile(presetId: string): WeixinDeliveryProfile {
  return BY_ID.get(presetId) ?? profile(presetId, 'warm_flow')
}

export function buildWeixinPsycheHint(presetId: string): string {
  const p = getWeixinDeliveryProfile(presetId)
  const preset = getPreset(presetId)
  const label = preset?.label ?? presetId
  const [minB, maxB] = p.bubbleRange
  return (
    `\n\n【微信连发】你在手机微信里说话，像真人连发 ${minB}–${maxB} 条短消息，不要小作文。\n` +
    `- 用 [SPLIT] 分隔每条（至少 ${minB} 条，最多 ${maxB} 条）\n` +
    `- 第一条先接话（≤15字），不要一次说完\n` +
    `- 每条必须有标点：句中用逗号，句末用句号/问号/省略号，别把两句粘成一串\n` +
    `- 每条结尾不要用逗号收尾（读起来像话没说完）\n` +
    `- 禁止 markdown、列表、编号\n` +
    `- emoji 可写在句中；需要单独发表情时可写 [emoji:😂] 或 [emoji:😂×3]\n` +
    `- 可选贴纸占位：[sticker:${presetId}_示例]（有资源时会发图）\n` +
    `- 人格：${label}，语气必须符合此人设`
  )
}

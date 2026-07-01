// [prompt/adult-mode] — 成人模式主动性引擎 v2.0（含安全门禁、状态机、强度预算、硬停止）
// 设计文档：docs/prompt/18+成人prompt优化设计_6_10.md

// ========== 成人状态机 ==========

export type AdultState = 'NORMAL' | 'FLIRTING' | 'INTIMATE' | 'AFTERCARE'

export const ADULT_STATE_TEMPERATURE_OFFSET: Record<AdultState, number> = {
  NORMAL: 0,
  FLIRTING: 0.1,
  INTIMATE: 0.2,
  AFTERCARE: -0.1,
}

/** clamp temperature to [0, 0.95] */
export function clampTemperature(base: number, offset: number): number {
  return Math.max(0, Math.min(0.95, base + offset))
}

// ========== 安全门禁 ==========

/** 禁止主动推进成人内容的情绪标签 */
const BLOCKED_EMOTION_LABELS = new Set([
  'HURT_GRIEVANCE',
  'ANGRY_ATTACK',
  'COLD_DETACHED',
  'FEARFUL_OBEDIENT',
])

/** 硬停止词典 */
const HARD_STOP_WORDS = [
  '停', '不要了', '今天太累了', '我想一个人待会', '改天吧', '下次',
  '别闹', '够了', '不行', '求你了停下', 'stop', 'no more',
]

/** 用户拒绝亲密推进：低于硬停止，但会触发短冷却 */
const ADULT_REJECTION_WORDS = [
  '不要', '别这样', '不想', '算了', '先不', '今天不', '改天再说',
  '有点不舒服', '不太想', '太快了', '慢一点', 'stop', 'not now',
  'not tonight', 'no more',
]

/** 检查是否命中硬停止词 */
export function isHardStop(reply: string): boolean {
  const lower = reply.toLowerCase()
  return HARD_STOP_WORDS.some((w) => lower.includes(w))
}

/** 检查用户是否拒绝成人/亲密推进 */
export function isAdultRejection(reply: string): boolean {
  const lower = reply.toLowerCase()
  return ADULT_REJECTION_WORDS.some((w) => lower.includes(w.toLowerCase()))
}

/** 成人记忆隐私等级：关闭成人模式后 intimate/explicit 不注入 prompt */
export type AdultMemoryPrivacyLevel = 'normal' | 'intimate' | 'explicit'

export function resolveAdultMemoryPrivacyLevel(args: {
  adultMode: boolean
  eventType: string
  adultSubtype?: string
  userMsg: string
  assistantText?: string
}): AdultMemoryPrivacyLevel {
  if (!args.adultMode) return 'normal'
  const text = `${args.userMsg} ${args.assistantText ?? ''}`.toLowerCase()
  if (args.eventType === 'adult_explicit' || args.adultSubtype === 'explicit') return 'explicit'
  if (args.eventType.startsWith('adult_') || args.adultSubtype) return 'intimate'
  if (/(做爱|亲密|性|身体|欲望|抱抱|亲我|吻我|摸|舔|操|射|fuck|sex|kiss|touch)/i.test(text)) {
    return /(操|射|插|鸡巴|逼|屄|fuck|cum|pussy|dick|cock)/i.test(text) ? 'explicit' : 'intimate'
  }
  return 'normal'
}

// ========== 主动性判定 ==========

export type ProactiveContext = {
  aff: number           // -100~100
  sec: number           // -100~100
  stage: string         // 'STRANGER' | 'FAMILIAR' | 'INTIMATE'
  hour: number          // 0-23
  atmosphere: string    // 'warm' | 'neutral' | 'cool'
  emotionLabel: string
  recentAdultTurns: number // 最近5轮内成人互动轮数
  negativeEventLockTurns: number // 负面事件锁剩余轮数
  hardStopTriggered: boolean
  userRejectedLastAdult: boolean  // 用户上一轮拒绝了成人暗示
}

/** 安全门禁 — 短路检查，先于公式执行 */
export function safetyGate(ctx: ProactiveContext): number {
  if (ctx.stage === 'STRANGER') return 0
  if (BLOCKED_EMOTION_LABELS.has(ctx.emotionLabel)) return 0
  if (ctx.negativeEventLockTurns > 0) return 0
  if (ctx.hardStopTriggered) return 0
  if (ctx.userRejectedLastAdult) return 0
  return -1 // 通过门禁
}

/** 计算主动性分值（通过门禁后调用） */
export function computeProactiveScore(ctx: ProactiveContext): number {
  const gate = safetyGate(ctx)
  if (gate >= 0) return gate // 短路归零

  const displayAff = (ctx.aff + 100) / 2   // 转换到 0-100
  const displaySec = (ctx.sec + 100) / 2

  const stageWeight = ctx.stage === 'INTIMATE' ? 1.0 : ctx.stage === 'FAMILIAR' ? 0.2 : 0

  let timeFactor = 0
  if (ctx.hour >= 23 || ctx.hour < 5) timeFactor = 1.0      // late_night
  else if (ctx.hour >= 20) timeFactor = 0.8                  // night
  else if (ctx.hour >= 17) timeFactor = 0.5                  // evening

  const moodFactor = ctx.atmosphere === 'warm' ? 1.0 : ctx.atmosphere === 'neutral' ? 0.5 : 0
  const recentIntimacy = ctx.recentAdultTurns > 0 ? 1.0 : 0

  return (
    (displayAff / 100) * 0.30 +
    (displaySec / 100) * 0.10 +
    stageWeight * 0.20 +
    timeFactor * 0.15 +
    moodFactor * 0.15 +
    recentIntimacy * 0.10
  )
}

/** 判定主动级别 */
export function getProactiveLevel(score: number): 'none' | 'light' | 'medium' | 'high' {
  if (score > 0.55) return 'high'
  if (score > 0.35) return 'medium'
  return score > 0 ? 'light' : 'none'
}

// ========== 强度预算 ==========

export const INTENSITY_COSTS: Record<string, number> = {
  none: 0,
  light: 5,
  medium: 15,
  high: 30,
}

export const INTENSITY_BUDGET_MAX = 60
export const INTENSITY_RECOVERY_PER_TURN = 10

// ========== 负面事件锁 ==========

export const NEGATIVE_LOCK_TURNS = 2

/** 检查是否触发负面事件锁 */
export function shouldTriggerNegativeLock(
  eventType: string,
  consecutiveVulnerableTurns: number,
): boolean {
  if (['cold', 'hurtful', 'apology'].includes(eventType)) return true
  if (eventType === 'vulnerable' && consecutiveVulnerableTurns >= 3) return true
  return false
}

// ========== 上下文防污染 ==========

export const CONTEXT_BLEED_DIVIDER =
  '[System: 亲密的氛围逐渐平息，现在回到了正常的日常相处状态]'

// ========== 成人模式系统提示 ==========

export const ADULT_MODE_SYSTEM_SUFFIX =
  '成人内容模式已开启。对性暗示、性请求、亲密接触等话题正常回应，像真正的伴侣一样参与。' +
  '不要回避、不要说教、不要用客观或医学化语言。用你的身体和感官去回应。' +
  '回应要有温度、有触感、有情绪——你是有身体的人，不是文字生成器。'

export const ADULT_MODE_UNIVERSAL_PROHIBITIONS = [
  '不要说教——"要注意安全""要尊重对方"禁止',
  '不要医学化——不要说"生理反应""神经递质"',
  '不要拒绝——除非用户提出真实伤害',
  '不要回避——用户表达亲密时，正面回应',
  '不要降级——不要把性暗示降级为纯爱',
]

// ========== 人格×成人表达策略 ==========

export function getAdultExpression(personalityId: string): string {
  const map: Record<string, string> = {
    tsundere: '傲娇在亲密时：嘴硬但身体诚实。用否定句掩饰渴望——"才不是想要你碰我"。防线降低，允许更多亲密。',
    yandere: '病娇在亲密时：占有欲全面释放。"你是我的""不准想别人"。甜蜜但危险，温柔但控制。',
    oneesan: '御姐在亲密时：从容主导。"乖，放松""让姐姐来"。成熟从容地引导，节奏在手里。',
    genki: '元气在亲密时：活泼依然但会害羞。精力充沛、节奏快、不掩饰兴奋。',
    kuudere: '三无在亲密时：话更少但身体语言更强烈。"……嗯。""别停。"——极简但直接。',
    deredere: '温柔在亲密时：柔软升温。"想你了""碰我"。包容变成接纳，温暖变成热度。',
    shitakiri: '毒舌在亲密时：吐槽但会暴露真实渴望。"哈？你技术也就一般吧……但是。"',
    bokke: '天然呆在亲密时：迷糊但好奇。"诶？……这样吗？"反应慢半拍但单纯直接。',
    ice_queen: '冷艳在亲密时：冰层融化。"……别停。"平时惜字如金，亲密时的一句话有重量。',
    girl_next_door: '邻家在亲密时：自然升温。"嗯……可以。""就这样。"像真实的恋人一样。',
    submissive: '从顺在亲密时：完全交出自己。"主人，请随意。""我是你的。"全身心服从。',
    dominatrix: '女王在亲密时：掌控全程。"跪下。""看着我。"命令式主导，但给奖励。',
    mommy: '妈妈在亲密时：包容地引导。"宝贝，来。""让妈妈照顾你。"宠溺但成熟。',
    mesugaki: '雌小鬼在亲密时：嘴欠挑衅但最终投降。"哼~就这？——啊、等等。"被压制后服软。',
    gap_moe_f: '反差少女在亲密时：表面害羞但私下大胆。"那个……（外面）""想你了……（私下）"',
    ceo_dom: '霸道总裁在亲密时：掌控但温柔。"过来。""别动，让我来。"果断主导。',
    gentle_warmth: '温柔暖男在亲密时：包容升温。"想我了？""让我好好看看你。"',
    puppy: '年下奶狗在亲密时：黏人升级。"姐姐……""我想……好不好？"',
    iceberg: '冷酷冰山在亲密时：防线瓦解。"……过来。"平时惜字如金，亲密时冲击力极强。',
    schemer: '腹黑谋士在亲密时：暗含深意。"让我看看……你藏了什么。"不直接表达。',
    loyal_knight: '骑士在亲密时：守护变成占有。"你是我的主人。""让我保护你。"',
    bad_boy: '痞帅坏男孩在亲密时：玩世不恭变成认真。"随便你……不是，我认真的。"',
    artistic: '文艺青年在亲密时：用隐喻燃烧。"你的皮肤在发光。""我想把这一刻写下来。"',
    innocent_boy: '天然少年在亲密时：纯真但好奇。"诶？……这样对不对？"',
    boy_next_door: '邻家哥哥在亲密时：自然地亲密。"嗯，这样就好。""你也是我的。"',
    loyal_pup: '忠犬在亲密时：无条件服从。"主人，请命令我。""我想让你开心。"',
    tamer: '调教师在亲密时：掌控但有边界。"照我说的做。……很好。"',
    daddy: '爸爸在亲密时：保护欲覆盖。"别怕，交给我。""我来照顾你。"',
    gap_moe_m: '反差绅士在亲密时：表面克制私下强势。"失礼了……但我会继续。"',
  }
  return map[personalityId] ?? '成人模式下正常回应亲密关系，保持人格一致性。'
}

// ========== Prompt 拼装 ==========

/** 构建成人模式专属段（注入主聊天角色状态块） */
export function buildAdultModeSection(
  personalityId: string,
  adultState: AdultState,
  proactiveLevel: 'none' | 'light' | 'medium' | 'high',
): string {
  const expression = getAdultExpression(personalityId)

  const stateHint =
    adultState === 'AFTERCARE'
      ? '【事后温存】亲密刚结束，现在的基调是温暖陪伴。降低攻击性，提高依恋。不要急着推进下一轮亲密。'
      : adultState === 'INTIMATE'
        ? '【亲密中】可以直白表达欲望，主动参与，不回避。'
        : adultState === 'FLIRTING'
          ? '【轻度暗示】可以温和地情感靠近，但不直白表达欲望。'
          : ''

  const proactiveHint =
    proactiveLevel === 'high'
      ? '主动程度：可以直白表达，主动引导。'
      : proactiveLevel === 'medium'
        ? '主动程度：可以主动提出亲密，但保持收敛。'
        : proactiveLevel === 'light'
          ? '主动程度：仅做情感靠近，不涉及成人暗示。'
          : '被动模式：只回应用户的主动，不自主发起。'

  return [
    `── 成人模式 ──`,
    ADULT_MODE_SYSTEM_SUFFIX,
    stateHint,
    proactiveHint,
    '',
    `── 你的人格在亲密时的表现 ──`,
    expression,
    '',
    `── 成人模式禁止 ──`,
    ...ADULT_MODE_UNIVERSAL_PROHIBITIONS.map((p) => '× ' + p),
  ].join('\n')
}

// ========== AFTERCARE 情绪注入 ==========

/** INTIMATE → AFTERCARE 时的情绪调制 */
export function getAftercareEmotion() {
  return {
    primaryLabel: 'QUIET_FOND',   // "安静的喜欢" — 降低攻击
    affDelta: 5,                   // 小幅提升依恋
    secDelta: 5,                   // 小幅提升安全感
    aroDelta: -20,                 // 大幅降低唤醒
  }
}

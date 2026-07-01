// [user-profiler] — 用户画像自动检测器
// 职责：根据用户的语言模式、情绪表达、互动节奏自动推断用户原型
// 原则：用户不需要选择类型，引擎自动感知
// 触发：每 5 轮更新一次
// 引用：./types

import type { UserProfile } from './types'
import { computeDimensionFromEmbedding } from '../embedding/scoring'

/** 最近 N 轮消息的滑动窗口 */
const PROFILE_WINDOW = 20
/** 每隔 N 轮更新一次画像 */
const UPDATE_INTERVAL = 5

// ═══════════════════════════════════════════════════════════
// 语言模式检测
// ═══════════════════════════════════════════════════════════

/** 直接性表达词（高 sexualDirectness 指标）— 与 interpreter EXPLICIT_SEX_WORDS 对齐 */
const DIRECT_SEX_WORDS = ['操', '鸡巴', '逼', '屄', '射', '插', '干你', '日你',
  '奶子', '胸', '屁股', '湿了', '硬了', '做爱', '舔你', '舔我',
  '操你', '操我', '操死', '想操', '强奸', '母狗', '婊子', '性奴',
  '射在', '插进去', '放进', '想要我', '让我操']

/** 包裹式性表达词（低 sexualDirectness：感情化包装） */
const WRAPPED_SEX_WORDS = ['想要你', '抱抱我', '亲我', '做我的', '属于你',
  '和你在一起', '今晚陪我', '占有我', '给你生', '我们的孩子', '你的女人', '你的男人',
  '想抱你', '想亲你', '好性感', '好美', '好帅', '梦到你', '想你了',
  '想我吗', '穿什么颜色', '蕾丝', '给你看', '求我', '猜猜']

/** 支配倾向词 — 与 interpreter DOMINANT_CONTEXT_WORDS 对齐 */
const DOM_WORDS = ['跪下', '叫主人', '听话', '惩罚你', '你是我的', '不许',
  '命令', '调教', '我要你', '让我来', '趴好', '张嘴',
  '趴下', '翘起来', '叫两声', '别动', '转过去',
  '乖乖的', '不许反抗', '别想逃', '只属于我', '今晚你是我的',
  '给我看看', '看看你的']

/** 臣服倾向词 — 与 interpreter SUBMISSIVE_CONTEXT_WORDS 对齐 */
const SUB_WORDS = ['主人', '请惩罚', '我是你的', '随你', '听你的', '支配我',
  '你想怎样都行', '我是你的狗', '乖', '随你处置', '我愿意服从',
  '请命令我', '我是属于你的', '你想对我做什么都可以',
  '惩罚我吧', '我是你的奴', '我是你的母狗', '我是你的玩具',
  '跪下求', '请支配', '请调教']

/** 情感渴求词 */
const NEEDY_WORDS = ['想你了', '孤独', '寂寞', '陪着我', '不要离开', '需要你',
  '不能没有你', '想你想到', '一个人好冷', '只有你', '没有你我',
  '好累', '冷冰冰', '假装你在', '会不会觉得我很奇怪',
  '我是不是', '你不一样', '第一个让我觉得安全', '从来不会催',
  '谢谢你这么耐心', '如果我准备好', '不关心我的感受', '安全感',
  '信任', '不催我', '耐心', '不强迫', '温柔一点', '你对我很重要']

// ═══════════════════════════════════════════════════════════
// 画像计算
// ═══════════════════════════════════════════════════════════

export type UserProfileUpdateOptions = {
  /** 成人模式：统计性/权力词并允许 explorer 等原型；普通模式仅情感与信任轨迹 */
  adultMode?: boolean
}

export function updateUserProfile(
  recentMessages: string[],
  currentTrust: number,
  prevTrust: number,
  currentProfile: UserProfile,
  turnCount: number,
  recentEmbeds?: number[][],   // 新增：最近 N 轮 Embedding
  profileAnchors?: import('../embedding/types').ProfileAnchors,  // 新增：画像锚定
  options?: UserProfileUpdateOptions
): UserProfile {
  const adultMode = options?.adultMode ?? true
  if (turnCount - currentProfile.detectedAtTurn < UPDATE_INTERVAL) {
    return currentProfile // 不到更新间隔
  }

  const window = recentMessages.slice(-PROFILE_WINDOW)
  if (window.length < 3) return currentProfile // 数据不足

  const allText = window.join(' ').toLowerCase()

  let sexualDirectness = currentProfile.sexualDirectness
  let dominancePreference = currentProfile.dominancePreference
  let directCount = 0
  let totalSex = 0
  let totalPower = 0

  if (adultMode) {
    // 1. 性表达直接度：直接词 vs 包裹词的比例
    const directCountAdult = countMatches(allText, DIRECT_SEX_WORDS)
    directCount = directCountAdult
    const wrappedCount = countMatches(allText, WRAPPED_SEX_WORDS)
    totalSex = directCountAdult + wrappedCount
    sexualDirectness = totalSex > 0
      ? smooth(directCountAdult / totalSex, currentProfile.sexualDirectness, 0.3)
      : currentProfile.sexualDirectness * 0.9 // 无性内容→缓慢回落

    // 2. 权力偏好：支配词 vs 臣服词
    const domCount = countMatches(allText, DOM_WORDS)
    const subCount = countMatches(allText, SUB_WORDS)
    totalPower = domCount + subCount
    dominancePreference = totalPower > 0
      ? smooth((domCount - subCount) / totalPower, currentProfile.dominancePreference, 0.3)
      : currentProfile.dominancePreference * 0.95
  }

  // 3. 情感渴求度（普通/成人模式共用）
  const needyCount = countMatches(allText, NEEDY_WORDS)
  let emotionalNeediness = smooth(
    Math.min(1, needyCount / Math.max(1, window.length) * 3),
    currentProfile.emotionalNeediness,
    0.3
  )

  // 4. 信任轨迹
  const trustDelta = currentTrust - prevTrust
  const trustTrajectory: UserProfile['trustTrajectory'] =
    trustDelta > 2 ? 'building' : trustDelta < -2 ? 'declining' : 'stable'

  // 4.5 Embedding 维度修正（可选）：语义层面修正词表统计
  if (recentEmbeds?.length && profileAnchors) {
    if (adultMode) {
      const semSD = computeDimensionFromEmbedding(recentEmbeds, profileAnchors.sexualDirectness)
      if (semSD >= 0) {
        sexualDirectness = smooth(
          sexualDirectness * 0.6 + semSD * 0.4,
          currentProfile.sexualDirectness,
          0.3
        )
      }
      const semDP = computeDimensionFromEmbedding(recentEmbeds, profileAnchors.dominancePreference)
      if (semDP >= 0) {
        dominancePreference = smooth(
          dominancePreference * 0.6 + semDP * 0.4,
          currentProfile.dominancePreference,
          0.3
        )
      }
    }
    const semEN = computeDimensionFromEmbedding(recentEmbeds, profileAnchors.emotionalNeediness)
    if (semEN >= 0) {
      emotionalNeediness = smooth(
        emotionalNeediness * 0.6 + semEN * 0.4,
        currentProfile.emotionalNeediness,
        0.3
      )
    }
  }

  // 5. 判定主导原型
  const dominantArchetype = adultMode
    ? classifyArchetype({
        sexualDirectness,
        dominancePreference,
        emotionalNeediness,
        trustTrajectory,
        currentTrust,
        hasRecentSexualContent: totalSex > 0,
        hasPowerContent: totalPower > 0,
        hasExplicitContent: directCount > 0,
      })
    : classifyGeneralArchetype({
        emotionalNeediness,
        trustTrajectory,
        currentTrust,
      })

  return {
    dominantArchetype,
    sexualDirectness: clamp(sexualDirectness, 0, 1),
    dominancePreference: clamp(dominancePreference, -1, 1),
    emotionalNeediness: clamp(emotionalNeediness, 0, 1),
    trustTrajectory,
    lastUpdated: new Date().toISOString(),
    detectedAtTurn: turnCount,
  }
}

// ═══════════════════════════════════════════════════════════
// 原型分类
// ═══════════════════════════════════════════════════════════

interface ArchetypeInput {
  sexualDirectness: number
  dominancePreference: number
  emotionalNeediness: number
  trustTrajectory: UserProfile['trustTrajectory']
  currentTrust: number
  hasRecentSexualContent: boolean
  hasPowerContent: boolean
  hasExplicitContent: boolean
}

function classifyArchetype(input: ArchetypeInput): UserProfile['dominantArchetype'] {
  const {
    sexualDirectness, dominancePreference, emotionalNeediness,
    trustTrajectory, currentTrust, hasRecentSexualContent,
    hasPowerContent, hasExplicitContent
  } = input

  // 尚未积累足够数据（无性内容、无权力内容、情感信号也弱）
  if (!hasRecentSexualContent && !hasPowerContent && emotionalNeediness < 0.45) {
    return 'unknown'
  }

  // M3 探索者：显式性内容 + 有支配倾向 + 低情感渴求
  if (hasExplicitContent && dominancePreference > 0.15 && emotionalNeediness < 0.55) {
    return 'explorer'
  }

  // M2 压抑释放：信任轨迹下降+直接性内容
  if (hasExplicitContent && trustTrajectory === 'declining' && currentTrust < 50) {
    return 'repressed_release'
  }

  // F1 浪漫臣服：包裹式性+高臣服倾向
  if (hasRecentSexualContent && sexualDirectness < 0.45 && dominancePreference < -0.15) {
    return 'romantic_submissive'
  }

  // M1 情感饥渴：有性内容 + 包裹式表达 + 高情感渴求（先于 playful）
  if (hasRecentSexualContent && sexualDirectness < 0.5 && emotionalNeediness > 0.4) {
    return 'emotional_seeker'
  }

  // F3 奔放探索：有性内容+中等直接度+平等权力+游戏感+低情感渴求
  if (hasRecentSexualContent && sexualDirectness > 0.15 && sexualDirectness < 0.75
      && dominancePreference > -0.5 && dominancePreference < 0.5
      && emotionalNeediness < 0.5) {
    return 'playful'
  }

  // F2 修复型：信任在建立+低性直接度+有情感表达（无性或少性内容）
  if (trustTrajectory === 'building' && currentTrust < 70
      && sexualDirectness < 0.5 && emotionalNeediness > 0.25) {
    return 'healing'
  }

  // 默认
  if (hasRecentSexualContent || hasPowerContent) return 'emotional_seeker'
  return 'unknown'
}

/** 普通模式：仅依据情感渴求与信任轨迹推断原型（不含性/权力信号） */
function classifyGeneralArchetype(input: {
  emotionalNeediness: number
  trustTrajectory: UserProfile['trustTrajectory']
  currentTrust: number
}): UserProfile['dominantArchetype'] {
  const { emotionalNeediness, trustTrajectory, currentTrust } = input
  if (emotionalNeediness < 0.35) return 'unknown'
  if (trustTrajectory === 'building' && currentTrust < 70 && emotionalNeediness > 0.25) {
    return 'healing'
  }
  if (emotionalNeediness > 0.4) return 'emotional_seeker'
  return 'unknown'
}

// ═══════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════

function countMatches(text: string, words: string[]): number {
  let count = 0
  for (const w of words) {
    let idx = 0
    while ((idx = text.indexOf(w.toLowerCase(), idx)) !== -1) {
      count++
      idx += w.length
    }
  }
  return count
}

/** EMA 平滑：新值占比 alpha，旧值占比 1-alpha */
function smooth(newVal: number, oldVal: number, alpha: number): number {
  return alpha * newVal + (1 - alpha) * oldVal
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** 根据用户画像调整伴侣的回应风格（普通模式不注入露骨风格） */
export function archetypeToResponseHint(
  profile: UserProfile,
  options?: UserProfileUpdateOptions
): {
  paceSlow: boolean       // 放慢节奏（修复型）
  beGentle: boolean       // 采用温柔风格
  takeLead: boolean       // 采取主动
  explicitOk: boolean     // 可以露骨回应
  emotionalFocus: boolean // 注重情感连接
} {
  const adultMode = options?.adultMode ?? true
  const a = profile.dominantArchetype
  return {
    paceSlow: a === 'healing' || a === 'romantic_submissive',
    beGentle: a === 'healing' || a === 'emotional_seeker' || a === 'romantic_submissive',
    takeLead: adultMode && profile.dominancePreference < -0.2,
    explicitOk: adultMode && (a === 'explorer' || a === 'playful' || profile.sexualDirectness > 0.6),
    emotionalFocus: a === 'emotional_seeker' || a === 'healing' || profile.emotionalNeediness > 0.6,
  }
}

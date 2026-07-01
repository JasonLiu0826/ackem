// [knowledge-presentation/overrides] — 用户显式控制知识整理（当轮 / 多轮粘性）

export type KnowledgeTurnOverride = 'force_on' | 'force_off'

export type KnowledgeSessionPrefs = {
  /** 多轮粘性：接下来若干轮强制开/关 */
  stickyMode: 'on' | 'off' | null
  stickyTurnsLeft: number
}

export const DEFAULT_STICKY_TURNS = 4

const FORCE_OFF_PATTERNS: RegExp[] = [
  /不要\s*知识整理/u,
  /别\s*(用|做|来)?\s*知识整理/u,
  /不用\s*知识整理/u,
  /勿\s*知识整理/u,
  /正常对话/u,
  /这句话.*正常/u,
  /不要.*纸面卡/u,
  /别.*纸面卡/u
]

const FORCE_ON_PATTERNS: RegExp[] = [
  /用\s*知识整理/u,
  /走\s*知识整理/u,
  /知识整理\s*一下/u,
  /帮我\s*知识整理/u,
  /开启\s*知识整理/u
]

const STICKY_ON_PATTERNS: RegExp[] = [
  /接下来.{0,12}(?:几轮|轮|回合).{0,8}知识整理/u,
  /后面.{0,8}(?:几轮|轮).{0,8}知识整理/u,
  /接下来.{0,12}都.{0,6}知识整理/u
]

const STICKY_OFF_PATTERNS: RegExp[] = [
  /接下来.{0,12}(?:几轮|轮|回合).{0,8}(?:正常对话|别.*知识整理|不要.*知识整理)/u,
  /后面.{0,8}(?:几轮|轮).{0,8}正常对话/u
]

/** 从「接下来 5 轮」等表述解析轮数 */
function parseStickyTurnCount(msg: string): number {
  const m = msg.match(/(\d+)\s*(?:轮|回合)/u)
  if (m) {
    const n = parseInt(m[1], 10)
    if (n >= 1 && n <= 10) return n
  }
  return DEFAULT_STICKY_TURNS
}

export function createDefaultKnowledgePrefs(): KnowledgeSessionPrefs {
  return { stickyMode: null, stickyTurnsLeft: 0 }
}

export function parseKnowledgeTurnOverride(msg: string): KnowledgeTurnOverride | null {
  const t = msg.trim()
  if (!t) return null
  if (FORCE_OFF_PATTERNS.some(p => p.test(t))) return 'force_off'
  if (FORCE_ON_PATTERNS.some(p => p.test(t))) return 'force_on'
  return null
}

/** 更新会话粘性偏好；返回剥离指令后的用户文本 */
export function applyKnowledgeUserMessage(
  msg: string,
  prefs: KnowledgeSessionPrefs
): { stripped: string; turnOverride: KnowledgeTurnOverride | null } {
  const t = msg.trim()
  let stripped = t
  let turnOverride: KnowledgeTurnOverride | null = null

  if (STICKY_ON_PATTERNS.some(p => p.test(t))) {
    prefs.stickyMode = 'on'
    prefs.stickyTurnsLeft = parseStickyTurnCount(t)
    turnOverride = 'force_on'
    stripped = stripped
      .replace(/接下来.{0,20}知识整理/gu, '')
      .replace(/后面.{0,12}知识整理/gu, '')
      .trim()
  } else if (STICKY_OFF_PATTERNS.some(p => p.test(t))) {
    prefs.stickyMode = 'off'
    prefs.stickyTurnsLeft = parseStickyTurnCount(t)
    turnOverride = 'force_off'
    stripped = stripped
      .replace(/接下来.{0,24}(?:正常对话|知识整理)/gu, '')
      .replace(/后面.{0,12}正常对话/gu, '')
      .trim()
  } else {
    turnOverride = parseKnowledgeTurnOverride(t)
  }

  if (turnOverride) {
    for (const p of [...FORCE_OFF_PATTERNS, ...FORCE_ON_PATTERNS]) {
      stripped = stripped.replace(p, '')
    }
    stripped = stripped.replace(/[，,、\s]+$/u, '').trim()
  }

  return { stripped: stripped || t, turnOverride }
}

/** 当轮是否应走知识整理（显式 > 粘性 > 自动） */
export function shouldUseKnowledgeThisTurn(
  prefs: KnowledgeSessionPrefs,
  turnOverride: KnowledgeTurnOverride | null,
  autoWantsKnowledge: boolean
): boolean {
  if (turnOverride === 'force_off') return false
  if (turnOverride === 'force_on') return true

  if (prefs.stickyMode === 'on' && prefs.stickyTurnsLeft > 0) {
    prefs.stickyTurnsLeft -= 1
    if (prefs.stickyTurnsLeft <= 0) prefs.stickyMode = null
    return true
  }
  if (prefs.stickyMode === 'off' && prefs.stickyTurnsLeft > 0) {
    prefs.stickyTurnsLeft -= 1
    if (prefs.stickyTurnsLeft <= 0) prefs.stickyMode = null
    return false
  }

  return autoWantsKnowledge
}

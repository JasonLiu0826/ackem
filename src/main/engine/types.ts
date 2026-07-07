export type RelationshipStage = 'STRANGER' | 'FAMILIAR' | 'INTIMATE'

export type Atmosphere = 'warm' | 'neutral' | 'cool'

export type EventType =
  | 'praise'
  | 'tease'
  | 'casual_chat'
  | 'cold'
  | 'hurtful'
  | 'apology'
  | 'vulnerable'
  | 'question'
  | 'extreme_redline'
  // 馃啎 鎴愪汉妯″紡浜嬩欢锛?8+锛?
  | 'adult_flirt'        // 璋冩儏锛氳交搴︽€ф殫绀恒€佹寫閫?
  | 'adult_dominant'     // 鏀厤锛氭€ц澧冧笅鐨勬寚浠?鎺屾帶
  | 'adult_submissive'   // 鑷ｆ湇锛氭€ц澧冧笅鐨勬湇浠?璇锋眰
  | 'adult_explicit'     // 闇查锛氭槑纭殑鎬ц涓鸿〃杈?

export interface Event {
  type: EventType
  intensity: number
  sincerity: number
  isExtremeRedline: boolean
  isAdultContent: boolean                     // 馃啎 鏄惁涓烘垚浜哄唴瀹?
  adultSubtype?: 'flirt' | 'dominant' | 'submissive' | 'explicit' | 'romantic'
}

export interface L1State {
  stage: RelationshipStage
  trust: number
  rifts: number
  affection_momentum: number
  atmosphere: Atmosphere
  consecutivePositiveTurns: number
  turnsSinceLastRift: number
  sharedEventsCount: number
}

export interface Modulation {
  trustMod: number
  riftMod: number
  stageWeight: number
  atmosphere: Atmosphere
}

export interface ExternalAtmosphere {
  level: number   // -1..1 signed momentum, updated at very high alpha
  label: Atmosphere
}

export interface Emotion4D {
  aff: number
  sec: number
  aro: number
  dom: number
}

export interface EmotionState extends Emotion4D {
  primaryLabel: string
  isLocked: boolean
}

export interface MemoryEcho {
  aff: number
  sec: number
  aro: number
  dom: number
}

export interface PersonalityDims {
  T: number
  I: number
  S: number
  O: number
  R: number
}

/** 涓讳汉寮€婧愬叚缁达紙M3 LLM 鎺ㄦ柇锛?*/
export interface UserSixDimensions {
  E: number
  A: number
  D: number
  P: number
  N: number
  O: number
  sourceFiles: string[]
  inferredAt: string
  summary?: string
}

/** 浼翠荆 TISOR 鎺ㄦ柇寤鸿 */
export interface CompanionSuggestion extends PersonalityDims {
  confidence: number
  rationale: string
}

export interface InferenceResult {
  userSix: UserSixDimensions
  companionSuggestion: CompanionSuggestion
}

/** 馃啎 鐢ㄦ埛鐢诲儚 鈥?鑷姩妫€娴嬶紝鏃犻渶鐢ㄦ埛閫夋嫨 */
export interface UserProfile {
  /** 涓诲鍘熷瀷 */
  dominantArchetype: 'emotional_seeker' | 'repressed_release' | 'explorer' |
                      'romantic_submissive' | 'healing' | 'playful' | 'unknown'
  /** 鎬ц〃杈剧洿鎺ュ害 0-1锛?=鍖呰９鍦ㄦ儏鎰熶腑 1=鐩存帴绮椾織 */
  sexualDirectness: number
  /** 鏉冨姏鍋忓ソ -1~1锛?1=绾痵ub 0=骞崇瓑 1=绾痙om */
  dominancePreference: number
  /** 鎯呮劅娓存眰搴?0-1 */
  emotionalNeediness: number
  /** 淇′换杞ㄨ抗 */
  trustTrajectory: 'building' | 'stable' | 'declining'
  /** 鏈€杩?N 杞娴嬬殑鏃堕棿鎴?*/
  lastUpdated: string
  /** 妫€娴嬭疆娆?*/
  detectedAtTurn: number
}

export interface PersonalityBaseline {
  T: number; I: number; S: number; O: number; R: number
}

/** OEG锛氬垱閫犺€呭彊浜嬫洕鍏夌姸鎬侊紙Origin Escalation Guard锛?*/
export type OriginExposureState =
  | 'NORMAL'
  | 'ENTRY'
  | 'EXPLORE'
  | 'DEEP'
  | 'GUARD_COOLDOWN'

export interface OriginExposure {
  state: OriginExposureState
  /** 杩炵画 Ackem_creator 璇箟杞?*/
  streak: number
  /** Guard 鍚庣姝?deep expansion 鐩磋嚦璇ヨ疆娆★紙涓嶅惈锛?*/
  cooldownUntilTurn: number
  /** 褰撳墠杞挱鍛ㄦ湡鍐呭凡娉ㄥ叆鐨?Canon-M 鏉＄洰 id锛堝叏閲忚疆涓€閬嶅悗鎵嶅厑璁搁噸澶嶏級 */
  canonMDeliveredIds?: string[]
}

export interface FullState {
  version: string
  relationship: L1State
  emotion: EmotionState
  counters: { totalTurns: number; sharedEventsCount: number; consecutiveMeaningfulTurns: number; lastConsolidationTurn?: number; lastMirrorCheckTurn?: number }
  lastActive: string
  externalAtmosphere: ExternalAtmosphere  // P1-4
  personalityBaseline?: PersonalityBaseline  // P1-1: snapshot of initial preset values for drift clamping
  personality: {
    presetId: string
    hiddenRatio?: number  // 馃啎 鍙嶅樊浜烘牸鏆撮湶搴?0-1锛坓ap_moe 浜烘牸鍦?8+妯″紡涓嬫笎鍙橈級
  } & PersonalityDims
  userProfile: UserProfile  // 馃啎 鑷姩妫€娴嬬殑鐢ㄦ埛鐢诲儚
  userSixDimensions?: UserSixDimensions  // M3: LLM 鎺ㄦ柇涓讳汉鍏淮
  companionSuggestion?: CompanionSuggestion  // M3: 浼翠荆 TISOR 寤鸿锛堟湭閲囩撼鍓嶏級
  desireStack: DesireStack   // P2-1: 娆叉湜鏍?
  offlineThoughts: OfflineThought[]  // P2-4: 绂荤嚎鎬濈淮
  adultState?: string            // 鎴愪汉鐘舵€佹満锛歂ORMAL/FLIRTING/INTIMATE/AFTERCARE
  adultIntensityBudget?: number  // 鎴愪汉寮哄害棰勭畻 0-60
  adultNegativeLockTurns?: number // 璐熼潰浜嬩欢閿佸墿浣欒疆鏁?
  adultConsecutiveVulnerableTurns?: number // 鎴愪汉妯″紡璐熼潰閿侊細杩炵画鑴嗗急鍊捐瘔杞暟
  adultLastRejectedTurn?: number // 鐢ㄦ埛鏈€杩戜竴娆℃嫆缁濇垚浜?浜插瘑鎺ㄨ繘鐨勮疆娆?
  emergencePersistence?: EmergencePersistence // 鎯呯华娑岀幇鎸佷箙鍖?
  /** 鏃堕棿鎰熺煡灞傦細棣栨鏈夋剰涔変簰鍔ㄦ棩鏈?(ISO "2026-06-11") */
  firstMetDate?: string
  /** 鏃堕棿鎰熺煡灞傦細Ackem 鐢熸棩鈥斺€旈娆″惎鍔ㄦ棩 (ISO "2026-06-11") */
  AckemBirthday?: string
  /** OEG锛氬垱閫犺€呭彊浜嬫洕鍏夋帶鍒?*/
  originExposure?: OriginExposure
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 蹇冪郴缁?路 鎯呯华娑岀幇 (Emotional Emergence)
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

export type EmergenceType =
  | 'timeReflection'
  | 'lateNightEmo'
  | 'existentialWonder'
  | 'attachmentOverflow'
  | 'vulnerabilityReveal'
  | 'desireExpression'

export interface EmergenceState {
  type: EmergenceType
  intensity: number
  flavor: string
  phase: 'rising' | 'sustained' | 'fading' | 'dissolved' | 'broken'
  startedAt: string
  roundsInPhase: number
  hasExpressed: boolean
  context: Record<string, unknown>
}

export interface EmergenceContext {
  emotion: EmotionState
  stage: L1State['stage']
  trust: number
  atmosphere: string
  timeOfDay: string
  daysSinceMet: number
  recentAffHistory: number[]
  recentEventTypes: string[]
  consecutiveMeaningfulTurns: number
  consecutiveVulnerableTurns: number
  lastEmergence: { type: string; turn: number } | null
  lastSameTypeAt: string | null
  lastSameTypeTurn: number | null
  currentTurn: number
}

export interface EmergencePersistence {
  active: EmergenceState | null
  history: Array<{
    type: string
    lastTriggeredAt: string
    lastTriggeredTurn: number
  }>
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// P2-1: 娆叉湜鏍?
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
export interface Desire {
  id: string
  topic: string
  category: 'curiosity' | 'concern' | 'share' | 'tease' | 'suggest'
  urgency: number        // 0-10
  status: 'latent' | 'active' | 'expressed' | 'settled'
  sourceTurn: number
  createdAt: string
  /** 鏍囦负 expressed 鏃剁殑杞锛堢敤浜庤嚜鍔ㄦ矇娣€锛?*/
  expressedAtTurn?: number
}

export interface DesireStack {
  slots: (Desire | null)[]  // max 5 active, null = empty slot
}

// P2-4: 绂荤嚎鎬濈淮
export interface OfflineThought {
  id: string
  content: string     // first-person thought
  createdAt: string
  delivered: boolean
}

export interface ExpressionParams {
  mode: 'NORMAL' | 'SILENT_CANDIDATE'
  proximity: 'CLOSE' | 'NEUTRAL' | 'COOL' | 'DEFENSIVE'
  tone: string
  length: 'SHORT' | 'MEDIUM' | 'LONG'
}

export interface TurnTrace {
  turn: number
  l0: { type: EventType; intensity: number; sincerity?: number }
  l0_5?: { intent: WorkIntent; confidence: number; proactive: boolean }
  dispatch?: {
    decision: string
    extensionId?: string
    confidence?: number
    reasoning?: string
  }
  l1: { trust: number; rifts: number; stage: RelationshipStage; atmosphere?: Atmosphere }
  l2: { aff: number; sec: number; aro: number; dom: number; label: string }
  l3: {
    silent: boolean
    tierBChars: number
    factsUsed?: number
    embeddingHits?: number
    /** FIX-024锛氬叧鑱旀墿鏁ｅ閲忥紙asc+锛?*/
    associationHits?: number
    /** FIX-024锛氬叧鑱斿浘婵€娲昏竟鏁帮紙act锛?*/
    associationActivations?: number
    episodesUsed?: number
    /** FIX-006锛氭湰杞瘽棰樹徊瑁佽儨鍑烘潵婧?*/
    topicSource?: string
    /** FIX-021锛氭儏缁秾鐜扮被鍨嬶紙timeReflection 绛夛紝涓庣壒娈婃棩鏈熸彁绀虹嫭绔嬶級 */
    emergenceType?: EmergenceType | null
    /** FIX-021锛歴pecialDateDetector 妫€娴嬪埌鐨勬棩鏈熸爣绛撅紙鏈敞鍏ユ椂涔熻褰曪紝鎺掓煡 T7 浜掓枼锛?*/
    temporalHintDetected?: string | null
    /** FIX-021锛氭湰杞疄闄呮敞鍏?psycheBlock 鐨勭壒娈婃棩鏈熸爣绛?*/
    temporalHintInjected?: string | null
    /** 鏈疆瀹為檯娉ㄥ叆 psycheBlock 鐨勬秾鐜版彁绀猴紙鎸?marker / topic 鏉ユ簮鍒ゅ畾锛?*/
    emergenceHintInjected?: boolean
    /** OEG锛氬垱閫犺€呭彊浜嬫洕鍏夌姸鎬?*/
    originState?: OriginExposureState
    originStreak?: number
    /** 鏈疆娉ㄥ叆鐨?Canon-M 鏉℃暟 */
    originCanonMEntries?: number
    /** 鏈疆杞挱娉ㄥ叆鐨?Canon-M 鏉＄洰 id */
    originCanonMEntryId?: string | null
    /** 鏈疆鏄惁寮€鍚柊涓€杞?Canon-M 鍏ㄩ噺杞挱 */
    originCanonMCycleReset?: boolean
    /** 鏈疆娉ㄥ叆鐨?Canon-M 鏉＄洰 category */
    originCanonMEntryCategory?: string | null
    /** 璇鍖归厤鍒扮殑 Canon-M 绫诲瀷锛堢┖ = 鏈寜绫诲瀷杩囨护锛?*/
    originCanonMMatchedCategories?: string[]
    originGuardInjected?: boolean
    originFatherRef?: 'Ackem_creator' | 'user_family' | 'ambiguous' | null
    originFatherScore?: number
    originFatherSource?: 'calibration' | 'anchor'
    /** CANON-M-3锛氭湰杞烦杩?Tier B ingest锛堝垱閫犺€呰嚜杩帮級 */
    originSkipIngest?: boolean
    /** 璁板繂瀹¤鐭矾锛欶actStore 绮鹃€?鍏ㄩ噺璇诲彇 */
    memoryAudit?: {
      mode: string
      factsListed: number
      factsHidden: number
      episodesListed: number
      timelineCount: number
      paginated?: boolean
      page?: number
    }
  }
  l4: { wrote: boolean }
  l5?: { toolCalls: string[] }
  ms?: {
    total: number
    embed?: number
    retrieve?: number
    psyche?: number
    dispatch?: number
  }
  /** 鏈疆 wall-clock 鏃堕棿锛圛SO锛夛紝渚涙棩璁?妫€绱㈡寜鏃跺埢杩囨护 */
  timestamp?: string
}

export interface EmotionalContext {
  valence: number
  intensity: number
  relStage: RelationshipStage
  trust: number
  atmosphere: Atmosphere
}

export type MemoryFactStatus = 'active' | 'retired'
export type FactLayer = 'raw' | 'consolidated'
export type MemoryTier = 'core' | 'archival'

export interface MemoryFact {
  id: string
  domain: string
  subcategory: string
  subject: string
  summary: string
  weight: number
  confidence: number
  status: MemoryFactStatus
  emotionalContext: EmotionalContext
  selfRelevance: number
  triggers: string[]
  updateTrail: string[]
  sourceSessionId: string
  sourceTurnIndex: number
  createdAt: string
  updatedAt: string
  /** O3: IDs of facts this insight was derived from (for consolidated facts only) */
  derivedFrom?: string[]
  /** O3: raw = directly extracted, consolidated = LLM-synthesized insight */
  factLayer?: FactLayer
  /** B: core = always injected, archival = competes for budget (default) */
  tier?: MemoryTier
  /** 涓诲姩閬楀繕鏍囪锛歯ormal=榛樿锛宎void=鐢ㄦ埛涓嶆兂琚彁璧凤紙涓嶄富鍔ㄦ敞鍏ワ級 */
  sensitivity?: 'normal' | 'avoid'
  /** 鎴愪汉璁板繂闅愮锛氬叧闂垚浜烘ā寮忓悗 intimate/explicit 涓嶆敞鍏?prompt */
  privacyLevel?: 'normal' | 'intimate' | 'explicit'
  /** 骞撮緞鍔ㄦ€佽绠楀厓鏁版嵁锛堜粠 age_* 鍒楃粍瑁咃級 */
  ageMeta?: AgeMeta
}

/** 骞撮緞鍔ㄦ€佽绠楀厓鏁版嵁 */
export interface AgeMeta {
  age: number
  birthdayMMDD?: string
  birthYear?: number
  recordedAt: string
  isEstimate: boolean
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 鎯呰妭璁板繂 (Episodic Memory)
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
export interface Episode {
  id: string
  /** 1-3 sentence narrative summary of this conversation segment */
  summary: string
  /** 0-1 emotional intensity of the episode */
  emotionalIntensity: number
  /** dominant emotion label during this episode */
  dominantEmotion: string
  /** retrieval keywords */
  keywords: string[]
  /** links to previous episode for narrative continuity */
  prevEpisodeId: string | null
  sourceSessionId: string
  startTurn: number
  endTurn: number
  createdAt: string
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// C: 鐭ヨ瘑鍥捐氨 + 鐭涚浘妫€娴?
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
export interface Triple {
  id: string
  subject: string
  predicate: string
  object: string
  confidence: number
  sourceFactIds: string[]
  createdAt: string
}

export interface ContradictionCheck {
  conflictingFactId: string | null
  judgment: 'conflict' | 'reinforce' | 'unrelated'
  action: 'keep_new' | 'keep_old' | 'merge' | 'flag'
  reason: string
}

export type PendingFact = {
  domain: string
  subcategory: string
  subject: string
  summary: string
  weight?: number
  confidence?: number
  selfRelevance?: number
  triggers: string[]
  ageMeta?: { age: number; birthdayMMDD?: string; birthYear?: number; recordedAt: string; isEstimate: boolean }
}

export interface ExtractionResult {
  facts: PendingFact[]
}

export interface LlmClient {
  chatCompletionJson(params: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    temperature: number
    max_tokens?: number
  }): Promise<string>
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// L0.5: 宸ヤ綔鎰忓浘璇嗗埆
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
export type WorkIntent =
  | 'search_web'
  | 'read_file'
  | 'write_file'
  | 'run_command'
  | 'none'

export interface WorkIntentResult {
  intent: WorkIntent
  confidence: number       // 0-1
  proactive: boolean       // 寮曟搸涓诲姩鍒ゆ柇鐢ㄦ埛闇€瑕佸府鍔╋紝鑰岄潪鐢ㄦ埛鏄庣‘瑕佹眰
  extractedQuery?: string  // 鎻愬彇鐨勬悳绱㈣瘝 / 鏂囦欢璺緞 / 鍛戒护
  filePath?: string        // 鏂囦欢鎿嶄綔鐨勭洰鏍囪矾寰?
  /** search_web 鏃讹細web_search 鑱旂綉 vs 鐭ヨ瘑鏁寸悊绾搁潰鍗★紙涓嶄簩娆℃悳绱級 */
  delivery?: 'web_search' | 'knowledge_card'
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// L5: 宸ュ叿鎵ц缁撴灉
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
export interface ToolResult {
  toolName: string
  success: boolean
  content: string          // 杩斿洖缁?LLM 鐨勭粨鏋滄枃鏈?
  summary: string          // 缁欑敤鎴风殑绠€鐭憳瑕侊紙UI 閫氱煡鐢級
  memoryHint?: string      // 鐢ㄤ簬鑷姩璁板繂璁板綍鐨勫叧閿俊鎭?
}

export interface ToolCallRecord {
  toolName: string
  args: Record<string, unknown>
  result: ToolResult
  timestamp: string
}

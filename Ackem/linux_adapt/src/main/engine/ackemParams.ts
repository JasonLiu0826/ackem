// ---- 参数常量（Ackem系统总览 §5 / 引擎数学规范 v1.0）----
// 单一来源：各 engine/memory 模块从此文件 import，避免内联魔法数。

/** A1 — 调优：降低衰减以允许情绪在 15-25 轮内积累到标签阈值 */
export const EMOTION_DECAY = 0.03
/** A2 */
export const SINGLE_TURN_CLAMP = 10
/** A3 — P1 标定，P0 与引擎数学规范一致使用 */
export const EMOTION_CAP_DENOM = 120
/** A4 */
export const LOCK_AFF_HIGH = 70
/** A5 */
export const LOCK_AFF_LOW = -50
/** A6 */
export const LOCK_SEC_LOW = -60
/** A7 */
export const LOCK_AFF_HIGH_REDUCE_NEG = 0.6
/** A8 */
export const LOCK_AFF_LOW_REDUCE_POS = 0.5
/** A9 */
export const LOCK_SEC_LOW_REDUCE_POS = 0.5
/** A10 */
export const NOISE_THRESHOLD_ABS = 80
/** A11 */
export const NOISE_MAX = 0.5

export const TRUST_PRAISE = 1.5
export const TRUST_APOLOGY = 2.0
export const TRUST_VULNERABLE = 1.0
export const TRUST_TEASE = 0.8
export const TRUST_COLD = -1.5
export const TRUST_HURTFUL = -3.0
export const TRUST_CASUAL = 0
export const TRUST_QUESTION = 0

export const RIFT_HURTFUL_COOLDOWN = 2
export const RIFT_REPAIR_POSITIVE_STREAK = 4
export const RIFT_MOD_MIN = 0.3
export const STAGE_WARMUP_TURNS = 10
export const STAGE_INTIMATE_TRUST = 60
export const STAGE_INTIMATE_EVENTS = 3
export const STAGE_DOWNGRADE_RIFTS = 5
export const STAGE_DOWNGRADE_TRUST = 30

export const MOMENTUM_ALPHA = 0.7
export const ATMOSPHERE_WARM_THRESHOLD = 0.5
export const ATMOSPHERE_COOL_THRESHOLD = -0.3
export const TRUST_MOD_MIN = 0.5
export const TRUST_MOD_MAX = 1.5
export const RIFT_MOD_DECAY_PER_RIFT = 0.15
export const STAGE_WEIGHT_STRANGER = 0.8
export const STAGE_WEIGHT_FAMILIAR = 1.0
export const STAGE_WEIGHT_INTIMATE = 1.4

export const SILENCE_INTENSITY_WEIGHT = 0.3
export const SILENCE_RIFTS_WEIGHT = 0.2
export const SILENCE_ARO_WEIGHT = 0.02
export const SILENCE_THRESHOLD = 0.7
export const ARO_EXCESS_BASELINE = 50
export const STAGE_MODIFIER_STRANGER = 1.3
export const STAGE_MODIFIER_FAMILIAR = 1.0
export const STAGE_MODIFIER_INTIMATE = 0.7

export const MEMORY_ECHO_CAP = 2.0
export const MEMORY_ECHO_AFF_WEIGHT = 0.5
export const MEMORY_ECHO_SEC_POSITIVE = 0.3
export const MEMORY_ECHO_SEC_NEGATIVE = -0.3
export const EFFECTIVE_TRUST_L1_WEIGHT = 0.5
export const EFFECTIVE_TRUST_MEM_WEIGHT = 0.5
export const MOOD_CONGRUENT_VALENCE_DIFF = 0.3
export const MOOD_CONGRUENT_BOOST = 1.5
/** G9b: 极端情绪时降低 Mood-Congruent 加权，防止负向强化螺旋 */
export const MOOD_CONGRUENT_EXTREME_THRESHOLD = 50
/** G9c: 极端情绪时的 Mood-Congruent 加权（低于正常 1.5） */
export const MOOD_CONGRUENT_EXTREME_BOOST = 1.2

// ═══════════════════════════════════════════════════════════
// G10: memoir_trust 下限保护
// ═══════════════════════════════════════════════════════════
/** memoir_trust 不低于此值，确保"破冰"机制有机会生效 */
export const MEMOIR_TRUST_FLOOR = 25

// ═══════════════════════════════════════════════════════════
// G11: consolidated 洞察专用衰减 + core 席位竞争
// ═══════════════════════════════════════════════════════════
/** consolidated 事实的衰减 λ（半衰期约 630 天，比原始事实衰减慢） */
export const CONSOLIDATED_DECAY_LAMBDA = 0.003
/** core 席位升级阈值（decayedScore > 此值才可升级为 core） */
export const CORE_SCORE_THRESHOLD = 2.0
export const TRIGGER_MATCH_BOOST = 2.0

export const FACT_EXTRACTION_MAX_PER_TURN = 8
export const TIER_B_CHAR_BUDGET = 8000
export const MIN_CONFIDENCE_FOR_INJECTION = 0.55
export const AUTO_RETIRE_CHECK_INTERVAL = 10

// ═══════════════════════════════════════════════════════════
// L4 记忆系统优化参数
// ═══════════════════════════════════════════════════════════
/** O1: minimum character Jaccard similarity (0-1) on subject + summary for two same-subcategory facts to be merged */
export const FACT_DEDUP_THRESHOLD = 0.42

/** O2: hours window for recency boost — facts updated within this window get a relevance multiplier */
export const RECENCY_BOOST_WINDOW_HOURS = 4
/** O2: multiplier applied to relevance score for facts within the recency window */
export const RECENCY_BOOST_FACTOR = 1.8

/** O4: weight for emotional intensity → arousal mapping in memory echo */
export const MEMORY_ECHO_ARO_INTENSITY_WEIGHT = 0.6
/** O4: weight for trust/atmosphere → dominance mapping in memory echo */
export const MEMORY_ECHO_DOM_TRUST_WEIGHT = 0.4

/** O5: max number of recent exchanges (user+companion pairs) retained in working memory */
export const WORKING_MEMORY_MAX_EXCHANGES = 6
/** O5: character budget for the working memory block prepended to Tier B */
export const WORKING_MEMORY_CHAR_BUDGET = 3000

/** O6: enable semantic (keyword overlap) search alongside trigger word matching */
export const SEMANTIC_SEARCH_ENABLED = true
/** O6: max facts returned from semantic keyword overlap search */
export const SEMANTIC_SEARCH_TOP_K = 5
/** O6: minimum Jaccard similarity for semantic match */
export const SEMANTIC_SEARCH_MIN_SIMILARITY = 0.12

/** O3: number of turns between automatic memory consolidation */
export const CONSOLIDATION_INTERVAL_TURNS = 30
/** O3: minimum turns since last consolidation before auto-run */
export const CONSOLIDATION_MIN_TURNS = 20
/** O3: force consolidation after this many turns regardless of chat density */
export const CONSOLIDATION_MAX_TURNS = 60
/** O3: meaningful L0 event ratio to trigger early consolidation (between MIN and INTERVAL turns) */
export const CONSOLIDATION_MEANINGFUL_DENSITY = 0.40
/** O3: max recent facts fed into consolidation prompt */
export const CONSOLIDATION_MAX_FACTS_INPUT = 30
/** O3: default weight assigned to consolidated insights */
export const CONSOLIDATION_INSIGHT_WEIGHT = 4.0
/** O3: max insights generated per consolidation run */
/** 整合所需的最小原始事实数（低于此值跳过整合） */
export const CONSOLIDATION_MIN_FACTS = 6
/** 整合生成的最大洞察数 */
export const CONSOLIDATION_MAX_INSIGHTS = 4

// ═══════════════════════════════════════════════════════════
// 情节记忆参数 (Episodic Memory)
// ═══════════════════════════════════════════════════════════
/** 每隔多少轮生成一个情节摘要（受 WORKING_MEMORY_MAX_EXCHANGES 限制，应 ≤ 该值） */
export const EPISODE_INTERVAL_TURNS = 6
/** 情节自适应：低情绪时延长的间隔 */
export const EPISODE_INTERVAL_TURNS_LOW = 10
/** 情绪强度阈值：高于此值按基础间隔，低于此值延至低情绪间隔 */
export const EPISODE_EMOTION_INTENSITY_THRESHOLD = 0.5
/** 情节摘要最大字符数 */
export const EPISODE_SUMMARY_MAX_CHARS = 200
/** 检索时注入上下文的情节最大数量 */
export const EPISODE_RETRIEVAL_MAX = 3
/** 情节检索的字符预算 */
export const EPISODE_CHAR_BUDGET = 1200

// ═══════════════════════════════════════════════════════════
// B: 分层记忆 + 主动回忆参数
// ═══════════════════════════════════════════════════════════
/** 权重超过此阈值的活跃事实自动提升为核心记忆 */
export const CORE_MEMORY_WEIGHT_THRESHOLD = 3.0
/** 核心记忆最大数量（超过后降级权重最低的） */
export const CORE_MEMORY_MAX_COUNT = 12
/** 核心记忆不受 Tier B 字符预算限制，固定保留的字符预算 */
export const CORE_MEMORY_CHAR_BUDGET = 2000
/** 主动回忆的最小轮数间隔（避免频繁打断） */
export const ACTIVE_RECALL_MIN_INTERVAL = 8
/** 主动回忆仅在关系阶段 >= FAMILIAR 时触发（使用字符串比较索引：STRANGER=0, FAMILIAR=1, INTIMATE=2） */
export const ACTIVE_RECALL_MIN_STAGE = 'FAMILIAR' as const
/** 主动回忆概率（当条件满足时，每轮有该概率触发） */
export const ACTIVE_RECALL_PROBABILITY = 0.15

/** 退役事实永久删除前的保留天数 */
export const AUTO_COMPACT_RETENTION_DAYS = 30
/** FactStore 写入缓冲毫秒数（累积变更后延迟批量写盘） */
export const FACTSTORE_WRITE_BUFFER_MS = 500

// ═══════════════════════════════════════════════════════════
// C: 知识图谱 + 矛盾检测参数
// ═══════════════════════════════════════════════════════════
/** KG 查询时检索的最多三元组数 */
export const KG_QUERY_MAX_TRIPLES = 8
/** KG 查询结果的字符预算（注入 Tier B） */
export const KG_CHAR_BUDGET = 800
/** 矛盾检测的 Jaccard 阈值（高于此值触发 LLM 判断） */
export const CONTRADICTION_SIMILARITY_THRESHOLD = 0.35
/** 矛盾检测需要的最小旧事实权重（避免对琐碎事实做 LLM 判断） */
export const CONTRADICTION_MIN_WEIGHT = 1.5
/** 镜中记忆 + 存量事实矛盾扫描的轮次间隔 */
export const MIRROR_CHECK_INTERVAL_TURNS = 20
/** 每轮 periodic 扫描最多抽样的相似事实对数 */
export const PERIODIC_CONTRADICTION_SAMPLE_PAIRS = 3
/** 本轮新增自我认知事实时，距上次检测至少间隔此轮数才提前触发 */
export const MIRROR_CHECK_EARLY_MIN_TURNS = 5

/** 向量语义搜索返回的最大事实数 */
export const VECTOR_SEARCH_TOP_K = 6
/** 全文索引块搜索返回的最大结果数 */
export const CHUNK_SEARCH_MAX_RESULTS = 8
/** LLM 语义重排序是否启用（对 TF-IDF 粗排结果精排） */
export const SEMANTIC_RERANK_ENABLED = true
/** 向量搜索是否启用 */
export const VECTOR_SEARCH_ENABLED = true

// ═══════════════════════════════════════════════════════════
// Embedding 向量检索参数
// ═══════════════════════════════════════════════════════════
/** embedding 语义搜索是否启用（需要模型已加载） */
export const EMBEDDING_SEARCH_ENABLED = true
/** embedding 搜索返回的最大事实数 */
export const EMBEDDING_SEARCH_TOP_K = 6
/** embedding 余弦相似度最低阈值 */
export const EMBEDDING_MIN_SCORE = 0.35

// ═══════════════════════════════════════════════════════════
// P1-1 / P1-6: 性格漂移
// ═══════════════════════════════════════════════════════════
/** P1-1: max absolute deviation a personality dim can drift from its baseline */
export const DRIFT_MAX_ABSOLUTE = 15
/** P1-6: number of turns between periodic drift checks */
export const DRIFT_CHECK_INTERVAL = 50
/** P1-6: micro-adjustment amount per drift check, applied per dim per interval */
export const DRIFT_DELTA = 1.5

// ═══════════════════════════════════════════════════════════
// P1-2: 破冰机制
// ═══════════════════════════════════════════════════════════
/** P1-2: trust must be at or below this for ice-break to activate */
export const ICE_BREAK_TRUST_THRESHOLD = 15
/** P1-2: apology sincerity must be at or above this to qualify as "deep" */
export const ICE_BREAK_SINCERITY_THRESHOLD = 0.7
/** P1-2: bonus trust awarded when ice-break triggers (in addition to base apology +2.0) */
export const ICE_BREAK_TRUST_BONUS = 3.0

// ═══════════════════════════════════════════════════════════
// P1-3: 离线时间感
// ═══════════════════════════════════════════════════════════
/** P1-3: minimum offline minutes to trigger reunion boost */
export const REUNION_OFFLINE_MINUTES = 30
/** P1-3: aff boost applied on reunion (emotion units) */
export const REUNION_AFF_BOOST = 2.0
/** P1-3: sec boost applied on reunion (emotion units) */
export const REUNION_SEC_BOOST = 1.5
/** P1-3: cap on effective offline duration for boost scaling (minutes, 24h) */
export const REUNION_OFFLINE_CAP_MINUTES = 1440

// ═══════════════════════════════════════════════════════════
// P1-4: 外场气氛
// ═══════════════════════════════════════════════════════════
/** P1-4: EMA alpha for external atmosphere layer (near 1 = very slow response) */
export const EXTERNAL_MOMENTUM_ALPHA = 0.95
/** P1-4: threshold for external warm label */
export const EXTERNAL_WARM_THRESHOLD = 0.4
/** P1-4: threshold for external cool label */
export const EXTERNAL_COOL_THRESHOLD = -0.2

// ═══════════════════════════════════════════════════════════
// P1-5: 沉默概率曲线
// ═══════════════════════════════════════════════════════════
/** P1-5: sigmoid steepness for silence probability curve (higher = sharper transition) */
export const SILENCE_SIGMOID_STEEPNESS = 12

// ═══════════════════════════════════════════════════════════
// P2-1: 欲望栈
// ═══════════════════════════════════════════════════════════
/** P2-1: max active desires in stack */
export const DESIRE_MAX_SLOTS = 5
/** P2-1: urgency threshold for expressing a desire */
export const DESIRE_EXPRESS_THRESHOLD = 7
/** P2-1: urgency decay per turn */
export const DESIRE_DECAY_PER_TURN = 0.3
/** P2-1: active 欲望 urgency≤0 或闲置超过该轮数 → settled */
export const DESIRE_IDLE_SETTLE_TURNS = 8
/** P2-1: expressed 后经过该轮数 → settled */
export const DESIRE_EXPRESSED_SETTLE_AFTER_TURNS = 2
/** P2-1: UI 上视为「极低紧迫」、显示沉淀态的阈值 */
export const DESIRE_DORMANT_URGENCY = 0.6

export const INITIAL_TRUST = 50
export const STATE_JSON_VERSION = '1.0'

// ═══════════════════════════════════════════════════════════
// 魔法数字参数化 — 从各模块中提取
// ═══════════════════════════════════════════════════════════
export const WORKING_MEMORY_MSG_TRUNC_CHARS = 200
export const EPISODE_MAX_KEYWORDS = 10
export const EPISODE_INTENSITY_WEIGHT = 1.5
export const EPISODE_RECENCY_DECAY = 0.01
export const EPISODE_MIN_SCORE = 0.1
export const EPISODE_EXTRACT_MSG_TRUNC = 300
export const KG_ENTITY_MATCH_WEIGHT = 3
export const KG_KEYWORD_MATCH_WEIGHT = 1
export const KG_CJK_CHAR_MATCH_WEIGHT = 0.5
export const KG_MIN_SCORE = 0.1
export const SEMANTIC_KEYWORD_WEIGHT_MULTIPLIER = 1.2
export const SEMANTIC_MIN_KEYWORD_LENGTH = 2
export const VECTOR_SEARCH_MIN_SCORE = 0.05
export const FACT_DEDUP_WEIGHT_BOOST = 0.5
export const SELF_EDIT_REINFORCE_WEIGHT_BOOST = 0.3
export const SELF_EDIT_LOG_MAX = 200
export const SELF_EDIT_LOG_KEEP = 100

// ═══════════════════════════════════════════════════════════
// OEG — Origin Escalation Guard（创造者叙事深度控制）
// ═══════════════════════════════════════════════════════════
export const ORIGIN_STREAK_EXPLORE = 2
export const ORIGIN_STREAK_DEEP = 4
export const ORIGIN_STREAK_GUARD = 5
export const ORIGIN_COOLDOWN_TURNS = 8
/** Canon-M 每轮只注入 1 条事实片段（轮播不重复，见 pickRotatingCreatorMemoryEntries） */
export const ORIGIN_ENTRY_MAX_ENTRIES = 1
export const ORIGIN_EXPLORE_MAX_ENTRIES = 1
export const ORIGIN_DEEP_MAX_ENTRIES = 1
export const ORIGIN_ENTRY_MAX_CHARS = 400
export const ORIGIN_EXPLORE_MAX_CHARS = 800
export const ORIGIN_DEEP_MAX_CHARS = 1200

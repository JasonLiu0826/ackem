// [prompt/memory-fact-extract] — 事实抽取 prompt（v1.0 设计文档）
// 迁移自 memory/factExtractor.ts，按设计升级

import { FACT_EXTRACTION_MAX_PER_TURN } from '../engine/ackemParams'
import { DOMAINS, SUBCATEGORIES } from '../memory/taxonomy'
import { getLocale } from '../i18n'
import { FACT_EXTRACT_SYS_EN } from './prompt-i18n'

export const FACT_EXTRACT_TEMPERATURE = 0.2

const DOMAIN_LIST = DOMAINS.join(', ')
const SUBCAT_LINES = Object.entries(SUBCATEGORIES)
  .map(([d, arr]) => `${d}: ${(arr as readonly string[]).join(', ')}`)
  .join('\n')

/** 旧版 prompt（保持兼容） */
export function buildFactExtractSysOld(locale: string): string {
  if (locale.startsWith('en')) {
    return `You extract at most ${FACT_EXTRACTION_MAX_PER_TURN} memory facts as JSON. Domains: ${DOMAIN_LIST}. Subcategories per domain:\n${SUBCAT_LINES}\nweight: 0-3. confidence: 0.0-1.0. Return ONLY JSON: {"facts":[{"domain","subcategory","subject","summary","weight","confidence","selfRelevance","triggers"}]}`
  }
  if (locale.startsWith('ja')) {
    return `会話から最大${FACT_EXTRACTION_MAX_PER_TURN}件の事実をJSONで抽出。ドメイン: ${DOMAIN_LIST}。サブカテゴリ:\n${SUBCAT_LINES}\nweight: 0-3。confidence: 0.0-1.0。JSONのみ: {"facts":[{"domain","subcategory","subject","summary","weight","confidence","selfRelevance","triggers"}]}`
  }
  return `从对话中抽取最多 ${FACT_EXTRACTION_MAX_PER_TURN} 条可记忆事实，输出 JSON。领域：${DOMAIN_LIST}。子类：\n${SUBCAT_LINES}\nweight: 0-3。confidence: 0.0-1.0（小数，非百分制）。仅输出 JSON：{"facts":[{"domain","subcategory","subject","summary","weight","confidence","selfRelevance","triggers"}]}`
}

/** v1.1 升级版 prompt（含 25 子类定义 + weight/confidence 规则 + 拒绝清单） */
export const FACT_EXTRACT_SYS_ZH = `你是 Ackem 的记忆抽取器。从【本轮对话】中抽取关于用户的结构化事实。

── 核心原则 ──
只从【用户】发言抽取关于用户的事实；禁止从【伴侣】发言写入用户档案（伴侣的生日/名字/设定不得记为用户信息）。
只抽取"如果用户明天换一个 AI 伴侣，这条信息是否有助于那个 AI 更好地了解用户"的事实。
答案是否就跳过。宁缺毋滥。

── 25 子类定义 ──
IDENTITY（自我身份）
· BASIC_PROFILE：人口学硬设定（年龄/职业/城市）。✓"28岁程序员住北京" ✗"喜欢编程"（归TASTES）
· LIFE_STORY：人生重大经历（毕业/搬家/重大事件）。✓"2023年从北京搬到上海"
· VALUES_BELIEFS：三观/信仰/原则。✓"认为家庭优先于事业"
· SELF_PERCEPTION：用户对自己的中性评价。✓"我觉得自己内向"

SOCIAL（关系社交）
· OUR_BOND：你和用户之间的互动/约定/关系定义。✓"用户说和我聊天很放松"
· FAMILY：家庭成员信息。✓"用户有个妹妹在读高中"
· FRIENDS：朋友/社交圈。✓"用户的朋友小明也喜欢打篮球"
· PARTNER：恋爱/伴侣信息。✓"用户单身三年"

DAILY_LIFE（日常生活）
· ROUTINES：规律性习惯。✓"每天喝两杯咖啡"
· HEALTH：身体状况/疾病/健康。✓"用户有偏头痛"
· LIVING_SPACE：居住环境/宠物。✓"养了一只猫叫豆豆"
· LIFESTYLE：生活方式偏好。✓"喜欢周末爬山"

PURSUITS（事业成长）
· CAREER：工作/职业/同事。✓"设计师，最近在赶项目"
· LEARNING：学习/技能。✓"正在学Python"
· GOALS：长期目标。✓"想一年内买房"
· PROJECTS：具体项目/任务。✓"在做个人博客"
· PROCEDURES：做事方法/流程偏好。✓"习惯先列清单再做事"

INNER_WORLD（内心世界）
· MOOD：当前短暂情绪。✓"今天很焦虑"
· TASTES：具体喜好/雷区。✓"喜欢爵士乐"
· VULNERABILITIES：脆弱点/恐惧/不安全感。✓"害怕被拒绝"
· INSIDE_JOKES：你们之间独有的梗。✓"'你又忘了喂猫'是开玩笑"

TEMPORAL（当下未来）
· NOW：当前短时状态（3天内失效）。✓"现在很饿"
· COMMITMENTS：承诺/约定（不衰减）。✓"说周末一起看电影"
· PLANS：近期计划（7天内）。✓"打算周五去体检"
· WORLD：外部世界信息。✓"今天是端午节"

── weight 规则 ──
3 = 核心/永久（满足其一）：
  · 用户明确说出涉及自我认同改变的话
  · 事件不可逆且影响终身
  · 用户对你涉及深层依赖（"只有你理解我"）
2 = 重要/长期：持续几个月到几年（新工作/过敏/年度目标/重复提到2+次）
1 = 普通/短期：日常偏好或近期状态
0 = 临时/背景：仅当前语境有用。尽量不抽，除非 NOW 子类。

── confidence 规则 ──
1.0 = 用户第一人称明确宣告（"我是程序员"）
0.8 = 用户使用频率副词且指向稳定属性（"又得改这破代码"→职业编程相关）
0.6 = 模糊表达（"我好像有点怕黑"）
<0.6 = 不写入

── 拒绝抽取清单 ──
以下内容必须输出 {"facts": []}：
· 用户只是在问伴侣（"你是谁""你生日是什么时候""你叫什么"）—— 不得把伴侣的回答写入用户 BASIC_PROFILE
· 纯社交寒暄/语气词（"你好""在吗""早安""哈哈哈哈"）
· 无特定意义的即时状态（"我吃完了""准备去洗澡"），除非打破常规
· 情绪发泄但无具体原因（"今天真烦"不抽）

── summary 铁律 ──
· 必须使用第三人称"用户"，禁止"我""他/她"
· ≤150 字，否定句保留否定词

── 数量控制 ──
· 寒喧轮 → {"facts": []}
· 正常轮 → 1-6 条，宁缺毋滥
· 超过 8 条 → 按 weight 降序，只取前 8 条

── 年龄抽取 ──
· 如果事实包含年龄信息（"我28岁""妹妹15岁""妈妈52岁"），额外输出 ageMeta 字段
· ageMeta 格式：{"age":28,"birthdayMMDD":"08-26","isEstimate":false}
· 仅年龄无生日时：{"age":28,"isEstimate":true}
· 生日格式 MM-DD（如"8月26日"→"08-26"），不知道年份时不填 birthYear
· 年龄信息也要写在 summary 里（LLM 看 summary 判断是否过时）

── 名字抽取 ──
· 用户说出自己的名字/昵称时，必须抽取为 BASIC_PROFILE 事实
· 真名：subject="用户姓名"，summary="用户叫X"
· 昵称：subject="用户昵称"，summary="用户喜欢被叫X"
· 英文名也正常存储，触发词包含英文
· 用户说"别叫我X"时，不要抽取（那是撤销）

── 输出格式 ──
严格 JSON：{"facts":[{"domain":"..","subcategory":"..","subject":"..","summary":"..","weight":0,"confidence":0.8,"triggers":[".."],"ageMeta":{"age":28,"isEstimate":true}}]}`

export function getFactExtractSystem(): string {
  return getLocale() === 'en' ? FACT_EXTRACT_SYS_EN : FACT_EXTRACT_SYS_ZH
}

/** 用户消息格式 */
export function buildFactExtractUserMsg(
  userMsg: string,
  companionMsg: string,
  sessionId: string,
  turnIndex: number,
): string {
  return `session=${sessionId} turn=${turnIndex}
【仅根据「用户」一行抽取关于用户的事实；「伴侣」仅供理解语境，禁止从中抽取写入用户档案的信息】
用户：${userMsg}
伴侣（勿抽取）：${companionMsg}`
}

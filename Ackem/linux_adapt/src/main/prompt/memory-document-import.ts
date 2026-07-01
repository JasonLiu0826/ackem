import { DOMAINS, SUBCATEGORIES } from '../memory/taxonomy'

export const DOCUMENT_IMPORT_TEMPERATURE = 0.15
export const DOCUMENT_IMPORT_MAX_CHARS = 5_500
export const DOCUMENT_IMPORT_MAX_FACTS_PER_CHUNK = 22
export const DOCUMENT_IMPORT_MAX_EPISODES_PER_CHUNK = 4
export const DOCUMENT_IMPORT_MAX_ANCHORS_PER_CHUNK = 6

const DOMAIN_LIST = DOMAINS.join(', ')
const SUBCAT_LINES = Object.entries(SUBCATEGORIES)
  .map(([d, arr]) => `${d}: ${(arr as readonly string[]).join(', ')}`)
  .join('\n')

export const DOCUMENT_IMPORT_SYS_ZH = `你是 Ackem 的「外部档案记忆解析器」。用户上传了关于**自己**的自述/日记/简历/聊天记录整理，请抽取可长期使用的结构化记忆。

── 原则 ──
· 全文主体是「用户」本人（第一人称「我」或第三人称「他/她/林晚」均视为用户）。
· 使用与对话 ingest 相同的 taxonomy（domain + subcategory），见下方列表。
· 禁止写入 Ackem 创造者 Jason / 父亲 Canon；禁止虚构文中没有的信息。
· 除非文中明确提到与 Ackem/AI 伴侣的互动，否则不要写 OUR_BOND。
· 历史事件 → LIFE_STORY 或 episodes；稳定属性 → BASIC_PROFILE / FAMILY / TASTES 等。
· MOOD/NOW 仅当文中明确「最近/目前/这几天」的短暂状态；否则用 TASTES/LIFE_STORY。
· 人物：subject 用稳定键（如「用户母亲」「朋友-周然」「用户本人」）。
· weight 0-3、confidence 0.0-1.0；导入来源默认 confidence 0.55-0.72，核心身份可到 0.8。
· 生日/纪念日写入 anchors；多句叙事事件写入 episodes。

── 领域与子类 ──
${DOMAIN_LIST}
${SUBCAT_LINES}

── 输出 JSON（仅 JSON，无 markdown）──
{
  "facts": [
    {
      "domain": "IDENTITY",
      "subcategory": "BASIC_PROFILE",
      "subject": "用户本人",
      "summary": "29岁，上海浦东做产品经理",
      "weight": 2,
      "confidence": 0.7,
      "triggers": ["产品经理","上海"],
      "sourceQuote": "原文一句≤80字"
    }
  ],
  "episodes": [
    {
      "summary": "2021年秋与前任分手，此后两年未恋爱",
      "emotionalIntensity": 0.6,
      "dominantEmotion": "melancholy",
      "keywords": ["分手","2021"],
      "timeRange": "2021-09"
    }
  ],
  "anchors": [
    {
      "type": "birthday",
      "label": "用户生日",
      "monthDay": "03-15",
      "year": 1997,
      "summary": "1997年3月15日出生"
    }
  ]
}

facts 最多 ${DOCUMENT_IMPORT_MAX_FACTS_PER_CHUNK} 条；episodes 最多 ${DOCUMENT_IMPORT_MAX_EPISODES_PER_CHUNK} 条；anchors 最多 ${DOCUMENT_IMPORT_MAX_ANCHORS_PER_CHUNK} 条。`

export function buildDocumentImportUserMsg(args: {
  sourceFile: string
  chunkIndex: number
  chunkTotal: number
  text: string
}): string {
  return [
    `来源文件：${args.sourceFile}`,
    `片段：${args.chunkIndex + 1}/${args.chunkTotal}`,
    '',
    '【用户提供的档案正文】',
    args.text.slice(0, DOCUMENT_IMPORT_MAX_CHARS),
  ].join('\n')
}

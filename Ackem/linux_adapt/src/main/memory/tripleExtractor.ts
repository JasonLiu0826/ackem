// [tripleExtractor] — 启发式 + 结构化三元组提取

export type TripleRow = {
  subject: string
  predicate: string
  object: string
  confidence: number
  sourceFactIds: string[]
}

const PATTERNS: Array<{ regex: RegExp; predicate: string }> = [
  { regex: /(?:用户|他|她|我)?喜欢|爱好|热衷于/g, predicate: 'likes' },
  { regex: /(?:用户|他|她|我)?讨厌|不喜欢|厌恶|反感|排斥/g, predicate: 'dislikes' },
  { regex: /(?:用户|他|她|我)?在(.{1,12})(?:工作|上班|任职)/g, predicate: 'works_at' },
  { regex: /(?:用户|他|她|我)?是(.{1,8})[职岗]/g, predicate: 'is_a' },
  { regex: /(?:用户|他|她|我)?住在|居住.?在(.{1,12})/g, predicate: 'lives_in' },
  { regex: /(?:用户|他|她|我)?来自(.{1,12})/g, predicate: 'from' },
  { regex: /(?:用户|他|她|我)?养了|养着|有一只?(.{1,8})(?:猫|狗|宠物)/g, predicate: 'has_pet' },
  { regex: /(?:用户|他|她|我)?去过(.{1,12})旅行|旅游/g, predicate: 'traveled_to' },
]

function pushTriple(
  results: TripleRow[],
  subject: string,
  predicate: string,
  object: string,
  factId: string,
  confidence = 0.85
): void {
  const obj = object.trim().slice(0, 30)
  if (!obj) return
  results.push({
    subject: subject.slice(0, 30),
    predicate,
    object: obj,
    confidence,
    sourceFactIds: [factId],
  })
}

/** 规则/结构化事实专用三元组（生日、亲属、宠物） */
export function extractStructuredTriples(args: {
  subject: string
  summary: string
  factId: string
  subcategory?: string
  ageMeta?: { birthdayMMDD?: string }
}): TripleRow[] {
  const { subject, summary, factId, subcategory, ageMeta } = args
  const results: TripleRow[] = []
  const text = `${subject} ${summary}`

  if (ageMeta?.birthdayMMDD) {
    pushTriple(results, '用户', 'has_birthday', ageMeta.birthdayMMDD, factId)
  }

  const familyMap: Array<{ re: RegExp; member: string }> = [
    { re: /母亲|妈妈|妈/, member: '母亲' },
    { re: /父亲|爸爸|爸/, member: '父亲' },
    { re: /奶奶|祖母/, member: '奶奶' },
    { re: /爷爷|祖父/, member: '爷爷' },
  ]

  if (subcategory === 'FAMILY' || /生日/.test(text)) {
    for (const { re, member } of familyMap) {
      if (!re.test(text)) continue
      pushTriple(results, '用户', 'family_member', member, factId)
      const m = summary.match(/(\d{1,2})月(\d{1,2})/)
      if (m) {
        const mmdd = `${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`
        pushTriple(results, member, 'has_birthday', mmdd, factId)
      }
    }
  }

  if (subcategory === 'LIVING_SPACE' && /宠物|猫|狗/.test(text)) {
    const petName = summary.match(/宠物([一-鿿\w]{1,8})/)?.[1]
      ?? summary.match(/养了([一-鿿\w]{1,8})/)?.[1]
    if (petName) {
      pushTriple(results, '用户', 'has_pet', petName, factId)
    }
  }

  if (subcategory === 'BASIC_PROFILE' && subject.includes('职业')) {
    const job = summary.replace(/^用户从事/, '').replace(/相关$/, '').trim()
    if (job) pushTriple(results, '用户', 'is_a', job, factId)
  }

  return results
}

export function extractTriples(
  subject: string,
  summary: string,
  factId: string,
  meta?: { subcategory?: string; ageMeta?: { birthdayMMDD?: string } }
): TripleRow[] {
  const text = `${subject} ${summary}`
  const results: TripleRow[] = extractStructuredTriples({
    subject,
    summary,
    factId,
    subcategory: meta?.subcategory,
    ageMeta: meta?.ageMeta,
  })

  const cleanSubject = subject.replace(/用户|他|她|我/g, '用户').slice(0, 30)

  for (const { regex, predicate } of PATTERNS) {
    regex.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      const object = (match[1] ?? match[0].replace(/用户|他|她|我/g, '')).slice(0, 20).trim()
      if (object.length >= 1) {
        results.push({
          subject: cleanSubject,
          predicate,
          object,
          confidence: 0.6,
          sourceFactIds: [factId],
        })
      }
    }
  }

  return results
}

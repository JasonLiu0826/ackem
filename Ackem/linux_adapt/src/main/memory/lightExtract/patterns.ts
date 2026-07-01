import type { FactDraft } from './types'
import { calendarSuffix, formatBirthdayMMDD } from './normalize'
import { extractNameByRegex } from '../userName'
import { isValidExtractedUserName } from '../userFactGuard'

const FAMILY_RELATIONS: Array<{ re: RegExp; label: string; subject: string }> = [
  { re: /(?:妈妈|母亲|妈)/, label: '母亲', subject: '用户母亲生日' },
  { re: /(?:爸爸|父亲|爸)/, label: '父亲', subject: '用户父亲生日' },
  { re: /(?:奶奶|祖母)/, label: '奶奶', subject: '用户奶奶生日' },
  { re: /(?:爷爷|祖父)/, label: '爷爷', subject: '用户爷爷生日' },
  { re: /(?:外婆|姥姥|外祖母)/, label: '外婆', subject: '用户外婆生日' },
  { re: /(?:外公|姥爷|外祖父)/, label: '外公', subject: '用户外公生日' },
  { re: /(?:妹妹|姐姐|哥哥|弟弟|兄弟|姐妹)/, label: '兄弟姐妹', subject: '用户兄弟姐妹生日' },
]

function parseBirthdayFromText(text: string): { month: number; day: number } | null {
  const zh = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/)
  if (zh) return { month: Number(zh[1]), day: Number(zh[2]) }
  const slash = text.match(/(\d{1,2})[/.](\d{1,2})/)
  if (slash) return { month: Number(slash[1]), day: Number(slash[2]) }
  const en = text.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/i)
  if (en) {
    const months: Record<string, number> = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    }
    const key = en[0].slice(0, 3).toLowerCase()
    return { month: months[key] ?? 1, day: Number(en[1]) }
  }
  return null
}

function draftFamilyBirthday(
  ruleId: string,
  relationLabel: string,
  subject: string,
  userMsg: string,
  parsed: { month: number; day: number }
): FactDraft {
  const mmdd = formatBirthdayMMDD(parsed.month, parsed.day)
  const cal = calendarSuffix(userMsg)
  return {
    domain: 'SOCIAL',
    subcategory: 'FAMILY',
    subject,
    summary: `用户${relationLabel}生日为${parsed.month}月${parsed.day}日${cal}`,
    weight: 2.5,
    confidence: 0.95,
    triggers: [relationLabel, '生日'],
    ageMeta: { birthdayMMDD: mmdd },
    source: 'light_rule',
    ruleId,
    familyScope: 'user',
  }
}

export function runLightExtractRules(userMsg: string): FactDraft[] {
  const drafts: FactDraft[] = []
  const text = userMsg.trim()
  if (!text) return drafts

  const segments = text.split(/[，,；;]/).map((s) => s.trim()).filter(Boolean)
  const scanParts = segments.length > 0 ? segments : [text]

  for (const part of scanParts) {
    const selfBirthdayRe = /(?:^|[^你])我(?:本人)?(?:的)?生日(?:是|在)?/u
    if (selfBirthdayRe.test(part) || /\bmy birthday\b/i.test(part)) {
      const parsed = parseBirthdayFromText(part)
      if (parsed) {
        const mmdd = formatBirthdayMMDD(parsed.month, parsed.day)
        drafts.push({
          domain: 'IDENTITY',
          subcategory: 'BASIC_PROFILE',
          subject: '用户生日',
          summary: `用户生日为${parsed.month}月${parsed.day}日${calendarSuffix(text)}`,
          weight: 3,
          confidence: 0.95,
          triggers: ['生日', '用户生日'],
          ageMeta: { birthdayMMDD: mmdd },
          source: 'light_rule',
          ruleId: 'birthday_self',
        })
      }
    }

    if (/生日/.test(part) || parseBirthdayFromText(part)) {
      for (const rel of FAMILY_RELATIONS) {
        if (!rel.re.test(part)) continue
        const parsed = parseBirthdayFromText(part)
        if (!parsed) continue
        const ruleId =
          rel.label === '母亲'
            ? 'family_birthday_mom'
            : rel.label === '父亲'
              ? 'family_birthday_dad'
              : 'family_birthday_other'
        drafts.push(draftFamilyBirthday(ruleId, rel.label, rel.subject, part, parsed))
      }
    }
  }

  const nameHit = extractNameByRegex(text)
  if (nameHit && isValidExtractedUserName(nameHit.name, text)) {
    drafts.push({
      domain: 'IDENTITY',
      subcategory: 'BASIC_PROFILE',
      subject: '用户姓名',
      summary: `用户叫${nameHit.name}`,
      weight: 3,
      confidence: nameHit.confidence,
      triggers: [nameHit.name],
      source: 'light_rule',
      ruleId: 'name_intro',
    })
  }

  if (/过敏/.test(text)) {
    const m = text.match(/过敏(?:了)?([一-鿿\w]{1,20})/)
    if (m?.[1]) {
      drafts.push({
        domain: 'DAILY_LIFE',
        subcategory: 'HEALTH',
        subject: '用户过敏',
        summary: `用户对${m[1]}过敏`,
        weight: 2.5,
        confidence: 0.9,
        triggers: ['过敏', m[1]],
        source: 'light_rule',
        ruleId: 'allergy',
      })
    }
  }

  const dislike = text.match(/(?:讨厌|不喜欢|不爱吃)([一-鿿\w]{1,12})/)
  if (dislike?.[1]) {
    drafts.push({
      domain: 'INNER_WORLD',
      subcategory: 'TASTES',
      subject: '用户偏好',
      summary: `用户不喜欢${dislike[1]}`,
      weight: 1.5,
      confidence: 0.85,
      triggers: [dislike[1]],
      source: 'light_rule',
      ruleId: 'like_dislike',
    })
  }

  const like = text.match(/(?:喜欢|爱吃|爱听)([一-鿿\w]{1,12})/)
  if (like?.[1]) {
    drafts.push({
      domain: 'INNER_WORLD',
      subcategory: 'TASTES',
      subject: '用户偏好',
      summary: `用户喜欢${like[1]}`,
      weight: 1.5,
      confidence: 0.85,
      triggers: [like[1]],
      source: 'light_rule',
      ruleId: 'like_dislike',
    })
  }

  const job = text.match(/(?:我是|职业是|做)([一-鿿\w]{2,16}(?:工程师|师|员|家|生|经理|开发|设计))/)
    ?? text.match(/([一-鿿\w]{2,12})(?:专业|系)/)
  if (job?.[1]) {
    drafts.push({
      domain: 'IDENTITY',
      subcategory: 'BASIC_PROFILE',
      subject: '用户职业',
      summary: `用户从事${job[1]}相关`,
      weight: 2,
      confidence: 0.85,
      triggers: [job[1]],
      source: 'light_rule',
      ruleId: 'major_job',
    })
  }

  const pet = text.match(/(?:养了|有)(?:一?只?)([一-鿿\w]{1,8})(?:猫|狗|兔|鸟|宠物)/)
    ?? text.match(/(?:猫|狗)叫([一-鿿\w]{1,8})/)
  if (pet?.[1]) {
    drafts.push({
      domain: 'DAILY_LIFE',
      subcategory: 'LIVING_SPACE',
      subject: '用户宠物',
      summary: `用户养了宠物${pet[1]}`,
      weight: 2,
      confidence: 0.9,
      triggers: [pet[1], '宠物'],
      source: 'light_rule',
      ruleId: 'pet',
    })
  }

  if (/(?:周末|下周|明天|别忘了|记得).{0,30}(?:一起|找我|见面|看电影|吃饭|提醒)/.test(text)) {
    drafts.push({
      domain: 'TEMPORAL',
      subcategory: 'COMMITMENTS',
      subject: '用户承诺',
      summary: `用户提及计划或承诺：${text.slice(0, 80)}`,
      weight: 2,
      confidence: 0.8,
      triggers: ['计划', '承诺'],
      source: 'light_rule',
      ruleId: 'commitment',
    })
  }

  return drafts
}

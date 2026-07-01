// [ageComputer] — 年龄动态计算
// 从 memory_facts.ageMeta 读取结构化年龄字段，动态计算当前年龄
// 设计文档：docs/prompt/年龄动态计算设计_6_11.md

import type { AgeMeta } from '../engine/types'
import type { FactStore } from './factStore'

/** 从 ageMeta 反推出生年份 */
export function inferBirthYear(
  age: number,
  birthdayMMDD: string | undefined,
  recordedAt: string,
): number {
  const recordedDate = new Date(recordedAt)
  const recordedYear = recordedDate.getFullYear()
  if (!birthdayMMDD) return recordedYear - age

  const birthdayThisYear = new Date(`${recordedYear}-${birthdayMMDD}`)
  // 闰年保护
  if (isNaN(birthdayThisYear.getTime())) return recordedYear - age
  // 生日已过 → recordedYear - age，生日未过 → recordedYear - age - 1
  return recordedDate >= birthdayThisYear
    ? recordedYear - age
    : recordedYear - age - 1
}

/** 动态计算当前年龄 */
export function computeCurrentAge(record: AgeMeta, now: Date = new Date()): number {
  // 有出生年份 + 生日 → 精确到生日
  if (record.birthYear && record.birthdayMMDD) {
    let birthdayThisYear = new Date(`${now.getFullYear()}-${record.birthdayMMDD}`)
    if (isNaN(birthdayThisYear.getTime())) {
      birthdayThisYear = new Date(`${now.getFullYear()}-03-01`)
    }
    const hasPassed = now >= birthdayThisYear
    return now.getFullYear() - record.birthYear - (hasPassed ? 0 : 1)
  }

  // 仅年龄 → 每年 1 月 1 日 +1
  if (record.recordedAt) {
    const recordedYear = new Date(record.recordedAt).getFullYear()
    return record.age + (now.getFullYear() - recordedYear)
  }

  return record.age
}

/** 从 FactStore 取所有人的年龄记录（从结构化 ageMeta 读取） */
export function getAllAgeRecords(store: FactStore): Array<{ factId: string; subject: string; record: AgeMeta }> {
  store.load()
  return store
    .listActive()
    .filter((f) => f.ageMeta && f.ageMeta.age > 0)
    .map((f) => ({
      factId: f.id,
      subject: f.subject,
      record: f.ageMeta!,
    }))
}

/** 取用户当前年龄 */
export function resolveUserAge(store: FactStore): { age: number; isEstimate: boolean } | null {
  store.load()
  const candidates = store
    .listActive()
    .filter(
      (f) =>
        f.ageMeta &&
        f.ageMeta.age > 0 &&
        f.subcategory === 'BASIC_PROFILE',
    )
    .sort((a, b) => b.weight - a.weight)

  // 取用户本人的年龄（subject 为 "用户" 或含 "用户"）
  const userFacts = candidates.filter((f) => f.subject === '用户' || f.subject.startsWith('用户'))
  const best = userFacts.length > 0 ? userFacts[0] : candidates[0]
  if (!best?.ageMeta) return null
  return {
    age: computeCurrentAge(best.ageMeta),
    isEstimate: best.ageMeta.isEstimate,
  }
}

/** 年龄的自然语言呈现 */
export function buildAgeLine(store: FactStore): string {
  store.load()
  const candidates = store
    .listActive()
    .filter(
      (f) =>
        f.ageMeta &&
        f.ageMeta.age > 0 &&
        f.subcategory === 'BASIC_PROFILE' &&
        (f.subject === '用户' || f.subject.startsWith('用户')),
    )
    .sort((a, b) => b.weight - a.weight)

  const best = candidates[0]
  if (!best?.ageMeta) return ''

  const meta = best.ageMeta
  const currentAge = computeCurrentAge(meta)

  if (meta.birthYear && meta.birthdayMMDD) {
    const bd = meta.birthdayMMDD.replace('-', '月') + '日'
    return `ta ${meta.birthYear} 年出生，${bd}（今年 ${currentAge} 岁）。`
  }

  if (meta.isEstimate) {
    return `ta 大约 ${currentAge} 岁（从对话中推算，可能不太精确）。`
  }

  return `ta ${currentAge} 岁。`
}

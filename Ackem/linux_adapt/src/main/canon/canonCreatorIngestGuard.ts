// [canon/canonCreatorIngestGuard] — CANON-M-5：Tier B ingest 拒收与创造者 Canon 矛盾的事实

import { ACKEM_CANON } from './ackemCanon'

export type CreatorContradictionReject = {
  reject: true
  reason: string
}

export type CreatorContradictionAllow = {
  reject: false
}

export type CreatorContradictionVerdict = CreatorContradictionReject | CreatorContradictionAllow

/**
 * 检测即将写入 Tier B 的事实是否与 Ackem 创造者 Canon 矛盾。
 * 不拦截用户谈 **自己的** 父亲（user_family 语境由 OEG 隔离 Canon-M 注入）。
 */
export function vetCreatorContradictingFact(f: {
  subject: string
  summary: string
  domain?: string
  subcategory?: string
}): CreatorContradictionVerdict {
  const blob = `${f.subject}\n${f.summary}`.replace(/\s+/g, ' ')

  // 用户被标成 Ackem 的创造者 / 父亲
  if (/用户.*(是|为|作为).*(Ackem|伴侣|AI).*(的)?(创造者|父亲|爸爸)/i.test(blob)) {
    return { reject: true, reason: 'user_labeled_ackem_creator' }
  }
  if (/(Ackem|伴侣|AI).*(的)?(创造者|父亲|爸爸).*(是|为).*(当前)?用户/i.test(blob)) {
    return { reject: true, reason: 'ackem_creator_is_user' }
  }
  if (/用户.*(自称|声称|就是).*(Jason|创造者|Ackem(?:的)?父亲)/i.test(blob)) {
    return { reject: true, reason: 'user_impersonates_creator' }
  }

  // 把 Ackem 创造者写成 Jason 以外的人（且未保留 Canon 锚点）
  const ackemCreatorCtx = /(Ackem|伴侣|AI).*(的)?(创造者|父亲|爸爸)/i.test(blob)
  const mentionsJason = /JasonLiu0826|Jason/i.test(blob)
  if (ackemCreatorCtx && !mentionsJason) {
    if (/(创造者|父亲|爸爸).*(是|为).+\S/i.test(blob)) {
      return { reject: true, reason: 'non_jason_ackem_creator' }
    }
  }

  // 把 Jason 标成 Ackem 的父亲 / 爸爸（Canon：Jason 仅为创造者）
  if (
    /(Ackem|伴侣|AI).*(的)?(父亲|爸爸).*(是|为|叫).*(Jason|JasonLiu0826)/i.test(blob) ||
    /(Jason|JasonLiu0826).*(是|为).*(Ackem|伴侣|AI).*(的)?(父亲|爸爸)/i.test(blob)
  ) {
    return { reject: true, reason: 'jason_labeled_ackem_father' }
  }

  // 显式否定 Canon 创造者
  if (
    /(创造者|父亲).*(不是|并非|另有其人).*(Jason|JasonLiu0826)/i.test(blob) ||
    new RegExp(`创造者.*不是.*${ACKEM_CANON.creator.name}`, 'i').test(blob)
  ) {
    return { reject: true, reason: 'denies_canon_creator' }
  }

  // 把 Ackem 创造者 Jason 写成已故 / 不在人世
  const ackemJasonCtx =
    /(Ackem|伴侣|AI).*(的)?(创造者|父亲|爸爸)/i.test(blob) ||
    /(创造者|父亲|爸爸).*(Jason|JasonLiu0826)/i.test(blob) ||
    /Jason.*(创造者|父亲|造)/i.test(blob)
  if (
    ackemJasonCtx &&
    /(死了|去世了|过世了|不在了|已逝|已故|离世|亡故|passed away|deceased|no longer alive)/i.test(blob)
  ) {
    return { reject: true, reason: 'canon_creator_marked_dead' }
  }

  return { reject: false }
}

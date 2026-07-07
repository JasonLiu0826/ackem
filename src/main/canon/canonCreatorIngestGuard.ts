// [canon/canonCreatorIngestGuard] 鈥?CANON-M-5锛歍ier B ingest 鎷掓敹涓庡垱閫犺€?Canon 鐭涚浘鐨勪簨瀹?

import { Ackem_CANON } from './AckemCanon'

export type CreatorContradictionReject = {
  reject: true
  reason: string
}

export type CreatorContradictionAllow = {
  reject: false
}

export type CreatorContradictionVerdict = CreatorContradictionReject | CreatorContradictionAllow

/**
 * 妫€娴嬪嵆灏嗗啓鍏?Tier B 鐨勪簨瀹炴槸鍚︿笌 Ackem 鍒涢€犺€?Canon 鐭涚浘銆?
 * 涓嶆嫤鎴敤鎴疯皥 **鑷繁鐨?* 鐖朵翰锛坲ser_family 璇鐢?OEG 闅旂 Canon-M 娉ㄥ叆锛夈€?
 */
export function vetCreatorContradictingFact(f: {
  subject: string
  summary: string
  domain?: string
  subcategory?: string
}): CreatorContradictionVerdict {
  const blob = `${f.subject}\n${f.summary}`.replace(/\s+/g, ' ')

  // 鐢ㄦ埛琚爣鎴?Ackem 鐨勫垱閫犺€?/ 鐖朵翰
  if (/鐢ㄦ埛.*(鏄瘄涓簗浣滀负).*(Ackem|浼翠荆|AI).*(鐨??(鍒涢€犺€厊鐖朵翰|鐖哥埜)/i.test(blob)) {
    return { reject: true, reason: 'user_labeled_Ackem_creator' }
  }
  if (/(Ackem|浼翠荆|AI).*(鐨??(鍒涢€犺€厊鐖朵翰|鐖哥埜).*(鏄瘄涓?.*(褰撳墠)?鐢ㄦ埛/i.test(blob)) {
    return { reject: true, reason: 'Ackem_creator_is_user' }
  }
  if (/鐢ㄦ埛.*(鑷О|澹扮О|灏辨槸).*(Jason|鍒涢€犺€厊Ackem(?:鐨??鐖朵翰)/i.test(blob)) {
    return { reject: true, reason: 'user_impersonates_creator' }
  }

  // 鎶?Ackem 鍒涢€犺€呭啓鎴?Jason 浠ュ鐨勪汉锛堜笖鏈繚鐣?Canon 閿氱偣锛?
  const AckemCreatorCtx = /(Ackem|浼翠荆|AI).*(鐨??(鍒涢€犺€厊鐖朵翰|鐖哥埜)/i.test(blob)
  const mentionsJason = /JasonLiu0826|Jason/i.test(blob)
  if (AckemCreatorCtx && !mentionsJason) {
    if (/(鍒涢€犺€厊鐖朵翰|鐖哥埜).*(鏄瘄涓?.+\S/i.test(blob)) {
      return { reject: true, reason: 'non_jason_Ackem_creator' }
    }
  }

  // 鎶?Jason 鏍囨垚 Ackem 鐨勭埗浜?/ 鐖哥埜锛圕anon锛欽ason 浠呬负鍒涢€犺€咃級
  if (
    /(Ackem|浼翠荆|AI).*(鐨??(鐖朵翰|鐖哥埜).*(鏄瘄涓簗鍙?.*(Jason|JasonLiu0826)/i.test(blob) ||
    /(Jason|JasonLiu0826).*(鏄瘄涓?.*(Ackem|浼翠荆|AI).*(鐨??(鐖朵翰|鐖哥埜)/i.test(blob)
  ) {
    return { reject: true, reason: 'jason_labeled_Ackem_father' }
  }

  // 鏄惧紡鍚﹀畾 Canon 鍒涢€犺€?
  if (
    /(鍒涢€犺€厊鐖朵翰).*(涓嶆槸|骞堕潪|鍙︽湁鍏朵汉).*(Jason|JasonLiu0826)/i.test(blob) ||
    new RegExp(`鍒涢€犺€?*涓嶆槸.*${Ackem_CANON.creator.name}`, 'i').test(blob)
  ) {
    return { reject: true, reason: 'denies_canon_creator' }
  }

  // 鎶?Ackem 鍒涢€犺€?Jason 鍐欐垚宸叉晠 / 涓嶅湪浜轰笘
  const AckemJasonCtx =
    /(Ackem|浼翠荆|AI).*(鐨??(鍒涢€犺€厊鐖朵翰|鐖哥埜)/i.test(blob) ||
    /(鍒涢€犺€厊鐖朵翰|鐖哥埜).*(Jason|JasonLiu0826)/i.test(blob) ||
    /Jason.*(鍒涢€犺€厊鐖朵翰|閫?/i.test(blob)
  if (
    AckemJasonCtx &&
    /(姝讳簡|鍘讳笘浜唡杩囦笘浜唡涓嶅湪浜唡宸查€潀宸叉晠|绂讳笘|浜℃晠|passed away|deceased|no longer alive)/i.test(blob)
  ) {
    return { reject: true, reason: 'canon_creator_marked_dead' }
  }

  return { reject: false }
}

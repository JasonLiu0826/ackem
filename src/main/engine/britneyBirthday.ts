// [britneyBirthday] — Britney 生日（BRITNEY-CANON-1.0 固定常量）
import { BRITNEY_CANON } from '../canon/britneyCanon'

/** 返回 Canon 固定出生日；不再读取 dataRoot/britney-birthday.json */
export function getBritneyBirthday(_dataRoot?: string): string {
  return BRITNEY_CANON.birthDate
}

/** @deprecated 仅供旧测试兼容，Canon 模式下无缓存 */
export function _resetBritneyBirthdayCache(): void {
  /* no-op */
}

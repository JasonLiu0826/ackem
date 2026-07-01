// [ackemBirthday] — Ackem 生日（ACKEM-CANON-1.0 固定常量）
import { ACKEM_CANON } from '../canon/ackemCanon'

/** 返回 Canon 固定出生日；不再读取 dataRoot/ackem-birthday.json */
export function getAckemBirthday(_dataRoot?: string): string {
  return ACKEM_CANON.birthDate
}

/** @deprecated 仅供旧测试兼容，Canon 模式下无缓存 */
export function _resetAckemBirthdayCache(): void {
  /* no-op */
}

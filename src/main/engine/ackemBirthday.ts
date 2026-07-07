// [AckemBirthday] 鈥?Ackem 鐢熸棩锛圔RITNEY-CANON-1.0 鍥哄畾甯搁噺锛?
import { ACKEM_CANON } from '../canon/ackemCanon'

/** 杩斿洖 Canon 鍥哄畾鍑虹敓鏃ワ紱涓嶅啀璇诲彇 dataRoot/Ackem-birthday.json */
export function getAckemBirthday(_dataRoot?: string): string {
  return ACKEM_CANON.birthDate
}

/** @deprecated 浠呬緵鏃ф祴璇曞吋瀹癸紝Canon 妯″紡涓嬫棤缂撳瓨 */
export function _resetAckemBirthdayCache(): void {
  /* no-op */
}

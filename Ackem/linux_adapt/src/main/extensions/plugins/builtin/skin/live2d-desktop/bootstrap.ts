import { createPetWindow, getPetWindow } from '../../../../../petWindow'

export type Live2dPetOpenResult = {
  ok: boolean
  alreadyOpen: boolean
  /** FIX-027：始终 preview，直至 W8 Cubism 实装 */
  implementationStatus: 'preview'
  renderer: 'geometric_orb'
}

/** 打开桌宠窗口（几何光球预览；Cubism Live2D W8） */
export function openLive2dPetShell(): Live2dPetOpenResult {
  const existing = getPetWindow()
  if (existing && !existing.isDestroyed()) {
    existing.show()
    return { ok: true, alreadyOpen: true, implementationStatus: 'preview', renderer: 'geometric_orb' }
  }
  const win = createPetWindow()
  win.show()
  return { ok: true, alreadyOpen: false, implementationStatus: 'preview', renderer: 'geometric_orb' }
}

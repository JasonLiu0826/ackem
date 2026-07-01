import { DIARY_AUTO_MANIFEST } from '../skills/builtin/diary-auto/manifest'

/** 不受 proactiveGate silent / 全局 DND 拦截的后台维护类 autonomous */
export const MAINTENANCE_AUTONOMOUS_IDS = new Set<string>([DIARY_AUTO_MANIFEST.id])

export function isMaintenanceAutonomous(extensionId: string): boolean {
  return MAINTENANCE_AUTONOMOUS_IDS.has(extensionId)
}

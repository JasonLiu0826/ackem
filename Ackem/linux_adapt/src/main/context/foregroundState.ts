/** W6 JP-C：前台窗口感知状态（由 foreground-detect Plugin 写入，Policy 只读） */
import { recordForegroundDetection } from '../memory/foregroundHistory'

export type ForegroundScene = 'meeting' | 'presentation' | 'focus' | 'other'

export type ForegroundSnapshot = {
  /** Plugin 已激活且正在轮询 */
  enabled: boolean
  title: string
  scene: ForegroundScene
  shouldSuppressHealth: boolean
  updatedAt: number
}

const MEETING_RE =
  /zoom|teams|腾讯会议|飞书|钉钉|meeting|会议|webex|slack\s*huddle|discord.*call/i
const PRESENTATION_RE =
  /powerpoint|power point|ppt|幻灯片|presenter|keynote|wps\s*演示|fullscreen\s*slide/i
const FOCUS_RE = /专注助手|focus\s*assist|请勿打扰|do not disturb|勿扰模式/i

let snapshot: ForegroundSnapshot = {
  enabled: false,
  title: '',
  scene: 'other',
  shouldSuppressHealth: false,
  updatedAt: 0
}

export function classifyForegroundTitle(title: string): Pick<ForegroundSnapshot, 'scene' | 'shouldSuppressHealth'> {
  const t = title.trim()
  if (!t) {
    return { scene: 'other', shouldSuppressHealth: false }
  }
  if (MEETING_RE.test(t)) {
    return { scene: 'meeting', shouldSuppressHealth: true }
  }
  if (PRESENTATION_RE.test(t)) {
    return { scene: 'presentation', shouldSuppressHealth: true }
  }
  if (FOCUS_RE.test(t)) {
    return { scene: 'focus', shouldSuppressHealth: true }
  }
  return { scene: 'other', shouldSuppressHealth: false }
}

export function setForegroundPollingEnabled(enabled: boolean): void {
  if (!enabled) {
    snapshot = {
      enabled: false,
      title: '',
      scene: 'other',
      shouldSuppressHealth: false,
      updatedAt: Date.now()
    }
    return
  }
  snapshot = { ...snapshot, enabled: true, updatedAt: Date.now() }
}

/** 测试 / 实机模拟：注入前台标题 */
export function setForegroundTitleForTest(title: string, enabled = true): void {
  const classified = classifyForegroundTitle(title)
  snapshot = {
    enabled,
    title: title.trim(),
    ...classified,
    updatedAt: Date.now()
  }
}

export function updateForegroundTitle(title: string, dataRoot?: string): ForegroundSnapshot {
  const classified = classifyForegroundTitle(title)
  snapshot = {
    enabled: snapshot.enabled,
    title: title.trim(),
    ...classified,
    updatedAt: Date.now()
  }
  // 写入前台检测历史（供习惯槽检测长时规律）
  if (dataRoot && classified.scene !== 'other') {
    try {
      recordForegroundDetection(dataRoot, snapshot.title, classified.scene)
    } catch { /* 不影响主流程 */ }
  }
  return { ...snapshot }
}

export function getForegroundSnapshot(): ForegroundSnapshot {
  return { ...snapshot }
}

/** Policy：Plugin 开启且当前场景应抑制健康类 autonomous */
export function shouldSuppressHealthForForeground(): boolean {
  const s = snapshot
  return s.enabled && s.shouldSuppressHealth
}

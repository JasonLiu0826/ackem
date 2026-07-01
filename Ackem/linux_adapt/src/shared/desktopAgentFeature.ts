/**
 * 电脑助手管线总开关。
 * false = 不路由、不调工具、不启后台任务；设置页与聊天页仅灰度展示入口。
 * 开发完成后改为 true 开放。
 */
export const DESKTOP_AGENT_PIPELINE_OPEN = false

export function isDesktopAgentPipelineOpen(): boolean {
  return DESKTOP_AGENT_PIPELINE_OPEN
}

/** 是否处于「仅展示、不可用」灰度态 */
export function isDesktopAgentGrayscalePreview(): boolean {
  return !DESKTOP_AGENT_PIPELINE_OPEN
}

export const DESKTOP_AGENT_GRAYSCALE_BANNER_ZH =
  '电脑助手正在开发中，当前版本仅展示入口，功能暂未开放。'

export const DESKTOP_AGENT_GRAYSCALE_BANNER_EN =
  'Desktop agent is in development. This build shows the entry only; it is not available yet.'

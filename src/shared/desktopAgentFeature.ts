/**
 * 电脑助手管线总开关。
 * true = 路由、调用 use_computer、后台任务与设置页全部开放（实验功能）。
 * 已实现 macOS / Windows 双平台执行器（adapters/darwin、adapters/win）。
 */
export const DESKTOP_AGENT_PIPELINE_OPEN = true

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

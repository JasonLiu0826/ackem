/**
 * community/ 扩展市场管线总开关。
 * false = 不扫描、不安装、不加载 community/ 签名包；贡献者请 PR 到 ackem/ 官方目录。
 * 协议与实现保留在 ecosystem/ 供日后开放。
 */
export const COMMUNITY_EXTENSIONS_OPEN = false

/** 单测可临时覆盖（生产路径勿用） */
let openOverride: boolean | null = null

export function setCommunityExtensionsOpenForTests(value: boolean | null): void {
  openOverride = value
}

export function isCommunityExtensionsOpen(): boolean {
  if (openOverride !== null) return openOverride
  return COMMUNITY_EXTENSIONS_OPEN
}

export const COMMUNITY_EXTENSIONS_CLOSED_ZH =
  '社区扩展市场暂未开放。请在本地用 OpenForU（u/）试验，满意后向 Ackem 仓库 PR 合并为 ackem/ 官方扩展。'

export const COMMUNITY_EXTENSIONS_CLOSED_EN =
  'Community extension marketplace is not open yet. Prototype locally with OpenForU (u/), then open a PR to ship as ackem/ built-ins.'

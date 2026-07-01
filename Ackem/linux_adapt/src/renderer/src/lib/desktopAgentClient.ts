/** 电脑助手 IPC 是否在 preload 中可用（需重启 Electron 后 preload 才会更新） */
export function isDesktopAgentApiAvailable(): boolean {
  return typeof window.ackem?.desktopAgent?.sessionMode?.get === 'function'
}

export function desktopAgentApiMissingMessage(): string {
  return '电脑助手接口未加载，请完全退出 Ackem 后重新运行 npm run dev（preload 需重新编译）。'
}

/**
 * electron-builder portable 会设置 PORTABLE_EXECUTABLE_* 环境变量。
 * 数据目录、桌面快捷方式必须指向「便携 exe 所在目录」，而非 TEMP 内解压的 Ackem.exe。
 */
import { app } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

export function isPortableWrapperLaunch(): boolean {
  return Boolean(process.env.PORTABLE_EXECUTABLE_FILE?.trim())
}

/** 用户放置的便携 exe 所在目录（或普通安装/解压目录） */
export function resolvePackagedAppDir(): string {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR?.trim()
  if (portableDir && existsSync(portableDir)) return portableDir
  return dirname(app.getPath('exe'))
}

/** 用户应双击启动的路径：便携 wrapper exe，或 Ackem.exe */
export function resolveUserLaunchPath(): string {
  const portableFile = process.env.PORTABLE_EXECUTABLE_FILE?.trim()
  if (portableFile && existsSync(portableFile)) return portableFile
  return app.getPath('exe')
}

/** 快捷方式 / 卸载用的 .ico（Windows 不支持 .png 作为 lnk 图标） */
export function resolveShortcutIconPath(): string | undefined {
  const roots = [
    join(process.resourcesPath, 'resources', 'icon.ico'),
    join(process.resourcesPath, 'icon.ico'),
    join(resolvePackagedAppDir(), 'resources', 'resources', 'icon.ico'),
    join(resolvePackagedAppDir(), 'resources', 'icon.ico'),
  ]
  for (const p of roots) {
    if (existsSync(p)) return p
  }
  return undefined
}

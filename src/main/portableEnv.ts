/**
 * electron-builder portable 浼氳缃?PORTABLE_EXECUTABLE_* 鐜鍙橀噺銆?
 * 鏁版嵁鐩綍銆佹闈㈠揩鎹锋柟寮忓繀椤绘寚鍚戙€屼究鎼?exe 鎵€鍦ㄧ洰褰曘€嶏紝鑰岄潪 TEMP 鍐呰В鍘嬬殑 Ackem.exe銆?
 */
import { app } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

export function isPortableWrapperLaunch(): boolean {
  return Boolean(process.env.PORTABLE_EXECUTABLE_FILE?.trim())
}

/** 鐢ㄦ埛鏀剧疆鐨勪究鎼?exe 鎵€鍦ㄧ洰褰曪紙鎴栨櫘閫氬畨瑁?瑙ｅ帇鐩綍锛?*/
export function resolvePackagedAppDir(): string {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR?.trim()
  if (portableDir && existsSync(portableDir)) return portableDir
  return dirname(app.getPath('exe'))
}

/** 鐢ㄦ埛搴斿弻鍑诲惎鍔ㄧ殑璺緞锛氫究鎼?wrapper exe锛屾垨 Ackem.exe */
export function resolveUserLaunchPath(): string {
  const portableFile = process.env.PORTABLE_EXECUTABLE_FILE?.trim()
  if (portableFile && existsSync(portableFile)) return portableFile
  return app.getPath('exe')
}

/** 蹇嵎鏂瑰紡 / 鍗歌浇鐢ㄧ殑 .ico锛圵indows 涓嶆敮鎸?.png 浣滀负 lnk 鍥炬爣锛?*/
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

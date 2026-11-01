// [ackemcode/hostEnv] — 只在真正需要时才碰 Electron 运行时
// 这样单元测试 / 纯 Node 冒烟脚本可以 import 桥接层而不炸。

import { createRequire } from 'node:module'

type ElectronAppLike = {
  getPath(name: string): string
  getAppPath?(): string
}

let cached: ElectronAppLike | null | undefined

function loadElectronApp(): ElectronAppLike | null {
  if (cached !== undefined) return cached
  try {
    const req = createRequire(import.meta.url)
    const mod = req('electron') as ElectronAppLike | string | undefined
    cached = mod && typeof mod === 'object' && typeof mod.getPath === 'function' ? mod : null
  } catch {
    cached = null
  }
  return cached
}

/** app.getPath('userData' | 'home')；非 Electron 环境返回 undefined */
export function hostPath(name: 'userData' | 'home' | 'appData'): string | undefined {
  const app = loadElectronApp()
  if (!app) return undefined
  try {
    return app.getPath(name)
  } catch {
    return undefined
  }
}

/** app.getAppPath()；非 Electron 环境返回 undefined */
export function hostAppPath(): string | undefined {
  const app = loadElectronApp()
  if (!app?.getAppPath) return undefined
  try {
    return app.getAppPath()
  } catch {
    return undefined
  }
}

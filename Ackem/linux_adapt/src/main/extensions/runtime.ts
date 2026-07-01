// [extensions/runtime] — 扩展协调器运行时引用（供 chat / skills 等使用，避免与 ipc 循环依赖）

import type { ExtensionsCoordinator } from './coordinator'
import type { RuntimeContext } from '../context/types'

let coordinator: ExtensionsCoordinator | null = null

export function setExtensionsCoordinator(c: ExtensionsCoordinator | null): void {
  coordinator = c
}

export function getExtensionsCoordinator(): ExtensionsCoordinator | null {
  return coordinator
}

/** 获取 Coordinator 统一构建的运行时上下文 */
export function getRuntimeContext(): RuntimeContext | null {
  return coordinator?.getRuntimeContext() ?? null
}


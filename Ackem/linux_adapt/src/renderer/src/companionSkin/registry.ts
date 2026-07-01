import type { ComponentType } from 'react'
import type { CompanionAvatarState } from '../../../shared/companionSkin'

/** 由应用内打包的 skin 插件在渲染进程注册的 React 形象组件 */
export type CompanionSkinComponentProps = {
  state: CompanionAvatarState
  size?: number
  parallaxStrength?: number
  className?: string
}

const registry = new Map<string, ComponentType<CompanionSkinComponentProps>>()

export function registerCompanionSkinRenderer(
  key: string,
  component: ComponentType<CompanionSkinComponentProps>
): void {
  registry.set(key, component)
}

export function unregisterCompanionSkinRenderer(key: string): void {
  registry.delete(key)
}

export function getCompanionSkinRenderer(
  key: string
): ComponentType<CompanionSkinComponentProps> | undefined {
  return registry.get(key)
}

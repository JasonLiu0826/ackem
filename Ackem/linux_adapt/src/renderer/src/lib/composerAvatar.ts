export type ComposerSurfaceId = 'chat' | 'theater' | 'compact'

export type ComposerSurfaceState = {
  focused: boolean
  textLength: number
  imeComposing: boolean
}

export const EMPTY_COMPOSER_SURFACE: ComposerSurfaceState = {
  focused: false,
  textLength: 0,
  imeComposing: false
}

export const COMPOSER_SURFACE_PRIORITY: ComposerSurfaceId[] = ['compact', 'theater', 'chat']

export function createInitialComposerSurfaces(): Record<ComposerSurfaceId, ComposerSurfaceState> {
  return {
    chat: { ...EMPTY_COMPOSER_SURFACE },
    theater: { ...EMPTY_COMPOSER_SURFACE },
    compact: { ...EMPTY_COMPOSER_SURFACE }
  }
}

/** 正在输入 / 在听：获焦、有文字、或 IME 组字 */
export function isComposerSurfaceActive(surface: ComposerSurfaceState): boolean {
  return surface.textLength > 0 || surface.imeComposing || surface.focused
}

/** 正在键入（有文字或 IME 组字），用于加强光球 listening 动效 */
export function isComposerSurfaceTyping(surface: ComposerSurfaceState): boolean {
  return surface.textLength > 0 || surface.imeComposing
}

/** 任一输入面处于「正在输入 / 在听」态 */
export function isAnyComposerActive(
  surfaces: Record<ComposerSurfaceId, ComposerSurfaceState>
): boolean {
  return COMPOSER_SURFACE_PRIORITY.some((id) => isComposerSurfaceActive(surfaces[id]))
}

export function isAnyComposerTyping(
  surfaces: Record<ComposerSurfaceId, ComposerSurfaceState>
): boolean {
  return COMPOSER_SURFACE_PRIORITY.some((id) => isComposerSurfaceTyping(surfaces[id]))
}

/** 合并当前面的实时本地状态，避免等 useEffect 写 store 才触发 listening */
export function mergeComposerSurface(
  surfaces: Record<ComposerSurfaceId, ComposerSurfaceState>,
  id: ComposerSurfaceId,
  local: ComposerSurfaceState
): Record<ComposerSurfaceId, ComposerSurfaceState> {
  return { ...surfaces, [id]: local }
}

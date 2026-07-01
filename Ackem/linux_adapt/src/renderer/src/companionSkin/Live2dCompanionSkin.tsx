import type { CompanionAvatarState } from '../../../shared/companionSkin'
import { AIVatar } from '../components/AIVatar'

/** Live2D 皮肤：W8 前为几何光球预览（AIVatar），非 Cubism 模型 */
export function Live2dCompanionSkin({
  state = 'idle',
  size = 128,
  parallaxStrength = 0.12,
  className = ''
}: {
  state?: CompanionAvatarState
  size?: number
  parallaxStrength?: number
  className?: string
}): JSX.Element {
  return (
    <div
      className={className}
      title="几何光球预览 · 非 Cubism Live2D 模型（W8 实装）"
      aria-label="伴侣几何光球预览"
    >
      <AIVatar
        state={state}
        size={size}
        parallaxStrength={parallaxStrength}
      />
    </div>
  )
}

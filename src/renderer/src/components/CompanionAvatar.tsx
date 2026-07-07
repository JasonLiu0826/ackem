import { useCallback, useEffect, useState } from 'react'
import { t } from '../lib/i18n'
import type { CompanionAvatarState, CompanionSkinBinding } from '../../../shared/companionSkin'
import { companionAvatarStatusLabel } from '../../../shared/companionSkin'
import { getCompanionSkinRenderer } from '../companionSkin/registry'
import '../companionSkin/registerBuiltins'
import { AIVatar } from './AIVatar'
import { HtmlCompanionSkin } from './HtmlCompanionSkin'

export type { CompanionAvatarState }
export type AvatarState = CompanionAvatarState

type Props = {
  state?: CompanionAvatarState
  size?: number
  /** 鎵╁ぇ鐢诲竷缁樺埗鍖猴紝閬垮厤鍏夋檿琚柟褰?canvas 瑁佸垏 */
  glowCanvasScale?: number
  parallaxStrength?: number
  className?: string
  /** 鏄惁鏄剧ず鐘舵€佹枃妗堬紙NavBar 澶栧眰宸叉湁鏂囨鏃跺彲鍏筹級 */
  showStatus?: boolean
  /** listening 鎬佷笅鐢ㄦ埛姝ｅ湪閿叆 */
  inputTyping?: boolean
}

export function CompanionAvatar({
  state = 'idle',
  size = 128,
  glowCanvasScale,
  parallaxStrength = 0.12,
  className = '',
  showStatus = false,
  inputTyping = false
}: Props): JSX.Element {
  const [binding, setBinding] = useState<CompanionSkinBinding | null>(null)

  const loadBinding = useCallback(() => {
    if (typeof window.Ackem?.companionSkinActive !== 'function') {
      setBinding(null)
      return
    }
    void window.Ackem.companionSkinActive().then(setBinding).catch(() => setBinding(null))
  }, [])

  useEffect(() => {
    loadBinding()
    window.Ackem?.onCompanionSkinChanged?.(loadBinding)
  }, [loadBinding])

  const status = companionAvatarStatusLabel(state, binding?.statusLabels)

  let body: JSX.Element
  if (!binding || binding.renderer === 'builtin-canvas') {
    body = (
      <AIVatar
        state={state}
        size={size}
        glowCanvasScale={glowCanvasScale}
        parallaxStrength={parallaxStrength}
        inputTyping={inputTyping}
        className={className}
      />
    )
  } else if (binding.renderer === 'html') {
    body = (
      <HtmlCompanionSkin binding={binding} state={state} size={size} className={className} />
    )
  } else if (binding.renderer === 'react-builtin') {
    const Skin = getCompanionSkinRenderer(binding.entry)
    body = Skin ? (
      <Skin state={state} size={size} parallaxStrength={parallaxStrength} className={className} />
    ) : (
      <AIVatar
        state={state}
        size={size}
        glowCanvasScale={glowCanvasScale}
        parallaxStrength={parallaxStrength}
        inputTyping={inputTyping}
        className={className}
      />
    )
  } else {
    body = (
      <AIVatar
        state={state}
        size={size}
        glowCanvasScale={glowCanvasScale}
        parallaxStrength={parallaxStrength}
        inputTyping={inputTyping}
        className={className}
      />
    )
  }

  if (!showStatus) return body

  return (
    <div className={['flex flex-col items-center', className].join(' ')}>
      {body}
      <p className="mt-1 text-[10px] text-ink-muted">{status}</p>
    </div>
  )
}

import { useEffect, useRef } from 'react'
import { t } from '../lib/i18n'
import type { CompanionAvatarState, CompanionSkinBinding } from '../../../shared/companionSkin'

type Props = {
  binding: CompanionSkinBinding
  state: CompanionAvatarState
  size?: number
  className?: string
}

/** 鎻掍欢鍖呭唴 HTML 鐨偆锛氶€氳繃 postMessage 鍚屾鐘舵€?*/
export function HtmlCompanionSkin({
  binding,
  state,
  size = 128,
  className = ''
}: Props): JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => {
    const win = iframeRef.current?.contentWindow
    if (!win) return
    win.postMessage({ type: 'Ackem:companion-avatar', state }, '*')
  }, [state, binding.entry])

  return (
    <iframe
      ref={iframeRef}
      title={binding.pluginName}
      src={binding.entry}
      className={['block border-0 bg-transparent', className].join(' ')}
      style={{ width: size, height: size }}
      sandbox="allow-scripts allow-same-origin"
    />
  )
}

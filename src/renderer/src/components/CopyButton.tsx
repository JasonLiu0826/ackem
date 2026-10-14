import { useEffect, useRef, useState } from 'react'

export function CopyButton({ text, label = '复制', iconOnly = false, className = '' }: { text: string; label?: string; iconOnly?: boolean; className?: string }): JSX.Element {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(timer.current), [])
  return <button type="button" className={`chat-copy-button ${iconOnly ? 'chat-copy-button-icon' : ''} ${className}`} aria-label={label} title={iconOnly ? '复制' : label}
    onClick={async () => {
      try { await navigator.clipboard.writeText(text); setState('copied') }
      catch { setState('error') }
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setState('idle'), 2000)
    }}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{iconOnly && state === 'copied' ? <path d="m5 12 4 4L19 6"/> : iconOnly && state === 'error' ? <><circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 3v1"/></> : <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4"/></>}</svg>
    <span className={iconOnly ? 'chat-copy-status' : undefined} aria-live="polite">{state === 'copied' ? '已复制' : state === 'error' ? '复制失败，请选中文字复制' : iconOnly ? '' : label}</span>
  </button>
}

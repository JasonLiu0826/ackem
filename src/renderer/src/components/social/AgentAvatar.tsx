import { useEffect, useState } from 'react'

type Props = {
  agentId: string
  name: string
  size?: number
  className?: string
}

export function AgentAvatar({ agentId, name, size = 40, className = '' }: Props): JSX.Element {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.ackem.social.getAgentAvatarDataUrl(agentId).then((res) => {
      if (cancelled) return
      if (res.ok) setDataUrl(res.dataUrl)
    })
    return () => {
      cancelled = true
    }
  }, [agentId])

  const initials = name.trim().slice(0, 1) || '?'

  return (
    <div
      className={[
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent/15 text-sm font-medium text-accent',
        className,
      ].join(' ')}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {dataUrl ? (
        <img src={dataUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  )
}

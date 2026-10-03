import { useEffect, useState } from 'react'

export type StateBubble = {
  key: string
  label: string
  delta: number
  reason: string
}

type Props = {
  bubbles: StateBubble[]
  onDismiss?: () => void
}

export function StateBubbleStack({ bubbles, onDismiss }: Props) {
  const [visible, setVisible] = useState(bubbles)

  useEffect(() => {
    if (bubbles.length === 0) return
    setVisible(bubbles)
    const t = setTimeout(() => {
      setVisible([])
      onDismiss?.()
    }, 6000)
    return () => clearTimeout(t)
  }, [bubbles, onDismiss])

  if (visible.length === 0) return null

  return (
    <div className="state-bubble-stack" aria-live="polite">
      {visible.map((b) => (
        <div key={`${b.key}-${b.label}`} className="state-bubble">
          <span className="state-bubble-label">
            [{b.label} {b.delta > 0 ? `+${b.delta}` : b.delta === 0 ? '→' : b.delta}]
          </span>
          <span className="state-bubble-reason">{b.reason}</span>
        </div>
      ))}
    </div>
  )
}

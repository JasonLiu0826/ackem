import { useEffect, useRef } from 'react'
import { t } from '../lib/i18n'

type Props = {
  className?: string
  /** 信任 >70 时偶尔双闪 */
  trust?: number
}

export function LightCore({ className = '', trust }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (trust == null || trust <= 70) return
    const el = ref.current
    if (!el) return

    const trigger = (): void => {
      el.classList.add('blink')
      window.setTimeout(() => el.classList.remove('blink'), 500)
    }

    const id = window.setInterval(() => {
      if (Math.random() < 0.08) trigger()
    }, 30000)

    return () => window.clearInterval(id)
  }, [trust])

  return (
    <div
      ref={ref}
      className={['light-core shrink-0', className].filter(Boolean).join(' ')}
      title="她的生命信号"
      aria-hidden
    />
  )
}

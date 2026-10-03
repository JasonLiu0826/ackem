import { useEffect, useState } from 'react'

export function CodePane(): JSX.Element {
  const [phase, setPhase] = useState<'starting' | 'ok' | 'error'>('starting')
  const [reason, setReason] = useState('')

  useEffect(() => {
    let cancelled = false
    void window.ackem.codePart.ensure().then((res) => {
      if (cancelled) return
      if (res.ok) setPhase('ok')
      else {
        setPhase('error')
        setReason(res.reason || '编程核心没有启动')
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (phase !== 'ok') {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-[#0f1412] px-6 text-sm text-[#e8f0ea]">
        {phase === 'starting' ? '正在启动编程核心…' : reason}
      </div>
    )
  }

  return (
    <iframe
      title="AckemCode"
      src="code.html"
      className="min-h-0 min-w-0 flex-1 border-0 bg-[#0f1412]"
    />
  )
}

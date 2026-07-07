import { useEffect, useState } from 'react'

type McBubble = {
  id: number
  eventType: string
  eventLabel: string
  reactionText: string
  emotionGroup: string
  createdAt: number
}

let nextId = 0
const MAX_BUBBLES = 4
const TTL_MS = 8000

function eventIcon(type: string): string {
  if (type.includes('death') || type.includes('slain') || type.includes('killed')) return '馃拃'
  if (type.includes('achievement') || type.includes('advancement')) return '猸?
  if (type.includes('diamond') || type.includes('emerald') || type.includes('netherite')) return '馃拵'
  if (type.includes('creeper')) return '馃挜'
  if (type.includes('dragon') || type.includes('wither') || type.includes('warden')) return '馃悏'
  if (type.includes('dimension') || type.includes('portal')) return '馃寑'
  if (type.includes('chat')) return '馃挰'
  if (type.includes('hungry') || type.includes('starve') || type.includes('food')) return '馃崠'
  if (type.includes('rain') || type.includes('thunder') || type.includes('weather')) return '馃導锔?
  if (type.includes('iron_golem') || type.includes('villager')) return '馃'
  if (type.includes('zombie') || type.includes('skeleton') || type.includes('spider')) return '馃'
  if (type.includes('treasure') || type.includes('chest') || type.includes('loot')) return '馃巵'
  if (type.includes('bed') || type.includes('sleep')) return '馃洀锔?
  if (type.includes('fish') || type.includes('water')) return '馃帲'
  if (type.includes('fire') || type.includes('lava') || type.includes('burn')) return '馃敟'
  if (type.includes('elytra') || type.includes('fly')) return '馃'
  if (type.includes('tame') || type.includes('wolf') || type.includes('pet')) return '馃惡'
  return '馃幃'
}

function eventTypeLabel(type: string): string {
  return type.replace(/^mc:/, '').replace(/_/g, ' ')
}

function emotionColor(group: string): string {
  switch (group) {
    case 'CALM': return 'border-l-blue-400 bg-blue-50/80'
    case 'AROUSED': return 'border-l-amber-400 bg-amber-50/80'
    case 'NEGATIVE': return 'border-l-red-400 bg-red-50/80'
    default: return 'border-l-purple-400 bg-purple-50/80'
  }
}

let listenersInitialized = false

export function McEventStack(): JSX.Element | null {
  const [bubbles, setBubbles] = useState<McBubble[]>([])

  useEffect(() => {
    if (listenersInitialized) return
    listenersInitialized = true

    const handlePayload = (payload: { event?: unknown; reaction?: unknown }) => {
      const event = payload.event as { type?: string; payload?: Record<string, unknown> } | undefined
      const reaction = payload.reaction as { text?: string; emotionGroup?: string } | undefined
      if (!reaction?.text) return

      const id = ++nextId
      const now = Date.now()
      const label = eventTypeLabel(event?.type ?? 'game_event')

      setBubbles(prev => {
        const next = [...prev, { id, eventType: event?.type ?? '', eventLabel: label, reactionText: reaction.text!, emotionGroup: reaction.emotionGroup ?? 'CALM', createdAt: now }]
        return next.slice(-MAX_BUBBLES)
      })

      setTimeout(() => {
        setBubbles(prev => prev.filter(b => b.id !== id))
      }, TTL_MS)
    }

    window.Ackem?.ext.gamemode.onEvent('minecraft', handlePayload)
    window.Ackem?.onMcEvent(handlePayload as (p: { event: unknown; reaction: unknown }) => void)
  }, [])

  if (bubbles.length === 0) return null

  return (
    <div className="pointer-events-none fixed right-4 top-16 z-40 flex w-[320px] flex-col-reverse gap-2">
      {bubbles.map((b, i) => {
        const age = Date.now() - b.createdAt
        const opacity = age < TTL_MS - 1500 ? 1 : Math.max(0, (TTL_MS - age) / 1500)
        return (
          <div
            key={b.id}
            className={`rounded-xl border border-l-4 bg-opacity-90 px-4 py-3 shadow-lg backdrop-blur transition-all duration-500 ${emotionColor(b.emotionGroup)}`}
            style={{
              opacity,
              transform: `translateY(${(bubbles.length - 1 - i) * 4}px)`,
              animation: 'mcSlideIn 0.35s ease-out'
            }}
          >
            <div className="flex items-start gap-2">
              <span className="text-lg leading-none shrink-0 mt-0.5">{eventIcon(b.eventType)}</span>
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-ink-muted uppercase tracking-wide">
                  {b.eventLabel}
                </div>
                <div className="mt-1 text-sm text-ink leading-relaxed line-clamp-2">
                  {b.reactionText}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

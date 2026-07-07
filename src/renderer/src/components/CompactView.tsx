import { useCallback, useEffect, useMemo, useState } from 'react'
import { t } from '../lib/i18n'
import { emotionLightColor } from '../lib/emotionColors'
import { useChatSend } from '../hooks/useChatSend'
import { useAppStore, type Tab } from '../store/appStore'
import { useUiStore } from '../store/uiStore'
import { useCompanionAvatar } from '../hooks/useCompanionAvatar'
import { ArcMenu } from './ArcMenu'
import { CompanionAvatar } from './CompanionAvatar'
import { LightCore } from './LightCore'

type Bubble = { text: string; id: number }

export function CompactView(): JSX.Element {
  const { send, busy, settings } = useChatSend()
  const rows = useAppStore((s) => s.chatRows)
  const arcOpen = useUiStore((s) => s.arcMenuOpen)
  const setArcOpen = useUiStore((s) => s.setArcMenuOpen)
  const [input, setInput] = useState('')
  const [bubble, setBubble] = useState<Bubble | null>(null)
  const [emotionLabel, setEmotionLabel] = useState('CALM_RATIONAL')
  const [trust, setTrust] = useState(50)
  const [idleRest, setIdleRest] = useState(false)

  const refreshEmotion = useCallback(() => {
    void window.Ackem
      .getState()
      .then((raw) => {
        const s = raw as {
          emotion?: { primaryLabel?: string; aff?: number; aro?: number; sec?: number }
          relationship?: { trust?: number }
        }
        if (s.emotion?.primaryLabel) setEmotionLabel(s.emotion.primaryLabel)
        if (s.relationship?.trust != null) setTrust(s.relationship.trust)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    refreshEmotion()
    const t = setInterval(refreshEmotion, 15000)
    return () => clearInterval(t)
  }, [refreshEmotion])

  useEffect(() => {
    window.Ackem.ui.onChatBubble((p) => {
      if (!p.text?.trim()) return
      const id = Date.now()
      setBubble({ text: p.text, id })
      window.setTimeout(() => setBubble((b) => (b?.id === id ? null : b)), 5000)
    })
  }, [])

  useEffect(() => {
    const checkIdle = () => {
      void window.Ackem.companionPresence().then((p) => {
        setIdleRest(p.idleDurationMs > 30 * 60 * 1000)
      })
    }
    checkIdle()
    const t = setInterval(checkIdle, 60000)
    return () => clearInterval(t)
  }, [])

  const streamingAssistantLen = useMemo(() => {
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i]
      if (row.kind === 'message' && row.role === 'assistant') return row.content.length
    }
    return 0
  }, [rows])

  const { avatarState, inputTyping, bindComposerInput } = useCompanionAvatar({
    surface: 'compact',
    busy,
    streamingAssistantLen,
    input,
    syncToStore: true
  })

  const threadColor = emotionLightColor(emotionLabel)
  const emotionBarColor = threadColor
  const COMPACT_ORB_SIZE = 140
  const COMPACT_ORB_GLOW_SCALE = 2.8

  const handleSend = () => {
    const t = input.trim()
    if (!t) return
    setInput('')
    void send(t)
    void window.Ackem.companionTouch()
  }

  const openMain = (tab?: Tab) => {
    void window.Ackem.ui.expandToMain(tab ? { tab } : undefined)
  }

  return (
    <div className="compact-view relative flex h-full min-h-0 flex-col bg-surface">
      <div className="relative min-h-0 flex-1 overflow-visible">
        {/* 鍏夌悆锛氬ぇ鐢诲竷缁樺埗 + 灞呬腑锛屽厜鏅曞湪閫忔槑鍖鸿嚜鐒惰“鍑忥紝鏃犳柟褰㈣鍒囧眰 */}
        <div className="compact-orb-layer pointer-events-none absolute z-0 overflow-visible" aria-hidden>
          <CompanionAvatar
            state={avatarState}
            inputTyping={inputTyping}
            size={COMPACT_ORB_SIZE}
            glowCanvasScale={COMPACT_ORB_GLOW_SCALE}
            parallaxStrength={0.08}
            className="bg-transparent"
          />
        </div>

        {bubble && (
          <div
            className="compact-reply-anchor compact-no-drag pointer-events-auto absolute z-30"
            onClick={() => openMain('chat')}
            role="status"
            aria-live="polite"
          >
            <div key={bubble.id} className="compact-reply-bubble glass-panel">
              {bubble.text}
            </div>
          </div>
        )}

        <div className="compact-core-anchor compact-no-drag overflow-visible">
          <button
            type="button"
            className="flex flex-col items-center gap-1"
            onClick={() => setArcOpen(!arcOpen)}
            onDoubleClick={() => openMain('chat')}
            title="鍗曞嚮鑿滃崟 路 鍙屽嚮灞曞紑涓婚潰鏉?
          >
            <LightCore className={idleRest ? 'scale-50 opacity-60' : ''} trust={trust} />
          </button>
          <ArcMenu
            open={arcOpen}
            onClose={() => setArcOpen(false)}
            onSelect={(tab) => openMain(tab)}
          />
        </div>
      </div>

      <p className="compact-pet-hint shrink-0 px-4 pb-2 text-center text-[10px] leading-relaxed tracking-wide text-ink-muted">
        妗屽疇妯″紡涓嬮儴鍒嗗姛鑳藉彈闄?
      </p>

      <div className="compact-no-drag relative z-10 px-4 pb-3">
        <div className="chat-input-wrap flex gap-2 p-1.5">
          <input
            {...bindComposerInput({
              value: input,
              onChange: (e) => setInput(e.target.value),
              onKeyDown: (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }
            })}
            placeholder={settings ? '璇寸偣浠€涔堚€? : '鍔犺浇涓€?}
            disabled={!settings || busy}
            className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted/70"
          />
          <button
            type="button"
            disabled={busy || !input.trim()}
            onClick={handleSend}
            className="chat-send-btn flex h-9 w-10 shrink-0 items-center justify-center text-sm disabled:opacity-50"
          >
            鈫?
          </button>
        </div>
        <div
          className="mt-2 h-0.5 w-full rounded-full transition-colors duration-700"
          style={{
            background: `linear-gradient(90deg, transparent, ${emotionBarColor}, transparent)`,
            boxShadow: `0 0 4px ${emotionBarColor}`
          }}
          aria-hidden
        />
      </div>
    </div>
  )
}

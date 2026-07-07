import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../lib/i18n'
import { applyTheme, toggleTheme, resolveInitialTheme, type ThemeMode } from '../lib/theme'
import { useAppStore } from '../store/appStore'
import { useUiStore } from '../store/uiStore'
import { useChatSend } from '../hooks/useChatSend'
import { useVoicePipeline } from '../hooks/useVoicePipeline'
import { loadVoiceSettings, syncVoiceSettingsToMain } from '../lib/voiceSettings'
import { CompanionAvatar } from './CompanionAvatar'
import { LightCore } from './LightCore'
import { ParticleFlow } from './ParticleFlow'
import { SoundWaveOverlay } from './SoundWaveOverlay'
import { useCompanionAvatar } from '../hooks/useCompanionAvatar'
import { MarkdownContent } from './MarkdownContent'
import { SearchPaperCard } from './SearchPaperCard'
import { isVisibleSearchRow } from '../lib/chatStreamRows'

/** 鍓ч櫌鍏夌悆鏄剧ず灏哄锛堜笌 glowCanvasScale 閰嶅悎锛屽嬁鎶?canvas 缂╁埌 size 浠ュ厤鏁翠綋鍙樺皬锛?*/
const THEATER_ORB_SIZE = 280

const MIC_STATE_KEY = 'Ackem-theater-mic-active'

function readDocumentTheme(): ThemeMode {
  return document.documentElement.classList.contains('theme-dark') ? 'dark' : 'light'
}

export function TheaterView(): JSX.Element | null {
  const open = useUiStore((s) => s.theaterOpen)
  const setOpen = useUiStore((s) => s.setTheaterOpen)
  const rows = useAppStore((s) => s.chatRows)
  const chatBusy = useAppStore((s) => s.chatBusy)
  const { send } = useChatSend()
  const [uiVisible, setUiVisible] = useState(true)
  const [input, setInput] = useState('')
  const [showInput, setShowInput] = useState(false)
  const [theme, setTheme] = useState<ThemeMode>(() => resolveInitialTheme())
  const [aro, setAro] = useState(0)
  const [aff, setAff] = useState(50)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // Voice pipeline
  const voice = useVoicePipeline()
  const voiceSettings = useMemo(() => loadVoiceSettings(), [open])
  const voiceActive =
    voice.state === 'listening' || voice.state === 'speaking' || voice.state === 'thinking'
  const voiceOnly = voiceSettings.inputChannel === 'voice-only'
  const textOnly = voiceSettings.inputChannel === 'text-only'
  const pttMode = voiceSettings.voiceMode === 'ptt'

  const scrollChatToEnd = (behavior: ScrollBehavior = 'smooth') => {
    const area = scrollAreaRef.current
    if (!area) return
    area.scrollTo({ top: area.scrollHeight, behavior })
  }

  // Theme sync
  useEffect(() => {
    if (!open) {
      document.documentElement.classList.remove('theater-open')
      return
    }
    document.documentElement.classList.add('theater-open')
    const synced = readDocumentTheme()
    setTheme(synced)
    applyTheme(synced)

    const obs = new MutationObserver(() => setTheme(readDocumentTheme()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => {
      obs.disconnect()
      document.documentElement.classList.remove('theater-open')
    }
  }, [open])

  // 鍓ч櫌浼氳瘽锛氬悓姝ヨ闊宠缃紱TTS 鍏抽棴鏃朵粛淇濈暀 ASR / 楹﹀厠椋庤矾寰?
  useEffect(() => {
    if (!open) {
      void window.Ackem.voice?.setTheaterSession?.(false)
      return
    }
    const s = loadVoiceSettings()
    if (!s.enabled || textOnly) {
      void window.Ackem.voice?.setTheaterSession?.(false)
      return
    }
    void syncVoiceSettingsToMain(s)
    void window.Ackem.voice?.setTheaterSession?.(true)
    voice.unlockAudio()
    return () => {
      void window.Ackem.voice?.setTheaterSession?.(false)
    }
  }, [open, textOnly, voice.unlockAudio])

  // Auto-hide UI 鈥?paused when voice is active
  useEffect(() => {
    if (!open) return
    let idleTimer = window.setTimeout(() => {
      if (!voiceActive) setUiVisible(false)
    }, 5000)
    const reset = () => {
      setUiVisible(true)
      window.clearTimeout(idleTimer)
      idleTimer = window.setTimeout(() => {
        if (!voiceActive) setUiVisible(false)
      }, 5000)
    }
    reset()
    window.addEventListener('mousemove', reset)
    window.addEventListener('keydown', reset)
    return () => {
      window.removeEventListener('mousemove', reset)
      window.removeEventListener('keydown', reset)
      window.clearTimeout(idleTimer)
    }
  }, [open, voiceActive])

  // Escape to exit
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  // Fetch emotion state
  useEffect(() => {
    void window.Ackem.getState().then((raw) => {
      const s = raw as { emotion?: { aro?: number; aff?: number } }
      if (s.emotion?.aro != null) setAro(s.emotion.aro)
      if (s.emotion?.aff != null) setAff(s.emotion.aff)
    })
  }, [open, rows.length])

  // Restore mic state from localStorage (when enabled + remember)
  useEffect(() => {
    if (!open || textOnly) return
    const s = loadVoiceSettings()
    if (!s.enabled || !s.rememberMicState) return
    const saved = localStorage.getItem(MIC_STATE_KEY)
    if (saved === 'true') {
      void voice.startListening()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, textOnly])

  // Handle ASR transcript 鈫?send or prefill input (dual channel)
  useEffect(() => {
    const unsub = window.Ackem.voice?.onTranscript?.((result) => {
      const text = result.text.trim()
      if (!text) return
      const channel = loadVoiceSettings().inputChannel
      if (channel === 'dual') {
        setInput(text)
        setShowInput(true)
        return
      }
      void send(text)
    })
    return unsub
  }, [send])

  const streamingAssistantLen = useMemo(() => {
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i]
      if (row.kind === 'message' && row.role === 'assistant') return row.content.length
    }
    return 0
  }, [rows])

  const lastAssistantIdx = useMemo(() => {
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i]
      if (r.kind === 'message' && r.role === 'assistant') return i
    }
    return -1
  }, [rows])

  const hasVisibleMessages = useMemo(
    () =>
      rows.some(
        (r, i) =>
          isVisibleSearchRow(r) ||
          (r.kind === 'message' &&
            (r.content ||
              (chatBusy && r.role === 'assistant' && i === lastAssistantIdx)))
      ),
    [rows, chatBusy, lastAssistantIdx]
  )

  useEffect(() => {
    if (!open) return
    scrollChatToEnd('smooth')
  }, [open, rows, streamingAssistantLen, showInput, chatBusy])

  // Save mic state on change
  useEffect(() => {
    if (loadVoiceSettings().rememberMicState) {
      localStorage.setItem(MIC_STATE_KEY, String(voice.micActive))
    }
  }, [voice.micActive])

  const { avatarState, inputTyping, bindComposerInput } = useCompanionAvatar({
    surface: 'theater',
    busy: chatBusy || voice.state === 'thinking',
    streamingAssistantLen,
    input,
    syncToStore: open
  })

  const clearComposerSurface = useUiStore((s) => s.clearComposerSurface)
  useEffect(() => {
    if (open) return
    clearComposerSurface('theater')
    voice.stopListening()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clearComposerSurface])

  if (!open) return null

  return (
    <div className="theater-root fixed inset-0 z-[100] flex min-h-0 flex-col bg-surface text-ink">
      <ParticleFlow aro={aro} />
      <SoundWaveOverlay
        active={avatarState === 'speaking'}
        aff={aff}
        aro={aro}
      />

      {/* 鍏ㄥ睆鑱婂ぉ鍖?*/}
      <div className="theater-chat relative z-10 flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollAreaRef}
          className="theater-scroll min-h-0 flex-1 overflow-y-auto px-6 pt-6"
        >
          <div className="mx-auto flex max-w-2xl flex-col gap-3 theater-chat-pad">
            {hasVisibleMessages ? (
              rows.map((m, i) => {
                if (m.kind === 'search') {
                  if (!isVisibleSearchRow(m)) return null
                  return (
                    <div key={`theater-search-${i}`} className="theater-paper-card">
                      <SearchPaperCard {...m} />
                    </div>
                  )
                }
                if (m.kind !== 'message') return null
                if (
                  !m.content &&
                  !(chatBusy && m.role === 'assistant' && i === lastAssistantIdx)
                ) {
                  return null
                }
                return (
                  <div
                    key={`theater-msg-${i}`}
                    className={[
                      'theater-bubble',
                      m.role === 'user' ? 'ml-auto text-ink-muted' : 'mr-auto text-ink'
                    ].join(' ')}
                  >
                    {m.role === 'assistant' ? (
                      m.content ? (
                        <>
                          <MarkdownContent source={m.content} chat />
                          {chatBusy && i === lastAssistantIdx ? (
                            <span className="streaming-message-cursor" aria-hidden />
                          ) : null}
                        </>
                      ) : chatBusy && i === lastAssistantIdx ? (
                        <span className="text-ink-muted/60 animate-pulse">鈥?/span>
                      ) : null
                    ) : (
                      <span className="whitespace-pre-wrap">{m.content}</span>
                    )}
                  </div>
                )
              })
            ) : (
              <p className="pt-[min(200px,28vh)] text-center text-sm text-ink-muted">璇寸偣浠€涔堬紝寮€濮嬪璇濃€?/p>
            )}
            <div ref={chatEndRef} className="h-px shrink-0" aria-hidden />
          </div>
        </div>

        <div
          className={[
            'theater-dock relative z-30 shrink-0 transition-opacity duration-500',
            uiVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
          ].join(' ')}
        >
          {showInput && !voiceOnly && (
            <div className="px-6 pb-2 pt-1">
              <div className="chat-input-wrap mx-auto flex max-w-lg gap-2 p-1.5">
                <input
                  {...bindComposerInput({
                    value: input,
                    onChange: (e) => setInput(e.target.value),
                    onKeyDown: (e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const t = input.trim()
                        if (t) {
                          setInput('')
                          void send(t)
                        }
                      }
                    }
                  })}
                  placeholder="璇寸偣浠€涔堚€?
                  className="flex-1 border-0 bg-transparent px-3 py-2 text-sm outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  className="chat-send-btn px-3 py-2 text-sm"
                  disabled={chatBusy}
                  onClick={() => {
                    const t = input.trim()
                    if (t) {
                      setInput('')
                      void send(t)
                    }
                  }}
                >
                  鈫?
                </button>
              </div>
            </div>
          )}

          <div className="theater-controls flex items-center justify-center gap-6 py-4">
            <LightCore />
            <button
              type="button"
              title="鍒囨崲涓婚"
              className="glass-nav-bead pointer-events-auto"
              onClick={() => setTheme(toggleTheme(theme))}
            >
              <span className="nav-bead-icon" aria-hidden>
                鈼?
              </span>
            </button>
            {!textOnly && (
              <button
                type="button"
                title={voice.micActive ? '鍏抽棴楹﹀厠椋? : '寮€鍚害鍏嬮'}
                className={[
                  'glass-nav-bead pointer-events-auto transition-all select-none',
                  voice.micActive ? 'ring-2 ring-cyan-400/60' : '',
                  voice.state === 'error' ? 'opacity-50' : ''
                ].join(' ')}
                onClick={() => {
                  if (pttMode) return
                  voice.toggleMic()
                }}
                onPointerDown={(e) => {
                  if (!pttMode) return
                  e.currentTarget.setPointerCapture(e.pointerId)
                  if (!voice.micActive) void voice.startListening()
                  voice.setPttActive(true)
                }}
                onPointerUp={() => {
                  if (!pttMode) return
                  voice.setPttActive(false)
                }}
                onPointerCancel={() => {
                  if (!pttMode) return
                  voice.setPttActive(false)
                }}
              >
                <span className="nav-bead-icon" aria-hidden>
                  {voice.micActive ? '馃帳' : '馃帣锔?}
                </span>
              </button>
            )}
            {!voiceOnly && (
              <button
                type="button"
                title="鏂囧瓧杈撳叆"
                className="glass-nav-bead pointer-events-auto"
                onClick={() => setShowInput((v) => !v)}
              >
                <span className="nav-bead-icon" aria-hidden>
                  鈱?
                </span>
              </button>
            )}
            <button
              type="button"
              title="閫€鍑哄墽闄?
              className="glass-nav-bead pointer-events-auto text-xs"
              onClick={() => setOpen(false)}
            >
              <span className="nav-bead-icon font-sans text-[11px] font-medium tracking-wide">
                Esc
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 鍏夌悆鎮诞灞?*/}
      <div className="theater-orb-layer pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center overflow-visible">
        <div className="theater-orb-hit pointer-events-auto overflow-visible">
          <CompanionAvatar
            state={avatarState}
            inputTyping={inputTyping}
            size={THEATER_ORB_SIZE}
            glowCanvasScale={2.8}
            parallaxStrength={0.08}
            className="bg-transparent"
          />
        </div>
      </div>
    </div>
  )
}

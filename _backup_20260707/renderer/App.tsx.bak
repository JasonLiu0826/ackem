import { useEffect, useState } from 'react'
import { NavBar } from './components/NavBar'
import { ChatPage } from './components/ChatPage'
import { MemoryPage } from './components/MemoryPage'
import { MemoryTimeline } from './components/MemoryTimeline'
import { ArchivePage } from './components/ArchivePage'
import { ImportPage } from './components/ImportPage'
import { SettingsPage } from './components/SettingsPage'
import { EmotionPanel } from './components/EmotionPanel'
import { TracePanel } from './components/TracePanel'
import { DiaryPage } from './components/DiaryPage'
import { GameModePage } from './components/GameModePage'
import { ExtensionCenterPage } from './components/ExtensionCenterPage'
import { TheaterView } from './components/TheaterView'
import { CommandPalette } from './components/CommandPalette'
import { PlanPanel } from './components/PlanPanel'
import { BackgroundTasksPanel } from './components/BackgroundTasksPanel'
import { PermissionRequestModal } from './components/PermissionRequestModal'
import { KgGraphView } from './components/memory-viz/KgGraphView'
import { AssocNetworkView } from './components/memory-viz/AssocNetworkView'
import { EmotionHeatmapView } from './components/memory-viz/EmotionHeatmapView'
import { DecayCurveView } from './components/memory-viz/DecayCurveView'
import { useAppStore, type Tab } from './store/appStore'
import { useUiStore } from './store/uiStore'
import type { PermissionRequestPayload } from '../../shared/openforuPermissions'
import { t, preloadI18n } from './lib/i18n'
import { isBritneyPreloadAvailable, formatMissingPreloadError, formatBootConnectingMessage } from './lib/rendererBoot'
import { dismissBootSplash, setBootSplashStatus, signalBootSplashReady } from './lib/bootSplash'

function MemoryRouter(): JSX.Element {
  const [view, setView] = useState<'archive' | 'search' | 'timeline' | 'import' | 'kggraph' | 'assoc' | 'heatmap' | 'decay'>('archive')
  const tabCls = (active: boolean) =>
    ['page-subtab', active ? 'page-subtab--active' : ''].filter(Boolean).join(' ')
  const memoryTabs = [
    { id: 'archive' as const, labelKey: 'nav.memory.archive' },
    { id: 'search' as const, labelKey: 'nav.memory.search' },
    { id: 'timeline' as const, labelKey: 'nav.memory.timeline' },
    { id: 'import' as const, labelKey: 'nav.memory.import' },
    { id: 'kggraph' as const, labelKey: 'nav.memory.kg' },
    { id: 'assoc' as const, labelKey: 'nav.memory.assoc' },
    { id: 'heatmap' as const, labelKey: 'nav.memory.heatmap' },
    { id: 'decay' as const, labelKey: 'nav.memory.decay' }
  ]
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
      <div className="flex gap-0 border-b border-surface-inset glass-panel px-4 overflow-x-auto">
        {memoryTabs.map(({ id, labelKey }) => (
          <button key={id} type="button" onClick={() => setView(id)} className={tabCls(view === id)}>
            {t(labelKey)}
          </button>
        ))}
      </div>
      {view === 'archive' && <ArchivePage />}
      {view === 'search' && <MemoryPage />}
      {view === 'timeline' && <MemoryTimeline />}
      {view === 'import' && <ImportPage />}
      {view === 'kggraph' && <KgGraphView />}
      {view === 'assoc' && <AssocNetworkView />}
      {view === 'heatmap' && <EmotionHeatmapView />}
      {view === 'decay' && <DecayCurveView />}
    </div>
  )
}

export default function App(): JSX.Element {
  const tab = useAppStore((s) => s.tab)
  const setTab = useAppStore((s) => s.setTab)
  const requestChatInputFocus = useAppStore((s) => s.requestChatInputFocus)
  const setSelectedGameId = useAppStore((s) => s.setSelectedGameId)
  const handleTab = (t: typeof tab) => {
    setTab(t)
    if (t === 'chat') requestChatInputFocus()
    if (t === 'gamemode') setSelectedGameId(null)
  }
  const setSettings = useAppStore((s) => s.setSettings)
  const pushToast = useAppStore((s) => s.pushToast)
  const toast = useAppStore((s) => s.toast)
  const chatResetKey = useAppStore((s) => s.chatResetKey)
  const [bootErr, setBootErr] = useState<string | null>(null)
  /** 子组件 useEffect 会先于本组件执行；在 IPC 就绪前不得挂载 ChatPage 等，否则会访问 undefined.britney */
  const [bootReady, setBootReady] = useState(false)
  const [permRequest, setPermRequest] = useState<PermissionRequestPayload | null>(null)

  const setViewLevel = useUiStore((s) => s.setViewLevel)
  const setTheaterOpen = useUiStore((s) => s.setTheaterOpen)
  const theaterOpen = useUiStore((s) => s.theaterOpen)

  useEffect(() => {
    if (!bootReady || typeof window.britney === 'undefined') return
    window.britney.ui.onExpand((payload) => {
      if (payload.tab) setTab(payload.tab as Tab)
      else setTab('chat')
      requestChatInputFocus()
    })
    window.britney.ui.onLevel((p) => {
      setViewLevel(p.level as 0 | 1 | 2 | 3)
      if (p.level === 3) setTheaterOpen(true)
      else setTheaterOpen(false)
    })
    window.britney.ui.onExtensionToast?.((payload) => {
      if (payload?.text) pushToast(payload.text)
    })
  }, [bootReady, setTab, requestChatInputFocus, setViewLevel, setTheaterOpen, pushToast])

  useEffect(() => {
    void (async () => {
      try {
        await preloadI18n()
        if (!isBritneyPreloadAvailable()) {
          setBootErr(formatMissingPreloadError())
          return
        }
        setBootSplashStatus(
          t('boot.connecting') !== 'boot.connecting' ? t('boot.connecting') : formatBootConnectingMessage()
        )
        const s = await window.britney.getSettings()
        setSettings(s)
        setBootSplashStatus(
          t('boot.loadingSettings') !== 'boot.loadingSettings' ? t('boot.loadingSettings') : '加载配置…'
        )
        await window.britney.ensureLayout()
        setBootSplashStatus(t('boot.preparing') !== 'boot.preparing' ? t('boot.preparing') : '准备界面…')
        setBootReady(true)
      } catch (e) {
        setBootErr(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [setSettings])

  useEffect(() => {
    if (!bootErr) return
    let cancelled = false
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) dismissBootSplash()
      })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [bootErr])

  useEffect(() => {
    if (!bootReady) return
    let cancelled = false
    void (async () => {
      try {
        await document.fonts.ready
      } catch {
        /* ignore */
      }
      if (cancelled) return
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) signalBootSplashReady()
        })
      })
    })()
    return () => {
      cancelled = true
    }
  }, [bootReady])

  // BootSplash：进度跑满且 signalBootSplashReady 后自动淡出

  useEffect(() => {
    if (!bootReady || typeof window.britney === 'undefined') return
    const unsubscribe = window.britney.openforu.onNotify((p) => {
      useAppStore.getState().setChatRows((prev) => {
        const last = prev[prev.length - 1]
        if (last?.kind === 'system' && last.content === p.text) return prev
        return [...prev, { kind: 'system', content: p.text, tone: 'success' as const }]
      })
    })
    return unsubscribe
  }, [bootReady])

  useEffect(() => {
    if (!bootReady || typeof window.britney === 'undefined') return
    return window.britney.openforu.permissions.onRequest((payload) => {
      setPermRequest(payload)
    })
  }, [bootReady])

  if (bootErr) {
    return (
      <div
        style={{
          boxSizing: 'border-box',
          minHeight: '100vh',
          padding: 24,
          fontFamily: 'system-ui,sans-serif',
          background: '#fafafa',
          color: '#18181b'
        }}
      >
        <h1 style={{ fontSize: 18, margin: '0 0 12px' }}>{t('boot.noPreloadTitle') !== 'boot.noPreloadTitle' ? t('boot.noPreloadTitle') : '无法连接主进程'}</h1>
        <p style={{ margin: 0, fontSize: 13, color: '#52525b', whiteSpace: 'pre-wrap' }}>{bootErr}</p>
      </div>
    )
  }

  if (!bootReady) {
    return <></>
  }

  return (
    <>
      <div className={['app-ambient', theaterOpen ? 'opacity-0' : ''].filter(Boolean).join(' ')} aria-hidden />
      <div
        className={['app-shell flex h-full min-h-0', theaterOpen ? 'pointer-events-none' : '']
          .filter(Boolean)
          .join(' ')}
        aria-hidden={theaterOpen ? true : undefined}
      >
        <NavBar tab={tab} onTab={handleTab} />
        <div className="app-main bg-surface">
          {tab === 'chat' && (
            <div className="flex min-h-0 min-w-0 flex-1">
              <ChatPage key={chatResetKey} />
              <aside className="w-[280px] shrink-0 overflow-y-auto border-l border-surface-inset/80 bg-surface-raised/50">
                <EmotionPanel />
              </aside>
            </div>
          )}
          {tab === 'memory' && <MemoryRouter />}
          {tab === 'diary' && <DiaryPage />}
          {tab === 'gamemode' && <GameModePage />}
          {tab === 'extensions' && <ExtensionCenterPage />}
          {tab === 'trace' && <TracePanel />}
          {tab === 'import' && <ImportPage />}
          {tab === 'settings' && <SettingsPage />}
        </div>
        {toast && (
          <div className="toast-glass pointer-events-none fixed bottom-6 left-1/2 z-50 w-[min(520px,calc(100%-32px))] -translate-x-1/2 rounded-2xl px-4 py-3 text-center text-xs">
            {toast.text}
          </div>
        )}
      </div>
      <TheaterView />
      <CommandPalette />
      <PlanPanel />
      <BackgroundTasksPanel />
      <PermissionRequestModal
        open={permRequest != null}
        payload={permRequest}
        onApprove={() => {
          if (!permRequest) return
          void window.britney.openforu.permissions.approve(permRequest.requestId).then(() => {
            setPermRequest(null)
          })
        }}
        onDeny={() => {
          if (!permRequest) return
          void window.britney.openforu.permissions.deny(permRequest.requestId).then(() => {
            setPermRequest(null)
          })
        }}
      />
    </>
  )
}

import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { CompactView } from './components/CompactView'
import { ErrorBoundary } from './ErrorBoundary'
import { useAppStore, normalizeChatRow, type ChatRow } from './store/appStore'
import { applyTheme, initThemeSync, resolveInitialTheme } from './lib/theme'
import './assets/main.css'

applyTheme(resolveInitialTheme())

function PetRoot(): JSX.Element {
  const [ready, setReady] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const setSettings = useAppStore((s) => s.setSettings)

  useEffect(() => {
    void (async () => {
      try {
        if (typeof window.Ackem === 'undefined') {
          setErr('鏈娴嬪埌涓昏繘绋嬫ˉ鎺?)
          return
        }
        const s = await window.Ackem.getSettings()
        setSettings(s)
        const h = await window.Ackem.loadChatHistory()
        if (h?.length) {
          const rows = h.map(normalizeChatRow).filter((r): r is ChatRow => r != null)
          if (rows.length) useAppStore.getState().setChatRows(rows)
        }
        initThemeSync()
        setReady(true)
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [setSettings])

  if (err) {
    return <div className="p-4 text-xs text-danger">{err}</div>
  }
  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-xs text-ink-muted">杩炴帴涓€?/div>
    )
  }
  return <CompactView />
}

const el = document.getElementById('root')
if (el) {
  ReactDOM.createRoot(el).render(
    <React.StrictMode>
      <ErrorBoundary>
        <PetRoot />
      </ErrorBoundary>
    </React.StrictMode>
  )
}

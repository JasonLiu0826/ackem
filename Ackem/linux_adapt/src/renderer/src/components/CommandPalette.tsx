import { useCallback, useEffect, useMemo, useState } from 'react'
import { t } from '../lib/i18n'
import { useAppStore } from '../store/appStore'
import { useUiStore } from '../store/uiStore'
import { toggleTheme, resolveInitialTheme, type ThemeMode } from '../lib/theme'
import { isOpenForUConfigured, OPENFORU_NOT_CONFIGURED_MSG } from '../../../shared/openforuConfig'

type Cmd = { id: string; label: string; run: () => void }

export function CommandPalette(): JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const setTab = useAppStore((s) => s.setTab)
  const pushToast = useAppStore((s) => s.pushToast)
  const settings = useAppStore((s) => s.settings)
  const setTheater = useUiStore((s) => s.setTheaterOpen)
  const setPlan = useUiStore((s) => s.setPlanOpen)
  const [theme, setTheme] = useState<ThemeMode>(() => resolveInitialTheme())

  const openPlan = useCallback(() => {
    if (!isOpenForUConfigured(settings)) {
      pushToast(OPENFORU_NOT_CONFIGURED_MSG)
      setTab('settings')
      return
    }
    setPlan(true)
  }, [pushToast, setPlan, setTab, settings])

  const cmds: Cmd[] = useMemo(
    () => [
      { id: 'chat', label: '打开对话', run: () => setTab('chat') },
      { id: 'memory', label: '打开记忆', run: () => setTab('memory') },
      { id: 'diary', label: '打开日记', run: () => setTab('diary') },
      { id: 'settings', label: '打开设置', run: () => setTab('settings') },
      { id: 'trace', label: '打开调试', run: () => setTab('trace') },
      { id: 'ext', label: '打开扩展中心', run: () => setTab('extensions') },
      { id: 'theater', label: '进入剧院模式', run: () => setTheater(true) },
      { id: 'pet', label: '折叠到桌宠', run: () => void window.ackem.ui.showPet() },
      { id: 'expand', label: '展开主面板', run: () => void window.ackem.ui.expandToMain() },
      { id: 'plan', label: '创建扩展 (Plan)', run: openPlan },
      {
        id: 'theme',
        label: '切换明/暗主题',
        run: () => setTheme(toggleTheme(theme))
      },
      {
        id: 'diary-gen',
        label: '生成今日日记',
        run: () => void window.ackem.diaryGenerate()
      }
    ],
    [setTab, setTheater, openPlan, theme]
  )

  const filtered = cmds.filter((c) => !q.trim() || c.label.toLowerCase().includes(q.toLowerCase()))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
        setQ('')
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/20 pt-[15vh] backdrop-blur-sm">
      <div className="glass-panel w-[min(480px,92vw)] rounded-2xl p-2 shadow-glow-lg">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索命令…"
          className="w-full border-0 bg-transparent px-3 py-2.5 text-sm outline-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filtered[0]) {
              filtered[0].run()
              setOpen(false)
            }
          }}
        />
        <ul className="max-h-64 overflow-y-auto border-t border-surface-inset/50 py-1">
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-surface-inset/40"
                onClick={() => {
                  c.run()
                  setOpen(false)
                }}
              >
                {c.label}
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3 py-4 text-center text-xs text-ink-muted">无匹配命令</li>
          )}
        </ul>
      </div>
    </div>
  )
}

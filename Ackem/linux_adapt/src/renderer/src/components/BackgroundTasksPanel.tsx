import { useEffect, useState } from 'react'
import { t } from '../lib/i18n'
import { useAppStore } from '../store/appStore'

type Task = { id: string; label: string; busy: boolean }

export function BackgroundTasksPanel(): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [tasks, setTasks] = useState<Task[]>([])
  const chatTurnCount = useAppStore((s) => s.chatTurnCount)

  useEffect(() => {
    setTasks((prev) => {
      const hasChat = prev.some((t) => t.id === 'chat')
      if (!hasChat && chatTurnCount > 0) return prev
      return prev.filter((t) => t.id !== 'engine')
    })
  }, [chatTurnCount])

  const active = tasks.filter((t) => t.busy)
  if (active.length === 0 && !expanded) {
    return (
      <button
        type="button"
        className="fixed bottom-4 right-4 z-40 h-2 w-2 rounded-full bg-accent/30 shadow-glow opacity-0 pointer-events-none"
        aria-hidden
      />
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="glass-panel flex h-10 w-10 items-center justify-center rounded-full shadow-glow-md"
        title="后台任务"
      >
        <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
      </button>
      {expanded && (
        <div className="glass-panel absolute bottom-12 right-0 w-56 rounded-xl p-3 text-xs">
          <p className="mb-2 font-medium text-ink">后台任务</p>
          {tasks.length === 0 ? (
            <p className="text-ink-muted">暂无活跃任务</p>
          ) : (
            <ul className="space-y-1">
              {tasks.map((t) => (
                <li key={t.id} className="text-ink-muted">
                  {t.label} {t.busy ? '…' : '✓'}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

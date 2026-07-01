import type { Tab } from '../store/appStore'
import { t } from '../lib/i18n'

const ITEMS: { icon: string; label: string; tab: Tab }[] = [
  { icon: '💬', label: '对话', tab: 'chat' },
  { icon: '🧠', label: '记忆', tab: 'memory' },
  { icon: '📔', label: '日记', tab: 'diary' },
  { icon: '🎮', label: '游戏', tab: 'gamemode' },
  { icon: '🧩', label: '扩展', tab: 'extensions' },
  { icon: '⚙', label: '设置', tab: 'settings' }
]

type Props = {
  open: boolean
  onClose: () => void
  onSelect: (tab: Tab) => void
}

export function ArcMenu({ open, onClose, onSelect }: Props): JSX.Element | null {
  if (!open) return null

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 cursor-default bg-transparent"
        aria-label="关闭菜单"
        onClick={onClose}
      />
      <div className="pointer-events-none absolute left-1/2 top-[38%] z-50 h-0 w-0 -translate-x-1/2">
        {ITEMS.map((item, i) => {
          const angle = (-Math.PI / 2) + ((i - 2.5) / 5) * (Math.PI * 0.85)
          const r = 72
          const x = Math.cos(angle) * r
          const y = Math.sin(angle) * r
          return (
            <button
              key={item.tab}
              type="button"
              title={item.label}
              style={{
                transform: `translate(${x}px, ${y}px)`,
                animationDelay: `${i * 40}ms`
              }}
              className="glass-nav-bead pointer-events-auto absolute -left-5 -top-5 animate-[messageIn_250ms_ease-out_both]"
              onClick={() => {
                onSelect(item.tab)
                onClose()
              }}
            >
              {item.icon}
            </button>
          )
        })}
      </div>
    </>
  )
}

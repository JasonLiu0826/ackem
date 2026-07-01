import { useEffect, useState } from 'react'
import { t } from '../lib/i18n'
import { useAppStore } from '../store/appStore'
import { McPage } from './McPage'
import { ExtensionCard } from './ExtensionCard'
import { ExtensionDetailPanel, type ExtensionItem } from './ExtensionDetailPanel'

type GameProviderManifest = {
  gameId: string
  gameName: string
  name: string
  description: string
  tags?: string[]
  recommendedPersonalityTags?: string[]
  eventSources?: string[]
}

const GAME_ICONS: Record<string, string> = {
  minecraft: '⛏️'
}

function gameIcon(gameId: string): string {
  return GAME_ICONS[gameId] ?? '🎮'
}

function GameListPage(props: {
  games: GameProviderManifest[]
  loading: boolean
  onSelect: (gameId: string) => void
}): JSX.Element {
  const { games, loading, onSelect } = props
  const [selected, setSelected] = useState<ExtensionItem | null>(null)

  return (
    <div className="h-full overflow-y-auto bg-surface">
      <header className="glass-panel border-b border-surface-inset/60 px-6 py-4">
        <h1 className="font-display text-base font-semibold text-ink">游戏陪伴</h1>
        <p className="mt-0.5 text-xs text-ink-muted">
          选择一款游戏，配置 AI 伴侣如何进入游戏、感知事件并与你互动。
        </p>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-6">
        {loading ? (
          <p className="text-sm text-ink-muted">正在加载游戏列表…</p>
        ) : games.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-surface-inset bg-surface-raised p-8 text-center">
            <p className="text-sm text-ink-muted">暂无可用游戏模式，请检查扩展是否已加载。</p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {games.map((game) => {
                const item: ExtensionItem = {
                  id: game.gameId,
                  name: game.gameName,
                  description: game.description,
                  version: '1.0',
                  status: 'installed',
                  readme: game.recommendedPersonalityTags?.length
                    ? `推荐人格标签：${game.recommendedPersonalityTags.join('、')}`
                    : undefined
                }
                return (
                  <div key={game.gameId} className="space-y-2">
                    <ExtensionCard
                      item={item}
                      selected={selected?.id === game.gameId}
                      onClick={() => setSelected(item)}
                    />
                    <button
                      type="button"
                      onClick={() => onSelect(game.gameId)}
                      className="w-full text-center text-xs text-accent hover:underline"
                    >
                      进入设置 →
                    </button>
                  </div>
                )
              })}
            </div>
            {selected && (
              <ExtensionDetailPanel
                item={selected}
                onClose={() => setSelected(null)}
                onToggle={async () => {
                  onSelect(selected.id)
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function UnknownGamePage(props: { gameId: string; onBack: () => void }): JSX.Element {
  return (
    <div className="h-full overflow-y-auto bg-surface">
      <header className="glass-panel border-b border-surface-inset/60 px-6 py-4">
        <button
          type="button"
          onClick={props.onBack}
          className="mb-2 text-xs text-ink-muted hover:text-ink transition"
        >
          ← 返回游戏列表
        </button>
        <h1 className="text-base font-semibold text-ink">{props.gameId}</h1>
        <p className="mt-0.5 text-xs text-ink-muted">该游戏的设置页面尚未接入。</p>
      </header>
    </div>
  )
}

function GameSettingsPage(props: { gameId: string; onBack: () => void }): JSX.Element {
  switch (props.gameId) {
    case 'minecraft':
      return <McPage onBack={props.onBack} />
    default:
      return <UnknownGamePage gameId={props.gameId} onBack={props.onBack} />
  }
}

export function GameModePage(): JSX.Element {
  const selectedGameId = useAppStore((s) => s.selectedGameId)
  const setSelectedGameId = useAppStore((s) => s.setSelectedGameId)
  const [games, setGames] = useState<GameProviderManifest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = (await window.ackem.ext.gamemode.list()) as GameProviderManifest[]
        if (!cancelled) setGames(list)
      } catch {
        if (!cancelled) setGames([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (selectedGameId) {
    return (
      <GameSettingsPage
        gameId={selectedGameId}
        onBack={() => setSelectedGameId(null)}
      />
    )
  }

  return (
    <GameListPage
      games={games}
      loading={loading}
      onSelect={setSelectedGameId}
    />
  )
}

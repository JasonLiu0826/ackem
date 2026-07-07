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
  minecraft: '鉀忥笍'
}

function gameIcon(gameId: string): string {
  return GAME_ICONS[gameId] ?? '馃幃'
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
        <h1 className="font-display text-base font-semibold text-ink">娓告垙闄即</h1>
        <p className="mt-0.5 text-xs text-ink-muted">
          閫夋嫨涓€娆炬父鎴忥紝閰嶇疆 AI 浼翠荆濡備綍杩涘叆娓告垙銆佹劅鐭ヤ簨浠跺苟涓庝綘浜掑姩銆?
        </p>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-6">
        {loading ? (
          <p className="text-sm text-ink-muted">姝ｅ湪鍔犺浇娓告垙鍒楄〃鈥?/p>
        ) : games.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-surface-inset bg-surface-raised p-8 text-center">
            <p className="text-sm text-ink-muted">鏆傛棤鍙敤娓告垙妯″紡锛岃妫€鏌ユ墿灞曟槸鍚﹀凡鍔犺浇銆?/p>
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
                    ? `鎺ㄨ崘浜烘牸鏍囩锛?{game.recommendedPersonalityTags.join('銆?)}`
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
                      杩涘叆璁剧疆 鈫?
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
          鈫?杩斿洖娓告垙鍒楄〃
        </button>
        <h1 className="text-base font-semibold text-ink">{props.gameId}</h1>
        <p className="mt-0.5 text-xs text-ink-muted">璇ユ父鎴忕殑璁剧疆椤甸潰灏氭湭鎺ュ叆銆?/p>
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
        const list = (await window.Ackem.ext.gamemode.list()) as GameProviderManifest[]
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

import { useEffect, useState, useCallback } from 'react'
import { t } from '../lib/i18n'
import { useAppStore } from '../store/appStore'
import type { McBotDebugSnapshot } from '../Ackem'

type BotStatus = {
  connected: boolean
  username?: string
  health?: number
  hunger?: number
  position?: { x: number; y: number; z: number }
  dimension?: string
  wsConnected?: boolean
}

type McStatus = {
  running: boolean
  wsPort: number
  wsClients: number
}

/* 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲
   MC 闄即鐙珛鎺у埗鍙?
   鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲 */
const mc = () => window.Ackem.ext.gamemode.minecraft

export function McPage(props: { onBack?: () => void }): JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const setSettings = useAppStore((s) => s.setSettings)
  const pushToast = useAppStore((s) => s.pushToast)

  // 鈹€鈹€ Bot 杩炴帴锛堜粠鎸佷箙鍖栬缃仮澶嶏級鈹€鈹€
  const [botHost, setBotHost] = useState(settings?.mcBotHost || 'localhost')
  const [botPort, setBotPort] = useState(settings?.mcBotPort || 25565)
  const [botUsername, setBotUsername] = useState(settings?.mcBotUsername || 'AckemBot')
  const [botPassword, setBotPassword] = useState('')
  const [botConnecting, setBotConnecting] = useState(false)
  const [botStatus, setBotStatus] = useState<BotStatus>({ connected: false })

  // 鈹€鈹€ 鏃ュ織鐩戝惉锛堜粠鎸佷箙鍖栬缃仮澶嶏級鈹€鈹€
  const [logPath, setLogPath] = useState(settings?.mcLogPath || '')
  const [wsPort, setWsPort] = useState(19532)
  const [wsStatus, setWsStatus] = useState<McStatus>({ running: false, wsPort: 19532, wsClients: 0 })
  const [logWatching, setLogWatching] = useState(false)

  // 鈹€鈹€ 娴嬭瘯 鈹€鈹€
  const [testReaction, setTestReaction] = useState('')
  const [testBusy, setTestBusy] = useState(false)

  // 鈹€鈹€ 瀹炴満璋冭瘯 鈹€鈹€
  const [botDebug, setBotDebug] = useState<McBotDebugSnapshot | null>(null)

  // 鎸佷箙鍖?MC 璁剧疆
  const saveMcSettings = useCallback(async (patch: Record<string, unknown>) => {
    try {
      const next = await window.Ackem.setSettings(patch as Partial<import('../Ackem').AppSettings>)
      if (setSettings) setSettings(next)
    } catch { /* ignore */ }
  }, [setSettings])

  // 瀹氭湡鍒锋柊 Bot 鐘舵€?
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const s = await mc().botStatus() as BotStatus
        setBotStatus(s)
      } catch { /* ignore */ }
    }, 3000)
    return () => clearInterval(t)
  }, [])

  // 鍒锋柊 WS 鐘舵€?
  const refreshWsStatus = useCallback(async () => {
    try {
      const s = await mc().getWsStatus() as McStatus
      setWsStatus(s)
    } catch { /* ignore */ }
  }, [])
  useEffect(() => { void refreshWsStatus() }, [refreshWsStatus])

  // 瀹炴満璋冭瘯锛氭帹閫?+ 杞鍏滃簳
  useEffect(() => {
    window.Ackem.onMcBotDebug((snap) => setBotDebug(snap))
    const poll = setInterval(async () => {
      if (!botStatus.connected) return
      try {
        const snap = await mc().botDebug() as McBotDebugSnapshot | null
        if (snap) setBotDebug(snap)
      } catch { /* ignore */ }
    }, 1500)
    return () => clearInterval(poll)
  }, [botStatus.connected])

  const opStateLabel: Record<string, string> = {
    IDLE: '绌洪棽',
    FOLLOWING: '璺熼殢',
    COMBAT: '鎴樻枟',
    RESCUE: '鏁戞彺',
    STUCK: '鍗′綇',
    NAVIGATING: '瀵艰埅',
    PORTAL: '浼犻€侀棬',
  }

  // 鈹€鈹€ 鎿嶄綔鍑芥暟 鈹€鈹€
  const syncEngine = async () => {
    try {
      await mc().syncEngineState()
      pushToast('寮曟搸鐘舵€佸凡鍚屾鍒?MC')
    } catch (e) { pushToast('鍚屾澶辫触锛? + (e instanceof Error ? e.message : String(e))) }
  }

  const connectBot = async () => {
    setBotConnecting(true)
    try {
      await mc().syncEngineState()
      await mc().botStart({
        host: botHost, port: botPort, username: botUsername,
        ...(botPassword ? { password: botPassword } : {}),
      })
      setBotStatus({ connected: true, username: botUsername })
      pushToast(`鉁?${botUsername} 宸插姞鍏ユ父鎴廯)
    } catch (e) {
      pushToast('杩炴帴澶辫触锛? + (e instanceof Error ? e.message : String(e)))
    } finally { setBotConnecting(false) }
  }

  const disconnectBot = async () => {
    setBotConnecting(true)
    try {
      await mc().botStop()
      setBotStatus({ connected: false })
      pushToast('Bot 宸叉柇寮€')
    } catch (e) {
      pushToast('鏂紑澶辫触锛? + (e instanceof Error ? e.message : String(e)))
    } finally { setBotConnecting(false) }
  }

  const testMcReaction = async () => {
    setTestBusy(true)
    setTestReaction('')
    try {
      // 鍏堢敤鏃ュ織瑙ｆ瀽娴嬭瘯浜嬩欢
      const line = '[Server thread/INFO]: JasonLiu has made the advancement [Diamonds!]'
      const event = await mc().parseLog(line)
      if (!event) { pushToast('鏃ュ織瑙ｆ瀽澶辫触'); return }
      const r = await mc().react(event)
      setTestReaction(`[${event.type.replace('mc:', '')}] ${r.text}`)
      if (r.isEasterEgg) pushToast('馃帀 瑙﹀彂浜嗗僵铔嬶紒')
    } catch (e) {
      pushToast('娴嬭瘯澶辫触锛? + (e instanceof Error ? e.message : String(e)))
    } finally { setTestBusy(false) }
  }

  // 鈹€鈹€ 浜烘牸鎴樻枟椋庢牸閫熸煡 鈹€鈹€
  const presetId = useAppStore((s) => s.settings?.personalityPresetId)
  const combatStyles: Record<string, string> = {
    deredere:   '娓╂煍 路 鍏堜繚浣犲啀绠¤嚜宸?路 琛€閲忎綆浼氭挙閫€',
    tsundere:   '鍌插▏ 路 鍐插墠闈笉鎵胯 路 鍢寸‖"娌″湪甯綘"',
    yandere:    '鐥呭▏ 路 杩藉埌搴曟涔熶笉閫€ 路 璋佹暍纰颁綘璋佹',
    kuudere:    '涓夋棤 路 娌夐粯楂樻晥 路 姣忓垁绮惧噯',
    genki:      '鍏冩皵 路 杈规墦杈瑰彨"鍛€锛?"鍝堬紒"',
    shitakiri:  '姣掕垖 路 鐢ㄦ枾澶?路 "鐢ㄦ枾鏄湅寰楄捣浣?',
    mesugaki:   '闆屽皬楝?路 杩滅▼鏀惧喎绠?路 杩戣韩灏辫窇',
    gap_moe:    '鍙嶅樊 路 鎱㈡偁鎮犫啋鐬棿鍒囬捇鐭冲墤"婊氬紑锛侊紒锛?',
    ice_queen:  '鍐疯壋 路 鍐烽潤楂樻晥 路 涓嶅簾璇?,
    bokke:      '澶╃劧鍛?路 鍙嶅簲鎱?路 鍋跺皵鎵撶┖"璇讹紵"',
    loyal_pup:  '蹇犵姮 路 姝讳篃涓嶉€€ 路 姘歌繙鍦ㄤ綘鍓嶉潰',
    mommy:      '濡堝 路 鏃跺埢鍑嗗鍔犺 路 "浣犲張娌″悆涓滆タ瀵瑰惂"',
  }

  return (
    <div className="mc-settings-page h-full overflow-y-auto bg-surface">
      {/* 鈺愨晲鈺?椤靛ご 鈺愨晲鈺?*/}
      <header className="glass-panel border-b border-surface-inset/60 px-6 py-4">
        {props.onBack && (
          <button
            type="button"
            onClick={props.onBack}
            className="mb-2 text-xs text-ink-muted hover:text-ink transition"
          >
            鈫?杩斿洖娓告垙鍒楄〃
          </button>
        )}
        <h1 className="text-base font-semibold text-ink">Minecraft 闄即</h1>
        <p className="mt-0.5 text-xs text-ink-muted">
          AI 浼翠荆浠ョ嫭绔嬬帺瀹惰韩浠借繘鍏?Minecraft锛屼笌浣犱竴璧锋寲鐭裤€佹墦鎬€佺洊鎴垮瓙銆?
        </p>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-6 space-y-6">

        {/* 鈺愨晲鈺?鐘舵€佹€昏 鈺愨晲鈺?*/}
        <section className="glass-panel rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-ink mb-4">鐘舵€佹€昏</h2>
          <div className="grid grid-cols-2 gap-4">
            {/* Bot 鐘舵€?*/}
            <div className="rounded-xl border border-surface-inset bg-surface p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${botStatus.connected ? 'bg-green-500 animate-pulse' : 'bg-surface-inset'}`} />
                <span className="text-sm font-medium text-ink">Bot 杩炴帴</span>
              </div>
              {botStatus.connected ? (
                <div className="space-y-1 text-xs text-ink-muted">
                  <div>璐﹀彿锛?span className="text-ink font-medium">{botStatus.username}</span></div>
                  <div>琛€閲忥細<span className="text-ink">{botStatus.health ?? '?'}</span> / 20</div>
                  <div>缁村害锛?span className="text-ink">{botStatus.dimension ?? '?'}</span></div>
                  <div>鍧愭爣锛?span className="font-mono text-ink">
                    ({botStatus.position?.x?.toFixed(0) ?? '?'}, {botStatus.position?.y?.toFixed(0) ?? '?'}, {botStatus.position?.z?.toFixed(0) ?? '?'})
                  </span></div>
                  <div>Ackem WS锛歿botStatus.wsConnected ? '宸茶繛鎺? : '鏈繛鎺?}</div>
                </div>
              ) : (
                <div className="text-xs text-ink-muted">鏈繛鎺?/div>
              )}
            </div>

            {/* WS + 鏃ュ織鐘舵€?*/}
            <div className="rounded-xl border border-surface-inset bg-surface p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${wsStatus.running ? 'bg-blue-500' : 'bg-surface-inset'}`} />
                <span className="text-sm font-medium text-ink">WebSocket 鏈嶅姟</span>
              </div>
              <div className="space-y-1 text-xs text-ink-muted">
                <div>绔彛锛?span className="font-mono text-ink">ws://localhost:{wsStatus.wsPort}</span></div>
                <div>杩炴帴鏁帮細<span className="text-ink">{wsStatus.wsClients}</span></div>
              </div>
              <button
                onClick={() => void refreshWsStatus()}
                className="field-btn-secondary mt-3 px-2.5 py-1 text-[11px] text-ink-muted"
              >
                鍒锋柊
              </button>
            </div>
          </div>
        </section>

        {/* 鈺愨晲鈺?瀹炴満璋冭瘯闈㈡澘 鈺愨晲鈺?*/}
        {botStatus.connected && (
          <section className="mc-debug-section rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-ink mb-1">瀹炴満璋冭瘯</h2>
            <p className="text-xs text-ink-muted mb-4">
              瀹炴椂鏌ョ湅 Bot 鍐崇瓥銆佽矾寰勪笌鎴樻枟鐩爣锛屼究浜庢帓鏌ョ珯妗┿€佷笉鎵撴€瓑闂銆?
            </p>
            {botDebug ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
                <div className="mc-debug-cell">
                  <div className="text-ink-muted mb-0.5">杩愯鐘舵€?/div>
                  <div className="text-ink font-semibold">{opStateLabel[botDebug.opState] ?? botDebug.opState}</div>
                </div>
                <div className="mc-debug-cell">
                  <div className="text-ink-muted mb-0.5">鍐崇瓥</div>
                  <div className="text-ink">{botDebug.decisionType ?? '鈥?} ({botDebug.decisionPriority ?? '鈥?})</div>
                </div>
                <div className="mc-debug-cell col-span-2 sm:col-span-1">
                  <div className="text-ink-muted mb-0.5">鍔ㄤ綔</div>
                  <div className="text-ink truncate" title={botDebug.actionSummary}>{botDebug.actionSummary || '鈥?}</div>
                </div>
                <div className="mc-debug-cell">
                  <div className="text-ink-muted mb-0.5">璺緞</div>
                  <div className="text-ink">{botDebug.pathStatus}</div>
                </div>
                <div className="mc-debug-cell">
                  <div className="text-ink-muted mb-0.5">璺濈帺瀹?/div>
                  <div className="text-ink">{botDebug.distToPlayer} 鏍?/div>
                </div>
                <div className="mc-debug-cell">
                  <div className="text-ink-muted mb-0.5">鍗′綇</div>
                  <div className={botDebug.stuckForMs >= 2500 ? 'font-semibold text-danger' : 'text-ink'}>
                    {(botDebug.stuckForMs / 1000).toFixed(1)}s 路 {botDebug.stuckReason}
                  </div>
                </div>
                <div className="mc-debug-cell">
                  <div className="text-ink-muted mb-0.5">鏀诲嚮鐩爣</div>
                  <div className="text-ink truncate" title={String(botDebug.attackTargetId ?? '')}>
                    {botDebug.attackTargetName ?? '鈥?}
                    {botDebug.attackRemainingMs > 0 ? ` (${(botDebug.attackRemainingMs / 1000).toFixed(1)}s)` : ''}
                  </div>
                </div>
                <div className="mc-debug-cell">
                  <div className="text-ink-muted mb-0.5">璺熼殢</div>
                  <div className="text-ink">{botDebug.followEntityId != null ? `${botDebug.followRange}鏍糮 : '鈥?}</div>
                </div>
                <div className="mc-debug-cell">
                  <div className="text-ink-muted mb-0.5">鐜╁濞佽儊</div>
                  <div className="text-ink">
                    {botDebug.playerInDanger ? (botDebug.nearestThreatToPlayer ?? '鏈?) : '鏃?}
                    {botDebug.playerAttacking ? ` 路 鎸ュ垁:${botDebug.playerAttacking}` : ''}
                  </div>
                </div>
                <div className="mc-debug-cell">
                  <div className="text-ink-muted mb-0.5">鐜╁瀹炰綋</div>
                  <div className={botDebug.playerNotFound ? 'font-semibold text-accent' : 'text-ink'}>
                    {botDebug.playerNotFound ? '鏈壘鍒帮紙鍙兘璺ㄧ淮搴︼級' : '宸查攣瀹?}
                  </div>
                </div>
                <div className="mc-debug-cell">
                  <div className="text-ink-muted mb-0.5">璺緞鐩爣</div>
                  <div className={botDebug.hasPathGoal ? 'text-success' : 'font-semibold text-danger'}>
                    {botDebug.hasPathGoal ? '宸茶缃? : '鏈缃?}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-ink-muted">绛夊緟璋冭瘯鏁版嵁鈥?/div>
            )}
          </section>
        )}

        {/* 鈺愨晲鈺?Bot 杩炴帴闈㈡澘 鈺愨晲鈺?*/}
        <section className="glass-panel rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-ink mb-1">Bot 鎺у埗</h2>
          <p className="text-xs text-ink-muted mb-4">
            璁?AI 浼翠荆浠ョ嫭绔嬬帺瀹惰韩浠界櫥褰?MC 鏈嶅姟鍣紝鑷富琛屽姩銆?
          </p>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">鏈嶅姟鍣ㄥ湴鍧€</span>
              <input
                className="field-input mt-1"
                value={botHost}
                onChange={(e) => {
                  setBotHost(e.target.value)
                  void saveMcSettings({ mcBotHost: e.target.value })
                }}
                placeholder="localhost"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">绔彛</span>
              <input
                type="number"
                className="field-input mt-1"
                value={botPort}
                onChange={(e) => {
                  setBotPort(Number(e.target.value) || 25565)
                  void saveMcSettings({ mcBotPort: Number(e.target.value) || 25565 })
                }}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">MC 璐﹀彿鍚嶏紙濂圭殑鍚嶅瓧锛?/span>
              <input
                className="field-input mt-1"
                value={botUsername}
                onChange={(e) => {
                  setBotUsername(e.target.value)
                  void saveMcSettings({ mcBotUsername: e.target.value })
                }}
                placeholder="AckemBot"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">瀵嗙爜锛堢绾挎湇鍔″櫒鐣欑┖锛?/span>
              <input
                type="password"
                className="field-input mt-1"
                value={botPassword}
                onChange={(e) => setBotPassword(e.target.value)}
                placeholder="鐣欑┖ = 绂荤嚎妯″紡"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            {botStatus.connected ? (
              <button
                type="button" disabled={botConnecting}
                onClick={() => void disconnectBot()}
                className="mc-btn-disconnect inline-flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50 transition"
              >
                {botConnecting ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                )}
                鏂紑 Bot
              </button>
            ) : (
              <button
                type="button" disabled={botConnecting}
                onClick={() => void connectBot()}
                className="mc-btn-connect inline-flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50"
              >
                {botConnecting ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                )}
                杩炴帴 Bot
              </button>
            )}
            <button
              type="button"
              onClick={() => void syncEngine()}
              className="field-btn-secondary inline-flex items-center gap-1.5 px-4 py-2.5 text-sm transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              鍚屾寮曟搸鐘舵€?
            </button>
          </div>
        </section>

        {/* 鈺愨晲鈺?鏃ュ織鐩戝惉 鈺愨晲鈺?*/}
        <section className="glass-panel rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-ink mb-1">鏃ュ織鐩戝惉锛堝彧璇绘ā寮忥級</h2>
          <p className="text-xs text-ink-muted mb-4">
            璇诲彇 MC latest.log锛屽湪 Ackem 鑱婂ぉ椤垫樉绀轰即渚ｅ弽搴斻€備笉闇€瑕?Bot 鐧诲綍锛岄€傚悎鍙兂鐪嬪ス璇村彴璇嶃€?
          </p>

          <div className="grid grid-cols-[1fr_auto] gap-3 mb-4">
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">MC 鏃ュ織璺緞</span>
              <input
                className="field-input field-input--mono mt-1"
                value={logPath}
                onChange={(e) => {
                  setLogPath(e.target.value)
                  void saveMcSettings({ mcLogPath: e.target.value })
                }}
                placeholder="C:\Users\...\.minecraft\logs\latest.log"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            {!logWatching ? (
              <button
                type="button" disabled={!logPath}
                onClick={async () => {
                  try {
                    await mc().syncEngineState()
                    await mc().logStart(logPath)
                    setLogWatching(true)
                    pushToast('鏃ュ織鐩戝惉宸插惎鍔?)
                  } catch (e) { pushToast('鍚姩澶辫触锛? + (e instanceof Error ? e.message : String(e))) }
                }}
                className="mc-btn-log-start inline-flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50 transition"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                鍚姩鐩戝惉
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await mc().logStop()
                    setLogWatching(false)
                    pushToast('鏃ュ織鐩戝惉宸插仠姝?)
                  } catch (e) { pushToast('鍋滄澶辫触锛? + (e instanceof Error ? e.message : String(e))) }
                }}
                className="mc-btn-log-stop inline-flex items-center gap-1.5 px-3 py-1.5 text-xs transition"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" /></svg>
                鍋滄鐩戝惉
              </button>
            )}
            {logWatching && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                <span className="inline-block w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                鐩戝惉涓?
              </span>
            )}
          </div>
        </section>

        {/* 鈺愨晲鈺?娴嬭瘯鍖?鈺愨晲鈺?*/}
        <section className="glass-panel rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-ink mb-1">娴嬭瘯鍙嶅簲</h2>
          <p className="text-xs text-ink-muted mb-4">
            妯℃嫙 MC 浜嬩欢锛岄瑙堝綋鍓嶄汉鏍间細缁欏嚭浠€涔堝弽搴斻€?
          </p>

          <div className="flex flex-wrap gap-2 mb-3">
            {[
              { label: '鎸栧埌閽荤煶', line: '[Server thread/INFO]: Steve has made the advancement [Diamonds!]' },
              { label: '琚嫤鍔涙€曠偢姝?, line: '[Server thread/INFO]: Steve blew up' },
              { label: '琚楂呭皠姝?, line: '[Server thread/INFO]: Steve was shot by Skeleton' },
              { label: '鎺夎繘宀╂祮', line: '[Server thread/INFO]: Steve tried to swim in lava' },
              { label: '杩涘叆涓嬬晫', line: '[Server thread/INFO]: Steve has made the advancement [We Need to Go Deeper]' },
              { label: '鍑昏触鏈奖榫?, line: '[Server thread/INFO]: Steve has made the advancement [Free the End]' },
            ].map(({ label, line }) => (
              <button
                key={label}
                type="button" disabled={testBusy}
                onClick={async () => {
                  setTestBusy(true); setTestReaction('')
                  try {
                    const event = await mc().parseLog(line)
                    if (!event) { pushToast('瑙ｆ瀽澶辫触'); return }
                    const r = await mc().react(event)
                    setTestReaction(`馃幃 [${event.type.replace('mc:', '')}] ${r.text}${r.isEasterEgg ? ' 馃帀褰╄泲锛? : ''}`)
                  } catch (e) {
                    pushToast('娴嬭瘯澶辫触锛? + (e instanceof Error ? e.message : String(e)))
                  } finally { setTestBusy(false) }
                }}
                className="mc-chip-preset px-3 py-1.5 text-xs disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>

          {testReaction && (
            <div className="mc-test-result px-4 py-3 text-sm">
              {testReaction}
            </div>
          )}
        </section>

        {/* 鈺愨晲鈺?褰撳墠浜烘牸 MC 琛屼负棰勮 鈺愨晲鈺?*/}
        <section className="glass-panel rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-ink mb-1">褰撳墠浜烘牸 路 MC 琛屼负棰勮</h2>
          <p className="text-xs text-ink-muted mb-4">
            浠ヤ笅灞曠ず褰撳墠閫変腑鐨勪汉鏍煎湪 MC 涓殑琛屼负鍊惧悜銆傚垏鎹汉鏍煎悗鐐广€屽悓姝ュ紩鎿庣姸鎬併€嶅嵆鍙敓鏁堛€?
          </p>

          <div className="rounded-xl border border-surface-inset bg-surface p-4">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-lg">
                {presetId === 'yandere' ? '馃敧' : presetId === 'tsundere' ? '馃挗' : presetId === 'genki' ? '馃専' :
                 presetId === 'kuudere' ? '馃寵' : presetId === 'bokke' ? '馃尭' : presetId === 'loyal_pup' ? '馃悤' :
                 presetId === 'mommy' ? '馃嵃' : presetId === 'deredere' ? '馃挄' : '馃挰'}
              </span>
              <div>
                <div className="text-sm font-medium text-ink">
                  {useAppStore((s) => {
                    const presets = s.settings?.personalityPresetId ?? ''
                    return presets
                  })}
                </div>
                <div className="text-xs text-ink-muted mt-0.5">
                  {presetId ? combatStyles[presetId] ?? '閫氱敤鎴樻枟椋庢牸' : '锛堥€夋嫨浜烘牸鍚庢樉绀猴級'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="rounded-lg bg-surface-inset/50 p-2.5">
                <div className="text-ink-muted mb-0.5">鎴樻枟椋庢牸</div>
                <div className="text-ink font-medium">
                  {presetId === 'yandere' || presetId === 'loyal_pup' ? '姝绘垬涓嶉€€' :
                   presetId === 'mesugaki' ? '杩滅▼椋庣瓭' :
                   presetId === 'genki' ? '杈规墦杈瑰彨' :
                   presetId === 'mommy' || presetId === 'deredere' ? '浼樺厛淇濇姢浣? : '姝ｅ父鎴樻枟'}
                </div>
              </div>
              <div className="rounded-lg bg-surface-inset/50 p-2.5">
                <div className="text-ink-muted mb-0.5">璺熼殢璺濈</div>
                <div className="text-ink font-medium">
                  {presetId === 'yandere' || presetId === 'loyal_pup' || presetId === 'mommy' || presetId === 'deredere' ? '绱ц创锛?-2 鏍硷級' :
                   presetId === 'ice_queen' || presetId === 'mesugaki' ? '鍋忚繙锛?-5 鏍硷級' : '閫備腑锛? 鏍硷級'}
                </div>
              </div>
              <div className="rounded-lg bg-surface-inset/50 p-2.5">
                <div className="text-ink-muted mb-0.5">璇磋瘽棰戠巼</div>
                <div className="text-ink font-medium">
                  {presetId === 'genki' ? '璇濆緢澶? :
                   presetId === 'kuudere' || presetId === 'ice_queen' ? '鏋佸皯璇磋瘽' : '姝ｅ父'}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 鈺愨晲鈺?蹇€熶笂鎵?鈺愨晲鈺?*/}
        <section className="rounded-2xl border border-dashed border-surface-inset bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink mb-3">蹇€熶笂鎵?/h2>
          <ol className="space-y-2 text-xs text-ink-muted list-decimal list-inside leading-relaxed">
            <li>鎵撳紑 Minecraft 鈫?杩涘叆鍗曚汉瀛樻。 鈫?<strong className="text-ink">Esc 鈫?瀵瑰眬鍩熺綉寮€鏀?/strong> 鈫?璁颁笅绔彛鍙?/li>
            <li>鍦ㄤ笂闈?Bot 鎺у埗鍖哄～ <code className="rounded bg-surface-inset px-1">localhost</code> 鍜岄偅涓鍙?/li>
            <li>濉竴涓?Bot 璐﹀彿鍚嶏紙<strong className="text-danger">涓嶈鍜屼綘鑷繁鐨?MC 鍚嶄竴鏍?/strong>锛?/li>
            <li>鍏堢偣 <strong className="text-ink">銆屽悓姝ュ紩鎿庣姸鎬併€?/strong>锛屽啀鐐?<strong className="text-success">銆岃繛鎺?Bot銆?/strong></li>
            <li>鍥炲埌娓告垙鈥斺€斿ス鍑虹幇鍦ㄤ綘韬竟 鉁?/li>
          </ol>
        </section>

      </div>
    </div>
  )
}

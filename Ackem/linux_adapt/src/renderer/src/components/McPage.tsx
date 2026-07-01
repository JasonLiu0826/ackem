import { useEffect, useState, useCallback } from 'react'
import { t } from '../lib/i18n'
import { useAppStore } from '../store/appStore'
import type { McBotDebugSnapshot } from '../ackem'

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

/* ══════════════════════════════════════════════════════════════
   MC 陪伴独立控制台
   ══════════════════════════════════════════════════════════════ */
const mc = () => window.ackem.ext.gamemode.minecraft

export function McPage(props: { onBack?: () => void }): JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const setSettings = useAppStore((s) => s.setSettings)
  const pushToast = useAppStore((s) => s.pushToast)

  // ── Bot 连接（从持久化设置恢复）──
  const [botHost, setBotHost] = useState(settings?.mcBotHost || 'localhost')
  const [botPort, setBotPort] = useState(settings?.mcBotPort || 25565)
  const [botUsername, setBotUsername] = useState(settings?.mcBotUsername || 'AckemBot')
  const [botPassword, setBotPassword] = useState('')
  const [botConnecting, setBotConnecting] = useState(false)
  const [botStatus, setBotStatus] = useState<BotStatus>({ connected: false })

  // ── 日志监听（从持久化设置恢复）──
  const [logPath, setLogPath] = useState(settings?.mcLogPath || '')
  const [wsPort, setWsPort] = useState(19532)
  const [wsStatus, setWsStatus] = useState<McStatus>({ running: false, wsPort: 19532, wsClients: 0 })
  const [logWatching, setLogWatching] = useState(false)

  // ── 测试 ──
  const [testReaction, setTestReaction] = useState('')
  const [testBusy, setTestBusy] = useState(false)

  // ── 实机调试 ──
  const [botDebug, setBotDebug] = useState<McBotDebugSnapshot | null>(null)

  // 持久化 MC 设置
  const saveMcSettings = useCallback(async (patch: Record<string, unknown>) => {
    try {
      const next = await window.ackem.setSettings(patch as Partial<import('../ackem').AppSettings>)
      if (setSettings) setSettings(next)
    } catch { /* ignore */ }
  }, [setSettings])

  // 定期刷新 Bot 状态
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const s = await mc().botStatus() as BotStatus
        setBotStatus(s)
      } catch { /* ignore */ }
    }, 3000)
    return () => clearInterval(t)
  }, [])

  // 刷新 WS 状态
  const refreshWsStatus = useCallback(async () => {
    try {
      const s = await mc().getWsStatus() as McStatus
      setWsStatus(s)
    } catch { /* ignore */ }
  }, [])
  useEffect(() => { void refreshWsStatus() }, [refreshWsStatus])

  // 实机调试：推送 + 轮询兜底
  useEffect(() => {
    window.ackem.onMcBotDebug((snap) => setBotDebug(snap))
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
    IDLE: '空闲',
    FOLLOWING: '跟随',
    COMBAT: '战斗',
    RESCUE: '救援',
    STUCK: '卡住',
    NAVIGATING: '导航',
    PORTAL: '传送门',
  }

  // ── 操作函数 ──
  const syncEngine = async () => {
    try {
      await mc().syncEngineState()
      pushToast('引擎状态已同步到 MC')
    } catch (e) { pushToast('同步失败：' + (e instanceof Error ? e.message : String(e))) }
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
      pushToast(`✅ ${botUsername} 已加入游戏`)
    } catch (e) {
      pushToast('连接失败：' + (e instanceof Error ? e.message : String(e)))
    } finally { setBotConnecting(false) }
  }

  const disconnectBot = async () => {
    setBotConnecting(true)
    try {
      await mc().botStop()
      setBotStatus({ connected: false })
      pushToast('Bot 已断开')
    } catch (e) {
      pushToast('断开失败：' + (e instanceof Error ? e.message : String(e)))
    } finally { setBotConnecting(false) }
  }

  const testMcReaction = async () => {
    setTestBusy(true)
    setTestReaction('')
    try {
      // 先用日志解析测试事件
      const line = '[Server thread/INFO]: JasonLiu has made the advancement [Diamonds!]'
      const event = await mc().parseLog(line)
      if (!event) { pushToast('日志解析失败'); return }
      const r = await mc().react(event)
      setTestReaction(`[${event.type.replace('mc:', '')}] ${r.text}`)
      if (r.isEasterEgg) pushToast('🎉 触发了彩蛋！')
    } catch (e) {
      pushToast('测试失败：' + (e instanceof Error ? e.message : String(e)))
    } finally { setTestBusy(false) }
  }

  // ── 人格战斗风格速查 ──
  const presetId = useAppStore((s) => s.settings?.personalityPresetId)
  const combatStyles: Record<string, string> = {
    deredere:   '温柔 · 先保你再管自己 · 血量低会撤退',
    tsundere:   '傲娇 · 冲前面不承认 · 嘴硬"没在帮你"',
    yandere:    '病娇 · 追到底死也不退 · 谁敢碰你谁死',
    kuudere:    '三无 · 沉默高效 · 每刀精准',
    genki:      '元气 · 边打边叫"呀！""哈！"',
    shitakiri:  '毒舌 · 用斧头 · "用斧是看得起你"',
    mesugaki:   '雌小鬼 · 远程放冷箭 · 近身就跑',
    gap_moe:    '反差 · 慢悠悠→瞬间切钻石剑"滚开！！！"',
    ice_queen:  '冷艳 · 冷静高效 · 不废话',
    bokke:      '天然呆 · 反应慢 · 偶尔打空"诶？"',
    loyal_pup:  '忠犬 · 死也不退 · 永远在你前面',
    mommy:      '妈妈 · 时刻准备加血 · "你又没吃东西对吧"',
  }

  return (
    <div className="mc-settings-page h-full overflow-y-auto bg-surface">
      {/* ═══ 页头 ═══ */}
      <header className="glass-panel border-b border-surface-inset/60 px-6 py-4">
        {props.onBack && (
          <button
            type="button"
            onClick={props.onBack}
            className="mb-2 text-xs text-ink-muted hover:text-ink transition"
          >
            ← 返回游戏列表
          </button>
        )}
        <h1 className="text-base font-semibold text-ink">Minecraft 陪伴</h1>
        <p className="mt-0.5 text-xs text-ink-muted">
          AI 伴侣以独立玩家身份进入 Minecraft，与你一起挖矿、打怪、盖房子。
        </p>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-6 space-y-6">

        {/* ═══ 状态总览 ═══ */}
        <section className="glass-panel rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-ink mb-4">状态总览</h2>
          <div className="grid grid-cols-2 gap-4">
            {/* Bot 状态 */}
            <div className="rounded-xl border border-surface-inset bg-surface p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${botStatus.connected ? 'bg-green-500 animate-pulse' : 'bg-surface-inset'}`} />
                <span className="text-sm font-medium text-ink">Bot 连接</span>
              </div>
              {botStatus.connected ? (
                <div className="space-y-1 text-xs text-ink-muted">
                  <div>账号：<span className="text-ink font-medium">{botStatus.username}</span></div>
                  <div>血量：<span className="text-ink">{botStatus.health ?? '?'}</span> / 20</div>
                  <div>维度：<span className="text-ink">{botStatus.dimension ?? '?'}</span></div>
                  <div>坐标：<span className="font-mono text-ink">
                    ({botStatus.position?.x?.toFixed(0) ?? '?'}, {botStatus.position?.y?.toFixed(0) ?? '?'}, {botStatus.position?.z?.toFixed(0) ?? '?'})
                  </span></div>
                  <div>Ackem WS：{botStatus.wsConnected ? '已连接' : '未连接'}</div>
                </div>
              ) : (
                <div className="text-xs text-ink-muted">未连接</div>
              )}
            </div>

            {/* WS + 日志状态 */}
            <div className="rounded-xl border border-surface-inset bg-surface p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${wsStatus.running ? 'bg-blue-500' : 'bg-surface-inset'}`} />
                <span className="text-sm font-medium text-ink">WebSocket 服务</span>
              </div>
              <div className="space-y-1 text-xs text-ink-muted">
                <div>端口：<span className="font-mono text-ink">ws://localhost:{wsStatus.wsPort}</span></div>
                <div>连接数：<span className="text-ink">{wsStatus.wsClients}</span></div>
              </div>
              <button
                onClick={() => void refreshWsStatus()}
                className="field-btn-secondary mt-3 px-2.5 py-1 text-[11px] text-ink-muted"
              >
                刷新
              </button>
            </div>
          </div>
        </section>

        {/* ═══ 实机调试面板 ═══ */}
        {botStatus.connected && (
          <section className="mc-debug-section rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-ink mb-1">实机调试</h2>
            <p className="text-xs text-ink-muted mb-4">
              实时查看 Bot 决策、路径与战斗目标，便于排查站桩、不打怪等问题。
            </p>
            {botDebug ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
                <div className="mc-debug-cell">
                  <div className="text-ink-muted mb-0.5">运行状态</div>
                  <div className="text-ink font-semibold">{opStateLabel[botDebug.opState] ?? botDebug.opState}</div>
                </div>
                <div className="mc-debug-cell">
                  <div className="text-ink-muted mb-0.5">决策</div>
                  <div className="text-ink">{botDebug.decisionType ?? '—'} ({botDebug.decisionPriority ?? '—'})</div>
                </div>
                <div className="mc-debug-cell col-span-2 sm:col-span-1">
                  <div className="text-ink-muted mb-0.5">动作</div>
                  <div className="text-ink truncate" title={botDebug.actionSummary}>{botDebug.actionSummary || '—'}</div>
                </div>
                <div className="mc-debug-cell">
                  <div className="text-ink-muted mb-0.5">路径</div>
                  <div className="text-ink">{botDebug.pathStatus}</div>
                </div>
                <div className="mc-debug-cell">
                  <div className="text-ink-muted mb-0.5">距玩家</div>
                  <div className="text-ink">{botDebug.distToPlayer} 格</div>
                </div>
                <div className="mc-debug-cell">
                  <div className="text-ink-muted mb-0.5">卡住</div>
                  <div className={botDebug.stuckForMs >= 2500 ? 'font-semibold text-danger' : 'text-ink'}>
                    {(botDebug.stuckForMs / 1000).toFixed(1)}s · {botDebug.stuckReason}
                  </div>
                </div>
                <div className="mc-debug-cell">
                  <div className="text-ink-muted mb-0.5">攻击目标</div>
                  <div className="text-ink truncate" title={String(botDebug.attackTargetId ?? '')}>
                    {botDebug.attackTargetName ?? '—'}
                    {botDebug.attackRemainingMs > 0 ? ` (${(botDebug.attackRemainingMs / 1000).toFixed(1)}s)` : ''}
                  </div>
                </div>
                <div className="mc-debug-cell">
                  <div className="text-ink-muted mb-0.5">跟随</div>
                  <div className="text-ink">{botDebug.followEntityId != null ? `${botDebug.followRange}格` : '—'}</div>
                </div>
                <div className="mc-debug-cell">
                  <div className="text-ink-muted mb-0.5">玩家威胁</div>
                  <div className="text-ink">
                    {botDebug.playerInDanger ? (botDebug.nearestThreatToPlayer ?? '有') : '无'}
                    {botDebug.playerAttacking ? ` · 挥刀:${botDebug.playerAttacking}` : ''}
                  </div>
                </div>
                <div className="mc-debug-cell">
                  <div className="text-ink-muted mb-0.5">玩家实体</div>
                  <div className={botDebug.playerNotFound ? 'font-semibold text-accent' : 'text-ink'}>
                    {botDebug.playerNotFound ? '未找到（可能跨维度）' : '已锁定'}
                  </div>
                </div>
                <div className="mc-debug-cell">
                  <div className="text-ink-muted mb-0.5">路径目标</div>
                  <div className={botDebug.hasPathGoal ? 'text-success' : 'font-semibold text-danger'}>
                    {botDebug.hasPathGoal ? '已设置' : '未设置'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-ink-muted">等待调试数据…</div>
            )}
          </section>
        )}

        {/* ═══ Bot 连接面板 ═══ */}
        <section className="glass-panel rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-ink mb-1">Bot 控制</h2>
          <p className="text-xs text-ink-muted mb-4">
            让 AI 伴侣以独立玩家身份登录 MC 服务器，自主行动。
          </p>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">服务器地址</span>
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
              <span className="text-xs font-medium text-ink-muted">端口</span>
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
              <span className="text-xs font-medium text-ink-muted">MC 账号名（她的名字）</span>
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
              <span className="text-xs font-medium text-ink-muted">密码（离线服务器留空）</span>
              <input
                type="password"
                className="field-input mt-1"
                value={botPassword}
                onChange={(e) => setBotPassword(e.target.value)}
                placeholder="留空 = 离线模式"
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
                断开 Bot
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
                连接 Bot
              </button>
            )}
            <button
              type="button"
              onClick={() => void syncEngine()}
              className="field-btn-secondary inline-flex items-center gap-1.5 px-4 py-2.5 text-sm transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              同步引擎状态
            </button>
          </div>
        </section>

        {/* ═══ 日志监听 ═══ */}
        <section className="glass-panel rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-ink mb-1">日志监听（只读模式）</h2>
          <p className="text-xs text-ink-muted mb-4">
            读取 MC latest.log，在 Ackem 聊天页显示伴侣反应。不需要 Bot 登录，适合只想看她说台词。
          </p>

          <div className="grid grid-cols-[1fr_auto] gap-3 mb-4">
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">MC 日志路径</span>
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
                    pushToast('日志监听已启动')
                  } catch (e) { pushToast('启动失败：' + (e instanceof Error ? e.message : String(e))) }
                }}
                className="mc-btn-log-start inline-flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50 transition"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                启动监听
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await mc().logStop()
                    setLogWatching(false)
                    pushToast('日志监听已停止')
                  } catch (e) { pushToast('停止失败：' + (e instanceof Error ? e.message : String(e))) }
                }}
                className="mc-btn-log-stop inline-flex items-center gap-1.5 px-3 py-1.5 text-xs transition"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" /></svg>
                停止监听
              </button>
            )}
            {logWatching && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                <span className="inline-block w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                监听中
              </span>
            )}
          </div>
        </section>

        {/* ═══ 测试区 ═══ */}
        <section className="glass-panel rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-ink mb-1">测试反应</h2>
          <p className="text-xs text-ink-muted mb-4">
            模拟 MC 事件，预览当前人格会给出什么反应。
          </p>

          <div className="flex flex-wrap gap-2 mb-3">
            {[
              { label: '挖到钻石', line: '[Server thread/INFO]: Steve has made the advancement [Diamonds!]' },
              { label: '被苦力怕炸死', line: '[Server thread/INFO]: Steve blew up' },
              { label: '被骷髅射死', line: '[Server thread/INFO]: Steve was shot by Skeleton' },
              { label: '掉进岩浆', line: '[Server thread/INFO]: Steve tried to swim in lava' },
              { label: '进入下界', line: '[Server thread/INFO]: Steve has made the advancement [We Need to Go Deeper]' },
              { label: '击败末影龙', line: '[Server thread/INFO]: Steve has made the advancement [Free the End]' },
            ].map(({ label, line }) => (
              <button
                key={label}
                type="button" disabled={testBusy}
                onClick={async () => {
                  setTestBusy(true); setTestReaction('')
                  try {
                    const event = await mc().parseLog(line)
                    if (!event) { pushToast('解析失败'); return }
                    const r = await mc().react(event)
                    setTestReaction(`🎮 [${event.type.replace('mc:', '')}] ${r.text}${r.isEasterEgg ? ' 🎉彩蛋！' : ''}`)
                  } catch (e) {
                    pushToast('测试失败：' + (e instanceof Error ? e.message : String(e)))
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

        {/* ═══ 当前人格 MC 行为预览 ═══ */}
        <section className="glass-panel rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-ink mb-1">当前人格 · MC 行为预览</h2>
          <p className="text-xs text-ink-muted mb-4">
            以下展示当前选中的人格在 MC 中的行为倾向。切换人格后点「同步引擎状态」即可生效。
          </p>

          <div className="rounded-xl border border-surface-inset bg-surface p-4">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-lg">
                {presetId === 'yandere' ? '🔪' : presetId === 'tsundere' ? '💢' : presetId === 'genki' ? '🌟' :
                 presetId === 'kuudere' ? '🌙' : presetId === 'bokke' ? '🌸' : presetId === 'loyal_pup' ? '🐕' :
                 presetId === 'mommy' ? '🍰' : presetId === 'deredere' ? '💕' : '💬'}
              </span>
              <div>
                <div className="text-sm font-medium text-ink">
                  {useAppStore((s) => {
                    const presets = s.settings?.personalityPresetId ?? ''
                    return presets
                  })}
                </div>
                <div className="text-xs text-ink-muted mt-0.5">
                  {presetId ? combatStyles[presetId] ?? '通用战斗风格' : '（选择人格后显示）'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="rounded-lg bg-surface-inset/50 p-2.5">
                <div className="text-ink-muted mb-0.5">战斗风格</div>
                <div className="text-ink font-medium">
                  {presetId === 'yandere' || presetId === 'loyal_pup' ? '死战不退' :
                   presetId === 'mesugaki' ? '远程风筝' :
                   presetId === 'genki' ? '边打边叫' :
                   presetId === 'mommy' || presetId === 'deredere' ? '优先保护你' : '正常战斗'}
                </div>
              </div>
              <div className="rounded-lg bg-surface-inset/50 p-2.5">
                <div className="text-ink-muted mb-0.5">跟随距离</div>
                <div className="text-ink font-medium">
                  {presetId === 'yandere' || presetId === 'loyal_pup' || presetId === 'mommy' || presetId === 'deredere' ? '紧贴（1-2 格）' :
                   presetId === 'ice_queen' || presetId === 'mesugaki' ? '偏远（4-5 格）' : '适中（3 格）'}
                </div>
              </div>
              <div className="rounded-lg bg-surface-inset/50 p-2.5">
                <div className="text-ink-muted mb-0.5">说话频率</div>
                <div className="text-ink font-medium">
                  {presetId === 'genki' ? '话很多' :
                   presetId === 'kuudere' || presetId === 'ice_queen' ? '极少说话' : '正常'}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ 快速上手 ═══ */}
        <section className="rounded-2xl border border-dashed border-surface-inset bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink mb-3">快速上手</h2>
          <ol className="space-y-2 text-xs text-ink-muted list-decimal list-inside leading-relaxed">
            <li>打开 Minecraft → 进入单人存档 → <strong className="text-ink">Esc → 对局域网开放</strong> → 记下端口号</li>
            <li>在上面 Bot 控制区填 <code className="rounded bg-surface-inset px-1">localhost</code> 和那个端口</li>
            <li>填一个 Bot 账号名（<strong className="text-danger">不要和你自己的 MC 名一样</strong>）</li>
            <li>先点 <strong className="text-ink">「同步引擎状态」</strong>，再点 <strong className="text-success">「连接 Bot」</strong></li>
            <li>回到游戏——她出现在你身边 ✨</li>
          </ol>
        </section>

      </div>
    </div>
  )
}

import { useEffect, useState, useCallback } from 'react'
import { t } from '../lib/i18n'

type TraceEntry = {
  turn: number
  l0: { type: string; intensity: number; sincerity?: number }
  l1: { trust: number; rifts: number; stage: string; atmosphere: string }
  l2: { aff: number; sec: number; aro: number; dom: number; label: string }
  l3: { silent: boolean; tierBChars: number }
  l4: { wrote: boolean }
  l5?: { toolCalls: string[] }
  ms: { total: number }
}

const STAGE_ZH: Record<string, string> = {
  STRANGER: '鍒濊瘑', FAMILIAR: '鐔熸倝', INTIMATE: '浜插瘑'
}

const LABEL_ZH: Record<string, string> = {
  SWEET_ATTACHMENT: '鐢滆湝', SHY_HEARTBEAT: '瀹崇緸', TSUNDERE: '鍌插▏',
  HURT_GRIEVANCE: '濮斿眻', ANGRY_ATTACK: '鎰ゆ€?, COLD_DETACHED: '鍐锋贰',
  FEARFUL_OBEDIENT: '涓嶅畨', QUIET_FOND: '瀹夐潤鍠滄', CALM_RATIONAL: '骞抽潤'
}

function MiniBar({ val, max, color }: { val: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, ((val + max) / (2 * max)) * 100))
  return (
    <div className="h-1.5 w-full rounded-full bg-surface-inset overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  )
}

export function TracePanel(): JSX.Element {
  const [traces, setTraces] = useState<TraceEntry[]>([])
  const [limit, setLimit] = useState(20)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const raw = await window.Ackem.traceLatest(limit) as TraceEntry[]
      setTraces(raw)
    } catch (e) {
      console.error('trace:latest error', e)
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => { void refresh() }, [refresh])

  const toggleExpand = (turn: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(turn)) next.delete(turn)
      else next.add(turn)
      return next
    })
  }

  const trustColor = (v: number) => v > 60 ? '#22c55e' : v > 40 ? '#eab308' : '#ef4444'
  const affColor = (v: number) => v > 20 ? '#22c55e' : v < -20 ? '#ef4444' : '#888'

  return (
    <div className="h-full overflow-y-auto bg-surface">
      <header className="border-b border-surface-inset bg-surface-raised px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-ink">寮曟搸 Trace</h1>
          <p className="mt-0.5 text-xs text-ink-muted">姣忚疆 L0鈫扡4 鐘舵€佸揩鐓э紙鍐呭瓨 ring buffer锛屾渶澶?100 鏉★級</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="field-input rounded-lg px-2 py-1 text-xs"
          >
            <option value={10}>鏈€杩?10 杞?/option>
            <option value={20}>鏈€杩?20 杞?/option>
            <option value={50}>鏈€杩?50 杞?/option>
            <option value={100}>鍏ㄩ儴</option>
          </select>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="field-btn-secondary px-3 py-1 text-xs disabled:opacity-50"
          >
            {loading ? '鍒锋柊涓€? : '鍒锋柊'}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-4 space-y-2">
        {traces.length === 0 && !loading && (
          <div className="text-center text-xs text-ink-muted py-12">鏆傛棤 trace 鏁版嵁銆傚紑濮嬪璇濆悗鑷姩鐢熸垚銆?/div>
        )}

        {traces.map((t) => (
          <div
            key={t.turn}
            className="rounded-xl border border-surface-inset bg-surface-raised shadow-sm overflow-hidden"
          >
            {/* Summary row 鈥?always visible */}
            <button
              type="button"
              onClick={() => toggleExpand(t.turn)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface/50 transition"
            >
              <span className="text-xs font-mono text-ink-muted w-10 shrink-0">#{t.turn}</span>
              <span className="text-xs w-20 shrink-0 text-ink">{t.l0.type}</span>
              <span className="text-[10px] text-ink-muted w-10 shrink-0">
                i={t.l0.intensity.toFixed(1)}
              </span>
              <span className="text-xs font-medium w-10 shrink-0" style={{ color: trustColor(t.l1.trust) }}>
                T{t.l1.trust.toFixed(0)}
              </span>
              <span className="text-xs w-10 shrink-0" style={{ color: affColor(t.l2.aff) }}>
                {t.l2.aff > 0 ? '+' : ''}{t.l2.aff.toFixed(0)}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface text-ink-muted shrink-0">
                {LABEL_ZH[t.l2.label] ?? t.l2.label}
              </span>
              {t.l3.silent && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">
                  娌夐粯
                </span>
              )}
              <span className="text-[10px] text-ink-muted ml-auto shrink-0">
                {t.ms.total}ms
              </span>
            </button>

            {/* Expanded detail */}
            {expanded.has(t.turn) && (
              <div className="px-4 pb-3 pt-1 border-t border-surface-inset space-y-2 text-xs">
                {/* L0 */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-ink-muted">L0 浜嬩欢</span>
                    <div className="text-ink font-medium">{t.l0.type}</div>
                  </div>
                  <div>
                    <span className="text-ink-muted">寮哄害</span>
                    <div className="text-ink">{t.l0.intensity.toFixed(2)}</div>
                  </div>
                  <div>
                    <span className="text-ink-muted">鐪熻瘹搴?/span>
                    <div className="text-ink">{t.l0.sincerity?.toFixed(2) ?? '-'}</div>
                  </div>
                </div>

                {/* L1 */}
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <span className="text-ink-muted">淇′换</span>
                    <div className="text-ink font-medium">{t.l1.trust.toFixed(1)}</div>
                  </div>
                  <div>
                    <span className="text-ink-muted">瑁傜棔</span>
                    <div className="text-ink">{t.l1.rifts}</div>
                  </div>
                  <div>
                    <span className="text-ink-muted">闃舵</span>
                    <div className="text-ink">{STAGE_ZH[t.l1.stage] ?? t.l1.stage}</div>
                  </div>
                  <div>
                    <span className="text-ink-muted">姘旀皼</span>
                    <div className="text-ink">{t.l1.atmosphere}</div>
                  </div>
                </div>

                {/* L2 */}
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <span className="text-ink-muted">浜插瘑 aff</span>
                    <div className="text-ink font-medium" style={{ color: affColor(t.l2.aff) }}>{t.l2.aff}</div>
                    <MiniBar val={t.l2.aff} max={100} color="#6366f1" />
                  </div>
                  <div>
                    <span className="text-ink-muted">瀹夊叏 sec</span>
                    <div className="text-ink">{t.l2.sec}</div>
                    <MiniBar val={t.l2.sec} max={100} color="#22c55e" />
                  </div>
                  <div>
                    <span className="text-ink-muted">鍞ら啋 aro</span>
                    <div className="text-ink">{t.l2.aro}</div>
                    <MiniBar val={t.l2.aro} max={100} color="#f59e0b" />
                  </div>
                  <div>
                    <span className="text-ink-muted">鏀厤 dom</span>
                    <div className="text-ink">{t.l2.dom}</div>
                    <MiniBar val={t.l2.dom} max={100} color="#ec4899" />
                  </div>
                </div>

                {/* L3 */}
                <div className="flex gap-4 text-ink-muted">
                  <span>L3: {t.l3.silent ? '娌夐粯鍊欓€? : '鍙戣█'} | Tier B {t.l3.tierBChars} 瀛楃</span>
                  <span>L4: {t.l4.wrote ? '宸插啓鍏ヨ蹇? : '鏈啓鍏?}</span>
                  {t.l5?.toolCalls?.length ? (
                    <span>L5: {t.l5.toolCalls.join(', ')}</span>
                  ) : (
                    <span>L5: 鈥?/span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

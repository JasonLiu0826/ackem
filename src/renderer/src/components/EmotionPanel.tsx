import { useEffect, useState, useCallback } from 'react'
import { t } from '../lib/i18n'
import { useAppStore } from '../store/appStore'
import { useUiStore } from '../store/uiStore'
import { EMOTION_LABEL_ZH } from '../lib/emotionColors'
import { EmotionStarMap } from './EmotionStarMap'
import { LightCore } from './LightCore'
import type { UserSixDimensions } from '../Ackem'
import { formatDispatchTriggerLabel } from '../../../shared/dispatchTrigger'

type EngineState = {
  relationship: { stage: string; trust: number; rifts: number; atmosphere: string }
  emotion: { aff: number; sec: number; aro: number; dom: number; primaryLabel: string }
  counters: { totalTurns: number; sharedEventsCount: number }
  externalAtmosphere?: { level: number; label: string }
  personality: { presetId: string; T: number; I: number; S: number; O: number; R: number }
  userSixDimensions?: UserSixDimensions
  desireStack?: {
    slots: (null | {
      id: string
      topic: string
      category: string
      urgency: number
      status: string
    })[]
  }
  _reunion?: { gapHours?: number; active: boolean }
}

const DESIRE_DORMANT_URGENCY = 0.6

function TrustGlowBar({ trust, rifts, stage }: { trust: number; rifts: number; stage: string }) {
  const stageZh = stage === 'INTIMATE' ? '浜插瘑' : stage === 'FAMILIAR' ? '鐔熸倝' : '鍒濊瘑'
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-muted">淇′换</span>
        <span className="font-medium text-accent">{trust.toFixed(0)}</span>
      </div>
      <div className="trust-glow-bar">
        <span style={{ width: `${Math.min(100, Math.max(0, trust))}%` }} />
      </div>
      <div className="flex justify-between text-[11px] text-ink-muted">
        <span>闃舵 路 {stageZh}</span>
        <span>瑁傜棔 {rifts}</span>
      </div>
    </div>
  )
}

function DesireStackView({
  stack,
  onDismiss,
  onClearActive
}: {
  stack?: EngineState['desireStack']
  onDismiss: (desireId: string) => void | Promise<void>
  onClearActive: () => void | Promise<void>
}) {
  if (!stack?.slots) return null
  const activeDesires = stack.slots.filter((s) => s && s.status === 'active')
  if (activeDesires.length === 0) return null

  return (
    <details className="group">
      <summary className="cursor-pointer text-xs font-medium text-ink-muted hover:text-ink">
        娆叉湜鏍?({activeDesires.length})
      </summary>
      <div className="mt-2 space-y-2">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void onClearActive()}
            className="text-[10px] text-ink-muted underline hover:text-ink"
          >
            娓呯┖
          </button>
        </div>
        {activeDesires.map((s) => {
          const dormant = s!.urgency > 0 && s!.urgency < DESIRE_DORMANT_URGENCY
          const barPct = dormant ? 10 : Math.max(12, Math.min(100, (s!.urgency / 10) * 100))
          return (
            <div key={s!.id} className="flex items-center gap-2 text-xs">
              <span className="flex-1 truncate text-ink">{s!.topic}</span>
              <div className="trust-glow-bar w-16">
                <span style={{ width: `${barPct}%`, opacity: dormant ? 0.5 : 1 }} />
              </div>
              <button
                type="button"
                aria-label={`绉婚櫎锛?{s!.topic}`}
                onClick={() => void onDismiss(s!.id)}
                className="text-ink-muted hover:text-ink"
              >
                脳
              </button>
            </div>
          )
        })}
      </div>
    </details>
  )
}

export function EmotionPanel(): JSX.Element {
  const [state, setState] = useState<EngineState | null>(null)
  const [profileMode, setProfileMode] = useState<'manual' | 'inferred'>('manual')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const chatTurnCount = useAppStore((s) => s.chatTurnCount)
  const dispatchTrigger = useAppStore((s) => s.dispatchTriggerStatus)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, profile] = await Promise.all([
        window.Ackem.getState() as Promise<EngineState>,
        window.Ackem.profileGet()
      ])
      setState(s)
      setProfileMode(profile.mode)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, chatTurnCount])

  if (error) {
    return (
      <div className="p-4 text-xs text-danger">
        鑾峰彇鐘舵€佸け璐ワ細{error}
        <button type="button" onClick={() => void refresh()} className="ml-2 underline">
          閲嶈瘯
        </button>
      </div>
    )
  }

  const s = state
  const moodHint =
    s && s.emotion.aff > 20
      ? '濂瑰績鎯呭緢濂?
      : s && s.emotion.aff < -15
        ? '濂规湁浜涗綆钀?
        : '姘旀皼骞崇ǔ'
  const dispatchLabel = dispatchTrigger ? formatDispatchTriggerLabel(dispatchTrigger) : null

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="glass-panel flex flex-col gap-4 rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <LightCore trust={s?.relationship.trust} />
            <span className="font-display text-sm font-medium text-ink">
              {s ? EMOTION_LABEL_ZH[s.emotion.primaryLabel] ?? s.emotion.primaryLabel : '鈥?}
            </span>
          </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => useUiStore.getState().setTheaterOpen(true)}
            className="rounded-lg border border-glass-border px-2 py-1 text-[10px] text-ink-muted hover:text-ink"
          >
            鍓ч櫌
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-lg border border-glass-border px-2 py-1 text-[10px] text-ink-muted transition hover:border-accent/30 hover:text-ink"
          >
            {loading ? '鈥? : '鍒锋柊'}
          </button>
        </div>
        </div>

        {s && (
          <>
            <div className="mx-auto aspect-square w-full max-w-[200px]">
              <EmotionStarMap
                aff={s.emotion.aff}
                sec={s.emotion.sec}
                aro={s.emotion.aro}
                dom={s.emotion.dom}
                primaryLabel={s.emotion.primaryLabel}
              />
            </div>

            <TrustGlowBar
              trust={s.relationship.trust}
              rifts={s.relationship.rifts}
              stage={s.relationship.stage}
            />

            <p className="text-center text-[11px] text-ink-muted">
              浠婂ぉ鑱婁簡 {s.counters.totalTurns} 杞?路 {moodHint}
            </p>

            {s._reunion?.active && s._reunion.gapHours && s._reunion.gapHours >= 1 && (
              <div className="rounded-xl border border-accent/20 bg-accent/5 px-3 py-2 text-[11px] text-ink-muted">
                <span className="font-medium text-accent">涔呭埆閲嶉€?/span>
                <span className="ml-1">
                  {s._reunion.gapHours < 24
                    ? `绂荤嚎 ${s._reunion.gapHours} 灏忔椂`
                    : `绂荤嚎 ${Math.round(s._reunion.gapHours / 24)} 澶ー}
                </span>
              </div>
            )}

            <DesireStackView
              stack={s.desireStack}
              onDismiss={async (desireId) => {
                await window.Ackem.desireDismiss(desireId)
                void refresh()
              }}
              onClearActive={async () => {
                await window.Ackem.desireClearActive()
                void refresh()
              }}
            />

            <div className="space-y-2 border-t border-surface-inset/60 pt-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">浜烘牸 TISOR</p>
              {(['T', 'I', 'S', 'O', 'R'] as const).map((dim) => {
                const labels = { T: '娓╂煍', I: '涓诲姩', S: '鏁忔劅', O: '寮€鏀?, R: '鐞嗘€? }
                const val = s.personality[dim]
                return (
                  <div key={dim} className="flex items-center gap-2 text-[10px]">
                    <span className="w-8 text-ink-muted">{labels[dim]}</span>
                    <div className="trust-glow-bar flex-1">
                      <span style={{ width: `${val}%` }} />
                    </div>
                    <span className="w-8 text-right tabular-nums text-ink-muted">{val.toFixed(0)}</span>
                  </div>
                )
              })}
            </div>

            {(profileMode === 'inferred' || s.userSixDimensions) && s.userSixDimensions && (
              <div className="space-y-2 border-t border-surface-inset/60 pt-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">涓讳汉寮€婧愬叚缁?/p>
                {(['E', 'A', 'D', 'P', 'N', 'O'] as const).map((dim) => {
                  const labels = { E: '琛ㄨ揪娆?, A: '渚濇亱', D: '鐩存帴', P: '鏉冨姏', N: '鎯呮劅', O: '寮€鏀? }
                  const val = s.userSixDimensions![dim]
                  return (
                    <div key={dim} className="flex items-center gap-2 text-[10px]">
                      <span className="w-8 text-ink-muted">{labels[dim]}</span>
                      <div className="trust-glow-bar flex-1">
                        <span style={{ width: `${val}%` }} />
                      </div>
                      <span className="w-8 text-right tabular-nums text-ink-muted">{val.toFixed(0)}</span>
                    </div>
                  )
                })}
                <p className="text-[10px] text-ink-muted">
                  鏉ユ簮锛氬鍏ユ帹鏂?路 {new Date(s.userSixDimensions.inferredAt).toLocaleDateString()}
                </p>
              </div>
            )}

            {dispatchLabel && (
              <p
                className="truncate pt-1 text-center text-[10px] leading-tight text-ink-muted"
                title={dispatchLabel}
              >
                {dispatchLabel}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

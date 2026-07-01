import { useEffect, useState, useCallback } from 'react'
import { t } from '../lib/i18n'
import { useAppStore } from '../store/appStore'
import { useUiStore } from '../store/uiStore'
import { EMOTION_LABEL_ZH } from '../lib/emotionColors'
import { EmotionStarMap } from './EmotionStarMap'
import { LightCore } from './LightCore'
import type { UserSixDimensions } from '../ackem'
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
  const stageZh = stage === 'INTIMATE' ? '亲密' : stage === 'FAMILIAR' ? '熟悉' : '初识'
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-muted">信任</span>
        <span className="font-medium text-accent">{trust.toFixed(0)}</span>
      </div>
      <div className="trust-glow-bar">
        <span style={{ width: `${Math.min(100, Math.max(0, trust))}%` }} />
      </div>
      <div className="flex justify-between text-[11px] text-ink-muted">
        <span>阶段 · {stageZh}</span>
        <span>裂痕 {rifts}</span>
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
        欲望栈 ({activeDesires.length})
      </summary>
      <div className="mt-2 space-y-2">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void onClearActive()}
            className="text-[10px] text-ink-muted underline hover:text-ink"
          >
            清空
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
                aria-label={`移除：${s!.topic}`}
                onClick={() => void onDismiss(s!.id)}
                className="text-ink-muted hover:text-ink"
              >
                ×
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
        window.ackem.getState() as Promise<EngineState>,
        window.ackem.profileGet()
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
        获取状态失败：{error}
        <button type="button" onClick={() => void refresh()} className="ml-2 underline">
          重试
        </button>
      </div>
    )
  }

  const s = state
  const moodHint =
    s && s.emotion.aff > 20
      ? '她心情很好'
      : s && s.emotion.aff < -15
        ? '她有些低落'
        : '气氛平稳'
  const dispatchLabel = dispatchTrigger ? formatDispatchTriggerLabel(dispatchTrigger) : null

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="glass-panel flex flex-col gap-4 rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <LightCore trust={s?.relationship.trust} />
            <span className="font-display text-sm font-medium text-ink">
              {s ? EMOTION_LABEL_ZH[s.emotion.primaryLabel] ?? s.emotion.primaryLabel : '—'}
            </span>
          </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => useUiStore.getState().setTheaterOpen(true)}
            className="rounded-lg border border-glass-border px-2 py-1 text-[10px] text-ink-muted hover:text-ink"
          >
            剧院
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-lg border border-glass-border px-2 py-1 text-[10px] text-ink-muted transition hover:border-accent/30 hover:text-ink"
          >
            {loading ? '…' : '刷新'}
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
              今天聊了 {s.counters.totalTurns} 轮 · {moodHint}
            </p>

            {s._reunion?.active && s._reunion.gapHours && s._reunion.gapHours >= 1 && (
              <div className="rounded-xl border border-accent/20 bg-accent/5 px-3 py-2 text-[11px] text-ink-muted">
                <span className="font-medium text-accent">久别重逢</span>
                <span className="ml-1">
                  {s._reunion.gapHours < 24
                    ? `离线 ${s._reunion.gapHours} 小时`
                    : `离线 ${Math.round(s._reunion.gapHours / 24)} 天`}
                </span>
              </div>
            )}

            <DesireStackView
              stack={s.desireStack}
              onDismiss={async (desireId) => {
                await window.ackem.desireDismiss(desireId)
                void refresh()
              }}
              onClearActive={async () => {
                await window.ackem.desireClearActive()
                void refresh()
              }}
            />

            <div className="space-y-2 border-t border-surface-inset/60 pt-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">人格 TISOR</p>
              {(['T', 'I', 'S', 'O', 'R'] as const).map((dim) => {
                const labels = { T: '温柔', I: '主动', S: '敏感', O: '开放', R: '理性' }
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
                <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">主人开源六维</p>
                {(['E', 'A', 'D', 'P', 'N', 'O'] as const).map((dim) => {
                  const labels = { E: '表达欲', A: '依恋', D: '直接', P: '权力', N: '情感', O: '开放' }
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
                  来源：导入推断 · {new Date(s.userSixDimensions.inferredAt).toLocaleDateString()}
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

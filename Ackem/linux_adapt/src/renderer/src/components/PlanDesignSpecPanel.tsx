import type { PlanDesignSpec } from '../../../shared/planDesignSpec'
import type { DesignSpecGateResult } from '../../../shared/planDesignSpec'
import { formatDesignSpecWireframeAscii } from '../../../shared/planDesignSpec'

type Props = {
  spec: PlanDesignSpec | null
  gate: DesignSpecGateResult | null
  busy?: boolean
  onApproveWireframe?: () => void
  /** P0：程序化控制是否显示「界面 OK」 */
  showWireframeButton?: boolean
}

export function PlanDesignSpecPanel({
  spec,
  gate,
  busy,
  onApproveWireframe,
  showWireframeButton = true
}: Props): JSX.Element | null {
  if (!spec) return null

  const wireframePending =
    spec.ui.type === 'surface' && !spec.ui.wireframeApproved && spec.ui.designBrief
  const gateNeedsWireframe = gate?.missing.some((m) => m.includes('界面 OK')) ?? false
  const needsWireframe = wireframePending && (showWireframeButton || gateNeedsWireframe)
  const wireframe = formatDesignSpecWireframeAscii(spec)

  return (
    <div className="space-y-2 rounded-xl border border-surface-inset/60 bg-surface-inset/15 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">设计规格</p>
        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] text-accent">
          {spec.artifactKind === 'uplugin' ? 'Plugin · Surface' : 'Skill'}
        </span>
      </div>

      <dl className="space-y-1 text-[11px] text-ink-muted">
        <div>
          <dt className="text-ink-muted/70">名称</dt>
          <dd className="text-ink">{spec.displayName}</dd>
        </div>
        {spec.trigger.slash.length > 0 && (
          <div>
            <dt className="text-ink-muted/70">Slash</dt>
            <dd className="font-mono text-xs text-accent/90">{spec.trigger.slash.join(' · ')}</dd>
          </div>
        )}
        {spec.ui.type === 'surface' && (
          <div>
            <dt className="text-ink-muted/70">界面类型</dt>
            <dd>Surface · {spec.ui.wireframeApproved ? '已确认' : '待确认'}</dd>
          </div>
        )}
      </dl>

      {spec.ui.type === 'surface' && wireframe && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-surface-inset/40 bg-black/20 p-2 font-mono text-[10px] leading-relaxed text-ink-muted">
          {wireframe}
        </pre>
      )}

      {needsWireframe && onApproveWireframe && (
        <button
          type="button"
          disabled={busy}
          onClick={onApproveWireframe}
          className="chat-send-btn w-full py-1.5 text-xs disabled:opacity-50"
        >
          界面 OK
        </button>
      )}

      {gate && !gate.ready && gate.missing.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[10px] text-amber-200/90">
          <p className="font-medium">确认前还需：</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {gate.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

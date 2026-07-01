import { PERMISSION_LABELS, type PermissionRequestPayload } from '../../../shared/openforuPermissions'
import { t } from '../lib/i18n'
import { describeCapabilityTier } from '../../../shared/openforuCapabilityTier'

type Props = {
  open: boolean
  payload: PermissionRequestPayload | null
  onApprove: () => void
  onDeny: () => void
}

const PERMISSION_ICONS: Record<string, string> = {
  system_notification: '🔔',
  network_outbound: '🌐',
  data_write: '💾',
  engine_inject: '💬'
}

export function PermissionRequestModal({
  open,
  payload,
  onApprove,
  onDeny
}: Props): JSX.Element | null {
  if (!open || !payload) return null

  const tierInfo = describeCapabilityTier(payload.tier)

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45"
      role="dialog"
      aria-modal="true"
      aria-labelledby="perm-request-title"
    >
      <div className="glass-panel mx-4 w-full max-w-sm rounded-2xl p-5 shadow-xl">
        <h3 id="perm-request-title" className="mb-1 text-sm font-semibold text-ink">
          ◇ 需要你的许可
        </h3>
        <p className="mb-4 text-xs text-ink-muted">
          「{payload.pluginName}」想使用：
        </p>
        <p className="mb-3 rounded-lg border border-surface-inset bg-surface/60 px-2.5 py-2 text-[11px] leading-relaxed text-ink-muted">
          <span className="font-medium text-ink">{tierInfo.label}</span>
          {' — '}
          {tierInfo.description}
        </p>
        <ul className="mb-5 space-y-2">
          {payload.permissions.map((p) => (
            <li key={p} className="flex items-center gap-2 text-sm text-ink">
              <span className="text-base leading-none">{PERMISSION_ICONS[p] ?? '•'}</span>
              <span>{PERMISSION_LABELS[p] ?? p}</span>
            </li>
          ))}
        </ul>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onDeny}
            className="flex-1 rounded-xl border border-surface-inset bg-surface px-4 py-2.5 text-sm text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
          >
            暂不授予
          </button>
          <button
            type="button"
            onClick={onApprove}
            className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm text-white transition-colors hover:bg-accent-hover"
          >
            允许并继续
          </button>
        </div>
      </div>
    </div>
  )
}

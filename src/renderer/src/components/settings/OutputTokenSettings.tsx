import type { AppSettings } from '../../../../shared/types'
import { SettingsToggleRow } from './settingsUi'
export function OutputTokenSettings({ settings, onChange }: { settings: AppSettings; onChange: (patch: Partial<AppSettings>) => void }) {
  const automatic = settings.outputTokensAuto !== false
  return <div className="space-y-3">
    <SettingsToggleRow title="自动分配输出额度" hint="默认开启，根据当前模型和服务商处理输出额度。关闭后可自定义每次请求的 token 上限。" checked={automatic} onChange={value => onChange({ outputTokensAuto: value })} />
    {automatic ? <p className="text-xs text-ink-muted">{settings.llmProvider === 'anthropic' ? '优先读取服务商的模型额度；服务商未提供能力信息时使用 8192 token 兼容额度。' : '交由服务商决定输出额度，Ackem 不额外设置固定上限。'}</p> : <label className="block text-xs font-medium text-ink-muted">自定义输出额度（token / 次请求）<input aria-label="自定义输出额度" type="number" min={1} step={1} className="field-input mt-1" value={settings.anthropicMaxTokens} onChange={event => onChange({ anthropicMaxTokens: Math.max(1, Math.floor(Number(event.target.value) || 8192)) })} /><span className="mt-1 block text-xs text-ink-muted">思考可能占用额度；实际可用值受模型和服务商限制。</span></label>}
  </div>
}

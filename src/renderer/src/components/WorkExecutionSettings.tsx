import type { AppSettings } from '../ackem'
import { t } from '../lib/i18n'

export function WorkExecutionSettings({ form, onChange }: {
  form: AppSettings
  onChange: (patch: Partial<AppSettings>) => void
}): JSX.Element {
  return <div className="space-y-4">
    <p className="text-xs text-ink-muted">{t('settings.workExecutionHint')}</p>
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={form.workRemoteChannelsEnabled === true}
        onChange={event => onChange({ workRemoteChannelsEnabled: event.target.checked })} />
      {t('settings.workRemoteChannels')}
    </label>
    <label className="block text-xs font-medium text-ink-muted">
      {t('settings.workRemotePermission')}
      <select className="field-input mt-1" value={form.ackemcodePermissionMode ?? 'bypassPermissions'}
        onChange={event => onChange({ ackemcodePermissionMode: event.target.value as AppSettings['ackemcodePermissionMode'] })}>
        <option value="default">{t('settings.workPermission.default')}</option>
        <option value="plan">{t('settings.workPermission.plan')}</option>
        <option value="acceptEdits">{t('settings.workPermission.acceptEdits')}</option>
        <option value="auto">{t('settings.workPermission.auto')}</option>
        <option value="bypassPermissions">{t('settings.workPermission.bypassPermissions')}</option>
        <option value="dontAsk">{t('settings.workPermission.dontAsk')}</option>
      </select>
    </label>
  </div>
}

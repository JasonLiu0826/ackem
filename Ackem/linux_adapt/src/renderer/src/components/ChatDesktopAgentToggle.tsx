import {
  DESKTOP_AGENT_GRAYSCALE_BANNER_ZH,
  isDesktopAgentGrayscalePreview
} from '../../../shared/desktopAgentFeature'

type Props = {
  enabled: boolean
  settingsReady: boolean
  previewOnly?: boolean
  onToggle: (next: boolean) => void
  onOpenSettings: () => void
}

export function ChatDesktopAgentToggle({
  enabled,
  settingsReady,
  previewOnly = isDesktopAgentGrayscalePreview(),
  onToggle,
  onOpenSettings
}: Props): JSX.Element {
  const disabled = previewOnly || !settingsReady

  return (
    <button
      type="button"
      title={
        previewOnly
          ? DESKTOP_AGENT_GRAYSCALE_BANNER_ZH
          : disabled
            ? '请先在设置中启用电脑助手（实验）并确认风险'
            : enabled
              ? '关闭电脑助手模式'
              : '开启电脑助手模式'
      }
      disabled={previewOnly}
      onClick={() => {
        if (previewOnly) return
        if (disabled) {
          onOpenSettings()
          return
        }
        onToggle(!enabled)
      }}
      className={[
        'chat-desktop-agent-toggle',
        previewOnly ? 'is-preview' : disabled ? 'is-disabled' : enabled ? 'is-active' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="chat-desktop-agent-toggle__dot" />
      电脑助手
      {previewOnly ? (
        <span className="chat-desktop-agent-toggle__badge">暂未开放</span>
      ) : enabled && settingsReady ? (
        <span className="chat-desktop-agent-toggle__badge">实验</span>
      ) : null}
    </button>
  )
}

export function desktopAgentInputPlaceholder(enabled: boolean, previewOnly = isDesktopAgentGrayscalePreview()): string {
  if (previewOnly) return '说点什么…（Shift+Enter 换行）'
  return enabled
    ? '告诉我你想让我在电脑上做什么…（Shift+Enter 换行）'
    : '说点什么…（Shift+Enter 换行）'
}

export { isDesktopAgentSettingsReady } from '../../../shared/desktopAgent'

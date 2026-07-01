/** 主动陪伴 / 骚扰模式 — 主进程与渲染进程共享文案 */
export const companionProactiveSettingsZh = {
  'settings.companionProactiveTitle': '主动陪伴',
  'settings.companionProactiveHint':
    '默认的空闲渐进主动（约 15 分钟起、越发越克制）始终开启；下方为额外的高频骚扰模式。',
  'settings.companionHarassEnabled': '主动骚扰模式',
  'settings.companionHarassHint':
    '开启后，Ackem 会随机在 1 / 2 / 4 / 10 分钟内发消息。默认关闭。'
} as const satisfies Record<string, string>

export const companionProactiveSettingsEn = {
  'settings.companionProactiveTitle': 'Proactive companion',
  'settings.companionProactiveHint':
    'Default idle proactive messages (from ~15 min, tapering off) stay on; the toggle below adds a separate high-frequency mode.',
  'settings.companionHarassEnabled': 'Harass mode',
  'settings.companionHarassHint':
    'When on, Ackem messages you at random within 1 / 2 / 4 / 10 minutes. Off by default.'
} as const satisfies Record<string, string>

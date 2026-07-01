/**
 * OpenForU Widget Catalog — Plan Agent / Design Spec 能力边界
 */
import type { OpenForUWidgetId } from './openforuWidgets'
import { OPENFORU_WIDGET_IDS, widgetActionManifest } from './openforuWidgets'

export type WidgetCatalogEntry = {
  id: OpenForUWidgetId
  label: string
  supportedActions: string[]
  unsupportedPatterns: RegExp[]
  configKeys: string[]
}

export const WIDGET_CATALOG: WidgetCatalogEntry[] = [
  {
    id: 'timer.pomodoro',
    label: '番茄钟（专注/休息周期）',
    supportedActions: ['开始', '重置', '开始专注'],
    unsupportedPatterns: [/暂停/i, /关闭/i, /自定义输入/i, /预设\s*25\s*\/\s*15/i, /输入框/i],
    configKeys: ['focusMinutes', 'breakMinutes']
  },
  {
    id: 'timer.countdown',
    label: '单次倒计时',
    supportedActions: ['开始', '重置'],
    unsupportedPatterns: [/暂停/i, /自定义输入/i, /输入框/i, /break/i],
    configKeys: ['durationSec', 'label']
  },
  {
    id: 'counter.simple',
    label: '简单计数器',
    supportedActions: ['+', '-', '重置', '加', '减'],
    unsupportedPatterns: [/倒计时/i, /番茄/i, /输入框/i],
    configKeys: ['initial', 'step']
  },
  {
    id: 'checklist.basic',
    label: '基础清单',
    supportedActions: ['添加'],
    unsupportedPatterns: [/倒计时/i, /番茄/i, /暂停/i],
    configKeys: ['items']
  }
]

export function widgetCatalogEntry(id: string): WidgetCatalogEntry | undefined {
  return WIDGET_CATALOG.find((w) => w.id === id)
}

/** Plan Agent system prompt 用：已实装 Widget 清单 */
export function formatWidgetCatalogForPrompt(): string {
  const lines = WIDGET_CATALOG.map((w) => {
    return `- **${w.id}**（${w.label}）：按钮 ${w.supportedActions.join('、')}；配置 ${w.configKeys.join('、')}`
  })
  return [
    'OID Widget Catalog（Surface 只能承诺以下模板已实装能力；超出须写入 openQuestions，禁止在「输出」行承诺）：',
    ...lines,
    `- 可选 id：${OPENFORU_WIDGET_IDS.join('、')}`
  ].join('\n')
}

/** primaryActions 是否可被 widget 映射 */
export function validatePrimaryActionsForWidget(
  widgetId: string,
  primaryActions: string[]
): string[] {
  const entry = widgetCatalogEntry(widgetId)
  if (!entry) return [`未知 widget: ${widgetId}`]
  const manifest = widgetActionManifest(widgetId as OpenForUWidgetId, primaryActions)
  const errors: string[] = []
  for (const action of primaryActions) {
    const ok = manifest.some(
      (m) =>
        m === action ||
        action.includes(m) ||
        m.includes(action) ||
        entry.supportedActions.some((s) => s === action || action.includes(s) || s.includes(action))
    )
    if (!ok) {
      errors.push(`主操作「${action}」不在 ${widgetId} 已实装按钮集（${entry.supportedActions.join('、')}）`)
    }
  }
  return errors
}

/** 检测方案文案是否承诺了 widget 不支持的能力 */
export function findUnsupportedWidgetClaims(text: string, widgetId: string): string[] {
  const entry = widgetCatalogEntry(widgetId)
  if (!entry) return []
  const hits: string[] = []
  for (const re of entry.unsupportedPatterns) {
    const m = text.match(re)
    if (m) hits.push(`承诺了 ${widgetId} 未实装能力：「${m[0]}」`)
  }
  return hits
}

export function validateWidgetUiClaims(
  widgetId: string | undefined,
  purpose: string,
  designBriefText: string,
  primaryActions: string[]
): string[] {
  if (!widgetId) return []
  const blob = [purpose, designBriefText, primaryActions.join(' ')].join('\n')
  return [
    ...validatePrimaryActionsForWidget(widgetId, primaryActions),
    ...findUnsupportedWidgetClaims(blob, widgetId)
  ]
}

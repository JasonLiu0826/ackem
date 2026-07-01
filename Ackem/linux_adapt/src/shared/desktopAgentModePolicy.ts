import { isDesktopAgentToolingActive, type DesktopAgentSettingsSlice } from './desktopAgent'

export type DesktopAgentModeRule = {
  id: string
  title: string
  detail: string
}

export function isDesktopAgentSessionActive(
  settings: DesktopAgentSettingsSlice & { disableChatTools?: boolean },
  chatMode: boolean
): boolean {
  return isDesktopAgentToolingActive(settings, chatMode)
}

/** 电脑助手模式行为说明 — 设置页与系统提示的唯一文案来源 */
export function listDesktopAgentModeRules(locale: 'zh' | 'en' = 'zh'): DesktopAgentModeRule[] {
  if (locale === 'en') {
    return [
      {
        id: 'local_first',
        title: 'Local machine first',
        detail:
          'Questions about files, games, or apps on this PC use the local MachineMap and use_computer — not Bing or extension skills.'
      },
      {
        id: 'no_extensions',
        title: 'No extension skills',
        detail:
          'Weather, web search, proactive plugins, and auto-dispatch are paused for this chat session.'
      },
      {
        id: 'memory_on',
        title: 'Memory still works',
        detail:
          'Embedding retrieval and conversation memory stay on so replies can still feel personal and contextual.'
      },
      {
        id: 'confirm_ops',
        title: 'Confirm before acting',
        detail:
          'File changes and app control still require your approval in the popup (unless you allow the whole session).'
      }
    ]
  }

  return [
    {
      id: 'embedding_route',
      title: 'Embedding 能力路由',
      detail:
        '你的话会先与能力例句做语义匹配，再决定本机查找、use_computer 多步操作，或能力说明；匹配结果会交给大模型执行。'
    },
    {
      id: 'local_first',
      title: '本机优先',
      detail:
        '问「我电脑里有什么游戏/文档」时，先读本机地图（MachineMap）或直接扫盘，不用联网搜索。'
    },
    {
      id: 'no_extensions',
      title: '不用扩展技能',
      detail: '本会话暂停天气、联网检索、主动插件与扩展自动调度；专注这台电脑上的文件与应用。'
    },
    {
      id: 'memory_on',
      title: '记忆照常',
      detail: 'Embedding 与对话记忆仍会参与回复，语气与人设不受影响，只是不再走外部扩展。'
    },
    {
      id: 'confirm_ops',
      title: '操作仍要确认',
      detail: '改文件、开软件等实际操作前仍会弹窗确认（也可选「允许本轮全部」）。'
    }
  ]
}

export function buildDesktopAgentModeRulesBlock(locale: 'zh' | 'en' = 'zh'): string {
  return listDesktopAgentModeRules(locale)
    .map((r) => `- ${r.title}：${r.detail}`)
    .join('\n')
}

/** 是否应屏蔽扩展调度 / 联网检索 / Skill 工具 */
export function shouldSuppressExternalChatCapabilities(sessionActive: boolean): boolean {
  return sessionActive
}

import { shouldSkipInventoryRouting } from './desktopAgentIntentGuards'
import { isDesktopAgentToolingActive, type DesktopAgentSettingsSlice } from './desktopAgent'

/** 用户问的是「这台电脑 / 本机」上的内容，而非互联网 */
const LOCAL_MACHINE_SCOPE =
  /我(?:的)?(?:电脑|pc|机器|笔记本|主机)|本机|这台电脑|电脑上|电脑里|电脑中|硬盘里|磁盘/i

const LOCAL_INVENTORY_TOPIC =
  /游戏|软件|应用|程序|文件|文档|pdf|word|ppt|安装|桌面|下载|文件夹|快捷方式/i

const LOCAL_INVENTORY_ACTION = /有哪些|都有什么|都有啥|列出|列出来|查找|扫描|找找|查一查|查查|查一下/i

export function isLocalMachineInventoryQuery(msg: string): boolean {
  const t = msg.trim()
  if (!t) return false
  if (shouldSkipInventoryRouting(t)) return false
  if (!LOCAL_MACHINE_SCOPE.test(t)) return false
  return LOCAL_INVENTORY_TOPIC.test(t) || LOCAL_INVENTORY_ACTION.test(t)
}

export function isDesktopAgentLocalFirstMode(
  settings: DesktopAgentSettingsSlice & { disableChatTools?: boolean },
  chatMode: boolean
): boolean {
  return isDesktopAgentToolingActive(settings, chatMode)
}

/** 电脑助手会话：不走联网检索 / 扩展技能，改走本机查找或 use_computer */
export function shouldSuppressExtensionDelivery(
  settings: DesktopAgentSettingsSlice & { disableChatTools?: boolean },
  chatMode: boolean
): boolean {
  return isDesktopAgentLocalFirstMode(settings, chatMode)
}

export function shouldSuppressWebSearchForMessage(
  settings: DesktopAgentSettingsSlice & { disableChatTools?: boolean },
  chatMode: boolean,
  msg: string
): boolean {
  if (!isDesktopAgentLocalFirstMode(settings, chatMode)) return false
  return isLocalMachineInventoryQuery(msg) || true
}

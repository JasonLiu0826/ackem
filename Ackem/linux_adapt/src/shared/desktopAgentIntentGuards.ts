/** 清理 / 删除 / 整理类动作（不是「列出有什么」） */
const CLEANUP_ACTION =
  /清理|清空|打扫|清扫|搞干净|移除|删掉|卸载|扔掉|清掉|清除(?!查)|删除(?!查)/i

/** 列举 / 查找类动作 */
const LIST_OR_FIND_ACTION =
  /有哪些|都有什么|都有啥|列出|列出来|查找|列表|看看有什么|装了什么|有什么游戏|有什么文件/i

/**
 * 用户想「清理/删除」，不是「查找清单」。
 * 避免「清理桌面」被 Embedding/正则误当成「查找本机游戏/文档」。
 */
export function isDesktopAgentCleanupIntent(msg: string): boolean {
  const t = msg.trim()
  if (!t) return false
  // 复合任务（先建/写再删）走 TaskPlan，不算纯清理意图
  if (/(建|写|创建|新建)/.test(t) && /(然后|再|最后|里面)/.test(t)) return false
  if (!CLEANUP_ACTION.test(t)) return false
  if (LIST_OR_FIND_ACTION.test(t)) return false
  return true
}

/** Investigation / 本机清单类路由前应调用 */
export function shouldSkipInventoryRouting(msg: string): boolean {
  return isDesktopAgentCleanupIntent(msg)
}

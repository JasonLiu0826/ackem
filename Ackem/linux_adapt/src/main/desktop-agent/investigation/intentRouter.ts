import type { InvestigationIntent, InvestigationTemplateId } from '../../../shared/investigation'
import { shouldSkipInventoryRouting } from '../../../shared/desktopAgentIntentGuards'

const GAME_PATTERNS =
  /游戏|game|steam|epic|安装.*玩|有哪些.*玩|库里|library|bannerlord|帝国时代/i

const INVENTORY_PATTERNS =
  /仔细查|仔细找|全面|列出来|列出|有哪些|都有什么|扫描|查找|inventory|list all/i

const DOCUMENT_PATTERNS = /pdf|文档|word|ppt|excel|\.doc|\.xlsx|桌面.*文件/i

const SEARCH_PATTERNS = /找.*文件|搜索.*文件|where is|在哪.*文件/i

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text))
}

function pickTemplate(userQuery: string): InvestigationTemplateId {
  if (GAME_PATTERNS.test(userQuery)) return 'games'
  if (DOCUMENT_PATTERNS.test(userQuery)) return 'documents'
  return 'generic_dir'
}

/** 任务型意图 → Investigation（电脑助手模式开启时） */
export function detectInvestigationIntent(userQuery: string): InvestigationIntent | null {
  const q = userQuery.trim()
  if (!q) return null
  if (shouldSkipInventoryRouting(q)) return null

  if (GAME_PATTERNS.test(q)) {
    return {
      intentId: 'filesystem_inventory',
      templateId: 'games',
      userQuery: q
    }
  }

  if (hasAny(q, [INVENTORY_PATTERNS, DOCUMENT_PATTERNS, SEARCH_PATTERNS])) {
    return {
      intentId: SEARCH_PATTERNS.test(q) ? 'filesystem_search' : 'filesystem_inventory',
      templateId: pickTemplate(q),
      userQuery: q
    }
  }

  return null
}

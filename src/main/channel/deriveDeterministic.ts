import type { ChannelPlan } from '../../shared/channelPlan'
import type { CatalogEntry } from './catalogTypes'
import { FILE_TAG, RESIDENT_TAGS, SEARCH_TAG, isOfficialBackupEntry } from './catalogTypes'
import type { Motive } from './detectMotive'
import { extractCwdHint, isOfficialBackupUtterance } from './detectMotive'
import type { CatalogMatch } from './matchCatalog'
import { inferUseTag } from './matchCatalog'
import { chatPlan, paperCardPlan, pendingPlan, pluginPlan } from './plans'
import { extractResidualSlots } from './residualSlots'

function withSlots(plan: ChannelPlan, userText: string, extra?: Record<string, unknown>): ChannelPlan {
  return { ...plan, params: { ...plan.params, ...extractResidualSlots(userText), ...extra } }
}

export function deriveDeterministic(
  motive: Motive,
  match: CatalogMatch | null,
  catalog: CatalogEntry[],
  userText: string
): ChannelPlan | null {
  if (motive.kind === 'none') return chatPlan('chat')
  if (motive.kind === 'organize') return paperCardPlan()

  if (motive.kind === 'work') {
    if (isOfficialBackupUtterance(userText)) {
      const backup = catalog.find(isOfficialBackupEntry)
      if (backup) return withSlots(pluginPlan(backup.id, FILE_TAG), userText)
    }
    return withSlots(
      pendingPlan('work_job', {
        intent: 'work',
        workKind: 'job',
        cwd: extractCwdHint(userText),
        tag: motive.reason === 'persist' ? 'search' : 'file'
      }),
      userText
    )
  }

  if (motive.kind === 'use') {
    if (match?.level === 'high') {
      const entry = catalog.find((e) => e.id === match.extensionId)
      return withSlots(pluginPlan(match.extensionId, entry?.capabilityTag ?? inferUseTag(userText)), userText)
    }
    if (match?.level === 'medium') {
      return withSlots(
        pendingPlan('plugin_ask', {
          intent: 'use',
          tag: inferUseTag(userText),
          candidateExtensionIds: match.extensionIds
        }),
        userText
      )
    }
    const tag = inferUseTag(userText)
    if (tag === SEARCH_TAG || isSearchUtterance(userText)) {
      return chatPlan('use', {
        tag: SEARCH_TAG,
        grounding: '【本轮通道】chat\n【状态】搜索能力不可用。\n【禁止】不可假装已经搜过。'
      })
    }
    if (tag && RESIDENT_TAGS.has(tag)) {
      return withSlots(pendingPlan('use_missing', { intent: 'use', tag }), userText)
    }
    return null
  }

  if (motive.kind === 'create') {
    if (match?.level === 'high') {
      const hit = catalog.find((e) => e.id === match.extensionId)
      if (hit?.isUserPlugin) {
        return withSlots(
          pendingPlan('update', {
            intent: 'update',
            workKind: 'factory',
            extensionId: hit.id,
            tag: hit.capabilityTag
          }),
          userText
        )
      }
    }
    const tag = inferUseTag(userText)
    const topic = extractCreateTopic(userText)
    const userSameTag = catalog.filter((e) => e.isUserPlugin && e.capabilityTag && e.capabilityTag === tag)
    if (userSameTag.length === 1 && topic && namesOverlap(topic, userSameTag[0].name)) {
      return withSlots(
        pendingPlan('update', {
          intent: 'update',
          workKind: 'factory',
          extensionId: userSameTag[0].id,
          tag
        }),
        userText
      )
    }
    if (topic && userSameTag.length === 0) {
      return withSlots(
        pendingPlan('create', {
          intent: 'create',
          workKind: 'factory',
          tag
        }),
        userText
      )
    }
    return null
  }

  if (motive.kind === 'update') {
    if (match?.level === 'high') {
      return withSlots(
        pendingPlan('update', {
          intent: 'update',
          workKind: 'factory',
          extensionId: match.extensionId,
          tag: catalog.find((e) => e.id === match.extensionId)?.capabilityTag ?? inferUseTag(userText)
        }),
        userText
      )
    }
    return null
  }

  return null
}

function isSearchUtterance(text: string): boolean {
  return /搜一下|帮我搜|联网搜|查找/.test(text)
}

function extractCreateTopic(text: string): string | null {
  const m = text.match(/(?:做|弄|写)(?:一个|个)\s*([^\s，。！？]{2,16})/)
  return m?.[1] ?? null
}

export function namesOverlap(topic: string, name: string): boolean {
  const a = topic.replace(/\s+/g, '')
  const b = name.replace(/\s+/g, '')
  if (!a || !b) return false
  return a.includes(b) || b.includes(a)
}

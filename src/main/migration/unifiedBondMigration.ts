import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadState, saveState } from '../engine/state-persistence'
import { CANONICAL_SESSION_ID } from '../session/canonical'
import { loadChatHistoryFromDb, saveChatHistoryToDb } from '../db/repos/chatHistory'
import { createLogger } from '../logger'
import type { FullState } from '../engine/types'

const log = createLogger('migration-unified-bond')
const FLAG = '.migration-unified-bond-v1.json'

function maxIso(a?: string, b?: string): string {
  if (!a) return b ?? new Date().toISOString()
  if (!b) return a
  return Date.parse(a) >= Date.parse(b) ? a : b
}

function mergeStates(desktop: FullState, weixin: FullState): FullState {
  const base = Date.parse(desktop.lastActive) >= Date.parse(weixin.lastActive) ? desktop : weixin
  return {
    ...base,
    relationship: {
      ...base.relationship,
      trust: Math.max(desktop.relationship.trust, weixin.relationship.trust),
      rifts: Math.max(desktop.relationship.rifts, weixin.relationship.rifts),
    },
    lastActive: maxIso(desktop.lastActive, weixin.lastActive),
  }
}

export function runUnifiedBondMigration(dataRoot: string): void {
  const flagPath = join(dataRoot, FLAG)
  if (existsSync(flagPath)) return

  const companionDir = join(dataRoot, 'companion')
  if (!existsSync(companionDir)) {
    writeFileSync(flagPath, JSON.stringify({ at: new Date().toISOString(), status: 'skipped_no_companion' }), 'utf-8')
    return
  }

  const logLines: string[] = [`[${new Date().toISOString()}] unified-bond-v1`]
  let mergedWeixinState = false
  let importedMessages = 0

  try {
    const desktop = loadState(dataRoot, CANONICAL_SESSION_ID)
    const legacyStateFiles = readdirSync(companionDir).filter(
      (f) => f.startsWith('state-wechat-') && f.endsWith('.json')
    )

    let merged = desktop
    for (const file of legacyStateFiles) {
      try {
        const raw = JSON.parse(readFileSync(join(companionDir, file), 'utf-8')) as FullState
        if (merged) merged = mergeStates(merged, raw)
        else merged = raw
        mergedWeixinState = true
        logLines.push(`  merged state file: ${file}`)
      } catch {
        /* skip */
      }
    }

    if (merged) {
      const beforeTrust = desktop?.relationship.trust
      saveState(dataRoot, merged, CANONICAL_SESSION_ID)
      logLines.push(
        `  trust: desktop=${beforeTrust ?? 'n/a'} weixin=merged → result=${merged.relationship.trust} (max)`
      )
    }

    const defaultRows = loadChatHistoryFromDb(dataRoot, CANONICAL_SESSION_ID)
    const mergedRows: unknown[] = [...defaultRows]

    for (const file of readdirSync(companionDir)) {
      const m = /^chat-history-wechat-(.+)\.json$/.exec(file)
      if (!m) continue
      try {
        const parsed = JSON.parse(readFileSync(join(companionDir, file), 'utf-8')) as unknown[]
        if (!Array.isArray(parsed)) continue
        for (const row of parsed) {
          if (row && typeof row === 'object') {
            const r = row as Record<string, unknown>
            mergedRows.push({
              ...r,
              channel: 'weixin',
              channelLabel: '微信端',
              sentAt: r.sentAt ?? new Date().toISOString(),
            })
            importedMessages++
          }
        }
        logLines.push(`  imported chat: ${file}`)
      } catch {
        /* skip */
      }
    }

    if (mergedRows.length > 0) {
      saveChatHistoryToDb(dataRoot, CANONICAL_SESSION_ID, mergedRows.slice(-2000))
      const legacyChat = join(companionDir, `chat-history-${CANONICAL_SESSION_ID}.json`)
      writeFileSync(legacyChat, JSON.stringify(mergedRows.slice(-2000)), 'utf-8')
    }

    logLines.push(`  chat messages imported: ${importedMessages}`)
    logLines.push('  status: ok')

    mkdirSync(join(dataRoot, 'logs'), { recursive: true })
    writeFileSync(join(dataRoot, 'logs', 'migration.log'), `${logLines.join('\n')}\n`, { flag: 'a' })
    writeFileSync(flagPath, JSON.stringify({ at: new Date().toISOString(), status: 'ok' }), 'utf-8')
    log.info('unified bond migration complete', { importedMessages, mergedWeixinState })
  } catch (e) {
    logLines.push(`  status: failed ${e instanceof Error ? e.message : String(e)}`)
    try {
      mkdirSync(join(dataRoot, 'logs'), { recursive: true })
      writeFileSync(join(dataRoot, 'logs', 'migration.log'), `${logLines.join('\n')}\n`, { flag: 'a' })
    } catch {
      /* ignore */
    }
    log.error('unified bond migration failed', e)
  }
}

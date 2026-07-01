// [gaming/mc-log-watcher] — MC latest.log 监听器
// 职责：tail latest.log → parseLogLine → 生成 McGameEvent → 推入回调
// 引用：./mc-event-parser, ./script-engine, ./mc-ws-server

import { watchFile, statSync } from 'node:fs'
import { createReadStream } from 'node:fs'
import { resolve } from 'node:path'
import { parseLogLine } from './mc-event-parser'
import type { McGameEvent, EngineStateForGaming } from './types'
import { selectReaction } from './script-engine'
import { broadcastMcEvent, getMcStatus } from './mc-ws-server'
import { createLogger } from '../../../../logger'

const log = createLogger('mc-watcher')

type McEventCallback = (event: McGameEvent, reactionText: string | null) => void

let watcherActive = false
let lastSize = 0
let currentLogPath: string | null = null
let eventCallback: McEventCallback | null = null

/**
 * 从当前文件位置读取新增行并解析为事件
 */
async function readNewLines(filePath: string): Promise<void> {
  try {
    const stat = statSync(filePath)
    if (stat.size <= lastSize) return

    const stream = createReadStream(filePath, {
      encoding: 'utf-8',
      start: lastSize,
      end: stat.size - 1
    })

    let buffer = ''
    for await (const chunk of stream) {
      buffer += chunk
    }

    lastSize = stat.size

    const lines = buffer.split('\n').filter(line => line.trim().length > 0)
    for (const line of lines) {
      const event = parseLogLine(line)
      if (!event) continue

      let reactionText: string | null = null
      try {
        // 尝试获取引擎状态并匹配反应
        // 引擎状态需要从外部注入（通过 setEngineState 设置）
        const state = getCachedEngineState()
        if (state) {
          const reaction = selectReaction(event, state)
          reactionText = reaction.text
          broadcastMcEvent(event, reaction)
        } else {
          broadcastMcEvent(event)
        }
      } catch (e) {
        log.error('reaction error', e)
      }

      if (eventCallback) {
        eventCallback(event, reactionText)
      }
    }
  } catch (err) {
    log.error('read error', { message: (err as Error).message })
  }
}

/** 缓存的引擎状态（由 setEngineStateForMc 更新） */
let cachedState: EngineStateForGaming | null = null

export function setEngineStateForMc(state: EngineStateForGaming): void {
  cachedState = state
}

function getCachedEngineState(): EngineStateForGaming | null {
  return cachedState
}

/**
 * 开始监听 MC 日志文件
 * @param logPath MC latest.log 的完整路径
 * @param onEvent 事件回调（可选，用于推送到渲染进程）
 */
export function startMcLogWatcher(
  logPath: string,
  onEvent?: McEventCallback
): void {
  if (watcherActive) stopMcLogWatcher()

  currentLogPath = logPath
  eventCallback = onEvent ?? null

  // 记录当前文件大小
  try {
    const stat = statSync(logPath)
    lastSize = stat.size
  } catch {
    lastSize = 0
  }

  // 使用 watchFile 监听变化（轮询，兼容性好）
  // fs.watch 在 Windows 上对日志轮转支持差，watchFile 更稳定
  watchFile(logPath, { interval: 500 }, async (curr) => {
    if (curr.size > lastSize) {
      await readNewLines(logPath)
    } else if (curr.size < lastSize) {
      // 文件被截断（日志轮转），从头开始
      lastSize = 0
      await readNewLines(logPath)
    }
  })

  watcherActive = true
  log.info('watching log', { path: logPath })
}

/**
 * 停止监听
 */
export function stopMcLogWatcher(): void {
  if (currentLogPath) {
    try {
      import('node:fs').then((fs) => fs.unwatchFile(currentLogPath!))
    } catch { /* ignore */ }
    currentLogPath = null
  }
  watcherActive = false
  eventCallback = null
  log.info('stopped')
}

/**
 * 手动处理一条日志行（用于测试或手动输入）
 */
export function processLogLine(
  line: string,
  state?: EngineStateForGaming
): { event: McGameEvent | null; reaction: string | null } {
  const event = parseLogLine(line)
  if (!event) return { event: null, reaction: null }

  const effectiveState = state ?? cachedState
  if (!effectiveState) return { event, reaction: null }

  try {
    const reaction = selectReaction(event, effectiveState)
    return { event, reaction: reaction.text }
  } catch {
    return { event, reaction: null }
  }
}

/**
 * 是否正在监听
 */
export function isMcWatcherActive(): boolean {
  return watcherActive
}

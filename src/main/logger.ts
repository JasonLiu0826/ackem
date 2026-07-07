// [logger] 鈥?杞婚噺缁撴瀯鍖栨棩蹇?
// 鏀寔鏃ュ織绾у埆銆佹椂闂存埑銆佹ā鍧楁爣璇嗭紝鍚屾椂杈撳嚭鍒版帶鍒跺彴鍜屾枃浠?

import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_PRIO: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

let logDir = ''
let minLevel: LogLevel = 'debug'

export function setLogDir(dir: string): void {
  logDir = dir
  mkdirSync(dir, { recursive: true })
}

export function setLogLevel(level: LogLevel): void {
  minLevel = level
}

function timestamp(): string {
  return new Date().toISOString()
}

function logFilePath(): string {
  const d = new Date()
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return join(logDir, `Ackem-${date}.log`)
}

function writeFile(line: string): void {
  if (!logDir) return
  try {
    appendFileSync(logFilePath(), line + '\n', 'utf-8')
  } catch {
    // 鏃ュ織鍐欏叆澶辫触涓嶅簲褰卞搷涓绘祦绋?
  }
}

function formatMsg(module: string, level: LogLevel, message: string, data?: unknown): string {
  const ts = timestamp()
  const base = `[${ts}] [${level.toUpperCase()}] [${module}] ${message}`
  if (data === undefined) return base
  if (data instanceof Error) return `${base} | ${data.message} ${data.stack ?? ''}`
  try {
    return `${base} | ${JSON.stringify(data)}`
  } catch {
    return `${base} | ${String(data)}`
  }
}

function log(module: string, level: LogLevel, message: string, data?: unknown): void {
  if (LEVEL_PRIO[level] < LEVEL_PRIO[minLevel]) return
  const line = formatMsg(module, level, message, data)
  const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  consoleFn(line)
  writeFile(line)
}

export function createLogger(module: string) {
  return {
    debug: (msg: string, data?: unknown) => log(module, 'debug', msg, data),
    info: (msg: string, data?: unknown) => log(module, 'info', msg, data),
    warn: (msg: string, data?: unknown) => log(module, 'warn', msg, data),
    error: (msg: string, data?: unknown) => log(module, 'error', msg, data)
  }
}

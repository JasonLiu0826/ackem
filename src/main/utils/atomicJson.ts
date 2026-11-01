// [utils/atomicJson] — JSON 落盘安全工具
// 解决记忆/状态文件"写一半损坏即永久清零"的问题：
// 1. 原子写：先写 .tmp 再 rename，崩溃不会留下半个文件
// 2. 写前备份：现有文件先复制为 .bak，损坏时永远有上一份可回滚
// 3. 读取恢复：解析失败时保留损坏文件（改名 .corrupt-<ts>），自动回退 .bak

import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export function atomicWriteJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  if (existsSync(path)) {
    try {
      copyFileSync(path, `${path}.bak`)
    } catch {
      /* 备份失败不阻塞写入 */
    }
  }
  const body = JSON.stringify(data, null, 2)
  const tmp = `${path}.tmp`
  writeFileSync(tmp, body, 'utf-8')
  try {
    renameSync(tmp, path)
  } catch {
    // Windows 上目标文件存在时 rename 可能失败，退化为直接覆盖（tmp 已写完整）
    try {
      writeFileSync(path, body, 'utf-8')
    } finally {
      try {
        renameSync(tmp, path)
      } catch {
        /* ignore */
      }
    }
  }
}

/** 读取 JSON；解析失败保留损坏现场并回退 .bak，返回 null 表示确实无可用数据 */
export function readJsonWithRecovery<T>(path: string): { data: T | null; recoveredFromBackup: boolean } {
  if (!existsSync(path)) {
    const bak = `${path}.bak`
    if (existsSync(bak)) {
      try {
        return { data: JSON.parse(readFileSync(bak, 'utf-8')) as T, recoveredFromBackup: true }
      } catch {
        return { data: null, recoveredFromBackup: false }
      }
    }
    return { data: null, recoveredFromBackup: false }
  }
  try {
    return { data: JSON.parse(readFileSync(path, 'utf-8')) as T, recoveredFromBackup: false }
  } catch {
    // 损坏：保留现场供排查，不静默清零
    try {
      renameSync(path, `${path}.corrupt-${Date.now()}`)
    } catch {
      /* ignore */
    }
    const bak = `${path}.bak`
    if (existsSync(bak)) {
      try {
        return { data: JSON.parse(readFileSync(bak, 'utf-8')) as T, recoveredFromBackup: true }
      } catch {
        return { data: null, recoveredFromBackup: false }
      }
    }
    return { data: null, recoveredFromBackup: false }
  }
}

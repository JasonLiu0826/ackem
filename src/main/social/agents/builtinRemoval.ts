/**
 * builtinRemoval — 记录用户删除的内置社会成员，防止启动时再次 seed
 */

import { kvGet, kvSet } from '../../db/repos/kv'

const NS = 'social'
const KEY = 'removed_builtin_ids'

export function listRemovedBuiltinIds(dataRoot: string): Set<string> {
  const raw = kvGet(dataRoot, NS, KEY)
  if (!raw) return new Set()
  try {
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

export function markBuiltinRemoved(dataRoot: string, agentId: string): void {
  const set = listRemovedBuiltinIds(dataRoot)
  set.add(agentId)
  kvSet(dataRoot, NS, KEY, JSON.stringify([...set]))
}

export function clearBuiltinRemoved(dataRoot: string, agentId: string): void {
  const set = listRemovedBuiltinIds(dataRoot)
  if (!set.delete(agentId)) return
  kvSet(dataRoot, NS, KEY, JSON.stringify([...set]))
}

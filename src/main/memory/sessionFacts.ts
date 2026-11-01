import type { MemoryFact } from '../engine/types'

/**
 * 记忆可见性过滤。
 *
 * 原实现（W6 DEBT-1）只让「当前会话写入的事实」可见，用来防跨会话泄漏。
 * 但它在一个人的机器上会造成更糟的后果：QQ 里聊出来的画像，桌面聊天完全看不到，
 * 同一台机器上出现两个互不相识的她。
 *
 * 现在的策略：**单机内的所有会话共享同一份记忆**（桌面 / QQ / 微信）。
 * 防泄漏的目标改由「数据本身只属于本机唯一用户」来保证。
 *
 * 保留 sessionId 参数是为了将来接入多用户时不破坏调用点——
 * 到那时再按对话对象加一层隔离即可。
 */
export function filterFactsForSession(facts: MemoryFact[], _sessionId: string): MemoryFact[] {
  return facts
}

export function summariesForSession(facts: MemoryFact[], sessionId: string, limit: number): string[] {
  return filterFactsForSession(facts, sessionId)
    .slice(0, limit)
    .map((f) => f.summary)
}

// [userName] — 用户名字记忆
// 不新建表，从 memory_facts 查询和解析用户姓名/昵称
// 设计文档：docs/memory/用户名字记忆_6_10_已设计待开发.md

import type { FactStore } from './factStore'

/** 取当前首选名字，按 weight 降序 → updatedAt 降序 */
export function resolvePreferredName(store: FactStore): string | undefined {
  store.load()
  const nameFacts = store
    .listActive()
    .filter(
      (f) =>
        f.subcategory === 'BASIC_PROFILE' &&
        (f.subject === '用户姓名' || f.subject === '用户昵称') &&
        f.weight > 0,
    )
  if (nameFacts.length === 0) return undefined
  nameFacts.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
  return nameFacts[0].summary.replace(/^用户(叫|喜欢被叫|昵称是|的小名叫|的英文名是)/, '').trim()
}

/** 取所有名字，按权重降序 */
export function resolveAllNames(store: FactStore): Array<{
  name: string
  weight: number
  subject: string
}> {
  store.load()
  return store
    .listActive()
    .filter(
      (f) =>
        f.subcategory === 'BASIC_PROFILE' &&
        (f.subject === '用户姓名' || f.subject === '用户昵称'),
    )
    .map((f) => ({
      name: f.summary.replace(/^用户(叫|喜欢被叫|昵称是|的小名叫|的英文名是)/, '').trim(),
      weight: f.weight,
      subject: f.subject,
    }))
    .sort((a, b) => b.weight - a.weight)
}

/** 是否需要主动询问用户名字 */
export function shouldAskUserName(store: FactStore): boolean {
  store.load()
  return !store
    .listActive()
    .some(
      (f) =>
        f.subcategory === 'BASIC_PROFILE' &&
        (f.subject === '用户姓名' || f.subject === '用户昵称') &&
        f.weight > 0,
    )
}

/** 规则层提取名字（正则匹配） */
export function extractNameByRegex(reply: string): { name: string; confidence: number } | null {
  const patterns = [
    /叫我([一-鿿\w]{1,10})就好/,
    /你可以叫我([一-鿿\w]{1,10})/,
    /大家都叫我([一-鿿\w]{1,10})/,
    /我叫[叫是]?([一-鿿\w]{1,10})/,
    /叫我([一-鿿\w]{1,10})/,
    /我是([一-鿿\w]{1,10})/,
    /名字[是叫]([一-鿿\w]{1,10})/,
  ]
  for (const re of patterns) {
    const m = reply.match(re)
    if (m?.[1]) return { name: m[1].trim(), confidence: 1.0 }
  }
  const trimmed = reply.trim()
  if (
    trimmed.length >= 1 &&
    trimmed.length <= 4 &&
    !/[，。！？?]/.test(trimmed) &&
    !/[谁什么啥哪怎么为何几个你他她]/u.test(trimmed)
  ) {
    return { name: trimmed, confidence: 0.9 }
  }
  return null
}

/** 人格化主动询问 */
export function getAskNamePrompt(personalityId: string): string {
  const map: Record<string, string> = {
    tsundere: "喂，我总不能一直叫你'你'吧？……你叫什么？才不是想知道呢。",
    kuudere: '……你叫什么？',
    deredere: '对了，我还不知道你的名字呢。你希望我怎么称呼你？',
    yandere: '你……叫什么？我需要知道。',
    genki: '诶~我们聊了这么久，我还不知道你叫什么呢！告诉我嘛~',
  }
  return (
    map[personalityId] ?? '对了，我还不知道你的名字呢。你希望我怎么称呼你？'
  )
}

/** 日记注入用的用户名字行 */
export function buildUserNameLine(store: FactStore): string {
  const preferred = resolvePreferredName(store)
  if (!preferred) return "你不知道用户的名字。用'ta'称呼。"
  const all = resolveAllNames(store)
  if (all.length <= 1) return `你知道用户的名字：${preferred}。你可以叫ta的名字，也可以用你人格风格的称呼。`
  const others = all
    .slice(1)
    .filter((n) => n.name !== preferred)
    .map((n) => n.name)
    .join('、')
  return others
    ? `你知道用户的名字：${preferred}（ta也用过这些名字：${others}，但更喜欢被叫${preferred}）。你可以叫ta的名字，也可以用你人格风格的称呼。`
    : `你知道用户的名字：${preferred}。你可以叫ta的名字，也可以用你人格风格的称呼。`
}

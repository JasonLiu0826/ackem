import { inferCapabilityTag } from './catalogTypes'

/** 实机漏说账本。只放一类能力都能用的说法。插件专属说法写 manifest。 */
export const HARVESTED_INVOCATION: Record<string, string[]> = {
  time: ['倒个 {n} 分钟', '倒个钟', '定个时', 'give me {n} minutes', 'set a timer for {n}'],
  weather: ["how's the weather"],
  remind: ['ping me in {n}'],
  search: ['look up {query}']
}

export function seedPluginInvocation(input: {
  name: string
  keywords: string[]
  tag?: string | null
}): string[] {
  const tag =
    input.tag ??
    inferCapabilityTag({ id: '', name: input.name, aliases: input.keywords })
  const seeds = new Set<string>(HARVESTED_INVOCATION[tag ?? ''] ?? [])
  const short = input.name.replace(/\s+/g, '').slice(0, 16)
  if (short.length >= 2) {
    seeds.add(`开始${short}`)
    seeds.add(`打开${short}`)
  }
  for (const raw of input.keywords.slice(0, 4)) {
    const k = raw.trim()
    if (k.length >= 2 && k.length <= 12) seeds.add(`开始${k}`)
  }
  return [...seeds].slice(0, 12)
}

export function mergeInvocationLists(...lists: Array<string[] | undefined>): string[] {
  const out: string[] = []
  for (const list of lists) {
    for (const item of list ?? []) {
      const s = item.trim()
      if (s && !out.includes(s)) out.push(s)
    }
  }
  return out
}

import type { DispatchCatalogEntry, DispatchConfig } from '../protocols'

/** 从 keywords 生成默认 `/关键词`（开发保底，无需重启 Ackem） */
export function buildSlashAliasesFromKeywords(keywords: string[]): string[] {
  const out: string[] = []
  for (const kw of keywords) {
    const t = kw.trim()
    if (!t || t.length > 32) continue
    out.push(`/${t}`)
  }
  return [...new Set(out)]
}

/** 扩展可用的 slash 命令（manifest.dispatch.slash 优先，否则由 keywords 推导） */
export function getSlashCommandsForEntry(entry: DispatchCatalogEntry): string[] {
  const explicit = entry.dispatch.slash?.map((s) => normalizeSlashToken(s)).filter(Boolean) as string[]
  if (explicit?.length) return [...new Set(explicit)]
  return buildSlashAliasesFromKeywords(entry.dispatch.keywords)
}

function normalizeSlashToken(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  return t.startsWith('/') ? t : `/${t}`
}

/**
 * 匹配用户输入 `/番茄钟` 或 `/沙箱探针`（可带后续说明：`/番茄钟 开始吧`）
 * 返回命中的 catalog 条目；不依赖 LLM、不依赖「开始/打开」前缀。
 */
export function matchSlashInvoke(
  message: string,
  catalog: DispatchCatalogEntry[]
): DispatchCatalogEntry | undefined {
  const trimmed = message.trim()
  const m = trimmed.match(/^\/([^\s/]{1,32})(?:\s+([\s\S]*))?$/)
  if (!m) return undefined

  const cmd = m[1].toLowerCase()

  for (const entry of catalog) {
    if (entry.status !== 'active') continue
    if (entry.rejectedInSession) continue
    if (entry.dispatch.mode !== 'dispatched') continue

    const aliases = getSlashCommandsForEntry(entry).map((s) => s.slice(1).toLowerCase())
    if (aliases.includes(cmd)) return entry
  }

  return undefined
}

/**
 * 用户发了 `/关键词`，但对应扩展未 active（未启用 / error / installed）时命中。
 * 用于注入「请到扩展中心启用」类提示，避免只走人设闲聊。
 */
export function matchSlashInvokeDisabled(
  message: string,
  catalog: DispatchCatalogEntry[]
): DispatchCatalogEntry | undefined {
  const trimmed = message.trim()
  const m = trimmed.match(/^\/([^\s/]{1,32})(?:\s+([\s\S]*))?$/)
  if (!m) return undefined

  const cmd = m[1].toLowerCase()

  for (const entry of catalog) {
    if (entry.status === 'active') continue
    if (entry.dispatch.mode !== 'dispatched') continue

    const aliases = getSlashCommandsForEntry(entry).map((s) => s.slice(1).toLowerCase())
    if (aliases.includes(cmd)) return entry
  }

  return undefined
}

/** Plan 生成 dispatch 时写入 slash 列表 */
export function attachSlashToDispatch(config: DispatchConfig): DispatchConfig {
  const slash = buildSlashAliasesFromKeywords(config.keywords)
  return slash.length ? { ...config, slash } : config
}

/** 部署成功 / 扩展中心展示用 */
export function formatSlashInvokeHint(dispatch: DispatchConfig): string {
  const slash = dispatch.slash?.length
    ? dispatch.slash
    : buildSlashAliasesFromKeywords(dispatch.keywords)
  if (!slash.length) return ''
  const shown = slash.slice(0, 4).map((s) => `\`${s}\``).join(' · ')
  return `- 保底触发（主聊天）：${shown} — 命中即调用，不依赖自然语言`
}

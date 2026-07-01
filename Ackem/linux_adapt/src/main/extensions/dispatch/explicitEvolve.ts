import type { DispatchCatalogEntry } from '../protocols'

const EVOLVE_VERB_RE =
  /(?:优化|改进|修复|调整|更新|改(?:进|一下)|evolve)\s*(?:一下\s*)?(?:这个\s*)?(?:扩展|插件|skill|uskill|uplugin)?/iu

const OPEN_SURFACE_PREFIX = /^打开/u

/** 用户是否在请求 Evolve（优化已有扩展） */
export function detectEvolveDemand(message: string): boolean {
  const trimmed = message.trim()
  if (!trimmed) return false
  return EVOLVE_VERB_RE.test(trimmed)
}

function normalizeMatchToken(raw: string): string {
  return raw.replace(/[「」"'"]/g, '').trim().toLowerCase()
}

/** 从消息中匹配 catalog 里的扩展（名称 / id 片段 / keywords） */
export function matchEvolveExtension(
  message: string,
  catalog: DispatchCatalogEntry[]
): DispatchCatalogEntry | undefined {
  if (!detectEvolveDemand(message)) return undefined

  const lower = message.toLowerCase()

  for (const entry of catalog) {
    if (entry.status !== 'active') continue
    const idSlug = entry.id.replace(/^u\//, '').replace(/@.*$/, '').toLowerCase()
    if (lower.includes(idSlug)) return entry
    if (lower.includes(entry.name.toLowerCase())) return entry
    for (const kw of entry.dispatch.keywords ?? []) {
      if (kw.length >= 2 && lower.includes(kw.toLowerCase())) return entry
    }
  }

  // 单 active 扩展时兜底
  const active = catalog.filter((e) => e.status === 'active')
  if (active.length === 1) return active[0]

  return undefined
}

export function isOpenSurfaceIntent(message: string): boolean {
  return OPEN_SURFACE_PREFIX.test(message.trim())
}

/** 「打开 XXX 插件」且扩展声明 surface 时匹配 */
export function matchExplicitOpenSurface(
  message: string,
  catalog: DispatchCatalogEntry[],
  hasSurface: (extensionId: string) => boolean
): DispatchCatalogEntry | undefined {
  if (!isOpenSurfaceIntent(message)) return undefined

  const trimmed = message.trim()
  for (const entry of catalog) {
    if (entry.status !== 'active') continue
    if (!hasSurface(entry.id)) continue

    const idSlug = entry.id.replace(/^u\//, '').replace(/@.*$/, '')
    if (trimmed.includes(idSlug) || trimmed.includes(entry.name)) return entry

    for (const kw of entry.dispatch.keywords ?? []) {
      if (kw.length >= 2 && trimmed.includes(kw)) return entry
    }
    for (const h of entry.dispatch.habits ?? []) {
      const token = h.match(/['「]([^'」]+)['」]/)?.[1]
      if (token && trimmed.includes(token)) return entry
    }
  }

  return undefined
}

export function extractEvolveTopic(message: string): string | undefined {
  const m = message.match(
    /(?:优化|改进|修复|调整|更新)\s*[「"']?([^「」"'\n]{2,32})[」"']?/u
  )
  return m?.[1] ? normalizeMatchToken(m[1]) : undefined
}

import { URL } from 'node:url'

export type ExtractedLink = {
  href: string
  kind: 'github' | 'zip' | 'skillmd' | 'other'
  text?: string
}

const GITHUB_RE =
  /https?:\/\/(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+(?:\/(?:tree|blob|releases)\/[^\s)\]"']*)?/gi
const ZIP_RE = /https?:\/\/[^\s)\]"']+\.zip(?:\?[^\s)\]"']*)?/gi
const SKILL_MD_RE =
  /https?:\/\/[^\s)\]"']+\/SKILL\.md(?:\?[^\s)\]"']*)?/gi
const RAW_GH_RE =
  /https?:\/\/raw\.githubusercontent\.com\/[^\s)\]"']+\/SKILL\.md(?:\?[^\s)\]"']*)?/gi

function classify(href: string): ExtractedLink['kind'] {
  if (/SKILL\.md/i.test(href) || /raw\.githubusercontent\.com/i.test(href)) return 'skillmd'
  if (/\.zip(\?|$)/i.test(href)) return 'zip'
  if (/github\.com\//i.test(href)) return 'github'
  return 'other'
}

function abs(base: string, href: string): string | null {
  try {
    return new URL(href, base).toString()
  } catch {
    return null
  }
}

/** Extract installable skill-related links from markdown or HTML-ish text. */
export function extractInstallableLinks(content: string, baseUrl?: string): ExtractedLink[] {
  const found = new Map<string, ExtractedLink>()

  const add = (raw: string, text?: string) => {
    let href = raw.trim().replace(/[.,;]+$/, '')
    if (baseUrl) {
      const a = abs(baseUrl, href)
      if (!a) return
      href = a
    }
    if (!/^https?:\/\//i.test(href)) return
    const kind = classify(href)
    if (kind === 'other') return
    if (!found.has(href)) found.set(href, { href, kind, text })
  }

  // markdown links
  for (const m of content.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)) {
    add(m[2]!, m[1])
  }
  // bare URLs
  for (const re of [RAW_GH_RE, SKILL_MD_RE, ZIP_RE, GITHUB_RE]) {
    re.lastIndex = 0
    for (const m of content.matchAll(re)) {
      add(m[0]!)
    }
  }
  // owner/repo shorthand in prose only (strip URLs first to avoid path false positives)
  const prose = content.replace(/https?:\/\/[^\s)\]"']+/gi, ' ')
  for (const m of prose.matchAll(/\b([A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+)\b/g)) {
    const spec = m[1]!
    const owner = spec.split('/')[0] || ''
    if (owner.includes('.')) continue
    if (/^(https?|www)$/i.test(owner)) continue
    add(`https://github.com/${spec}`)
  }

  const list = [...found.values()]
  const rank = { skillmd: 0, zip: 1, github: 2, other: 3 }
  list.sort((a, b) => rank[a.kind] - rank[b.kind] || a.href.localeCompare(b.href))
  return list
}

export function formatExtractedLinks(links: ExtractedLink[]): string {
  if (!links.length) return '(no github / zip / SKILL.md links found)'
  return links.map((l) => `- [${l.kind}] ${l.href}${l.text ? ` (${l.text})` : ''}`).join('\n')
}

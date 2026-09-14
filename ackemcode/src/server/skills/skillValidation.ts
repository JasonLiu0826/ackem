/**
 * Skill discovery / validation — Claude Code SkillTool + loadSkillsDir spirit (lightweight).
 * Ackem-owned; no Anthropic source.
 */

export type SkillValidationIssue = {
  level: 'error' | 'warn'
  code: string
  message: string
}

/** Folder / invoke names: safe for filesystem + tool args (no path sep). */
export const SKILL_NAME_MAX = 64
export const SKILL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/

export function isValidSkillName(name: string): boolean {
  const n = String(name ?? '').trim()
  if (!n || n.length > SKILL_NAME_MAX) return false
  if (n === '.' || n === '..') return false
  if (n.includes('/') || n.includes('\\') || n.includes('\0')) return false
  return SKILL_NAME_RE.test(n)
}

export function validateSkillName(
  name: string,
  label = 'name'
): SkillValidationIssue[] {
  const n = String(name ?? '').trim()
  if (!n) {
    return [{ level: 'error', code: 'empty_name', message: `${label} is empty` }]
  }
  if (!isValidSkillName(n)) {
    return [
      {
        level: 'error',
        code: 'invalid_name',
        message: `${label} "${n}" must match ${SKILL_NAME_RE} (no path separators)`
      }
    ]
  }
  return []
}

/** Parse `allowed-tools` frontmatter (comma / whitespace separated). */
export function parseAllowedToolsList(raw: string | undefined): string[] {
  if (raw == null || !String(raw).trim()) return []
  return String(raw)
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export type SkillMdValidation = {
  ok: boolean
  issues: SkillValidationIssue[]
  name?: string
  description?: string
  hasFrontmatter: boolean
}

/**
 * Validate SKILL.md content before install / at load time.
 */
export function validateSkillMarkdown(
  raw: string,
  opts: { folderName?: string } = {}
): SkillMdValidation {
  const issues: SkillValidationIssue[] = []
  const text = String(raw ?? '').replace(/^\uFEFF/, '')
  if (!text.trim()) {
    return {
      ok: false,
      issues: [
        { level: 'error', code: 'empty', message: 'SKILL.md is empty' }
      ],
      hasFrontmatter: false
    }
  }

  let hasFrontmatter = false
  let name: string | undefined
  let description: string | undefined

  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3)
    if (end === -1) {
      issues.push({
        level: 'warn',
        code: 'unclosed_frontmatter',
        message: 'Frontmatter opening --- without closing ---'
      })
    } else {
      hasFrontmatter = true
      const block = text.slice(3, end).replace(/^\r?\n/, '')
      for (const line of block.split(/\r?\n/)) {
        const m = line.trim().match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
        if (!m) continue
        const key = m[1]!.toLowerCase()
        let value = (m[2] ?? '').trim()
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1)
        }
        if (key === 'name') name = value
        if (key === 'description') description = value
      }
    }
  } else {
    issues.push({
      level: 'warn',
      code: 'no_frontmatter',
      message: 'SKILL.md has no YAML frontmatter (name/description recommended)'
    })
  }

  if (name) {
    issues.push(...validateSkillName(name, 'frontmatter name'))
  } else if (opts.folderName) {
    issues.push(...validateSkillName(opts.folderName, 'folder name'))
  } else {
    issues.push({
      level: 'error',
      code: 'missing_name',
      message: 'Missing skill name (frontmatter name or folder)'
    })
  }

  if (!description?.trim()) {
    issues.push({
      level: 'warn',
      code: 'missing_description',
      message: 'Missing description frontmatter (listing will use body fallback)'
    })
  } else if (description.length > 1024) {
    issues.push({
      level: 'warn',
      code: 'description_long',
      message: 'Description longer than 1024 chars (will be clipped in listings)'
    })
  }

  if (opts.folderName && !isValidSkillName(opts.folderName)) {
    issues.push(...validateSkillName(opts.folderName, 'folder name'))
  }

  const ok = !issues.some((i) => i.level === 'error')
  return { ok, issues, name, description, hasFrontmatter }
}

/** Listing char budget — CC SkillTool prompt budget spirit (default 8k). */
export function getSkillListingCharBudget(
  env: NodeJS.ProcessEnv = process.env
): number {
  const n = Number(env.ACKEM_SKILL_LISTING_CHARS)
  if (Number.isFinite(n) && n >= 500) return Math.floor(n)
  return 8000
}

export const MAX_LISTING_DESC_CHARS = 250

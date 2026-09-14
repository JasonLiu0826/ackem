import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { asBool, parseFrontmatter, substituteArguments } from './frontmatter.js'
import { ackemSkillsHome, projectSkillsHome } from './installSkill.js'
import {
  MAX_LISTING_DESC_CHARS,
  getSkillListingCharBudget,
  parseAllowedToolsList,
  validateSkillMarkdown,
  type SkillValidationIssue
} from './skillValidation.js'

export type SkillSource =
  | 'user'
  | 'project'
  | 'agents-user'
  | 'agents-project'
  | 'extra'
  /** Optional import — off by default */
  | 'claude-user'
  | 'claude-project'
  /** R6: built-in skills registered in-process (overridable by any disk root) */
  | 'bundled'

export type LoadedSkill = {
  /** Frontmatter name (preferred invoke id) */
  name: string
  /** Directory basename (also invocable — CC folder-name identity) */
  folderName: string
  description: string
  whenToUse?: string
  disableModelInvocation: boolean
  /** CC user-invocable (slash/UI); default true */
  userInvocable: boolean
  /** Preferred tools from frontmatter allowed-tools */
  allowedTools: string[]
  argumentHint?: string
  /** CC context: fork → surface as note (Ackem still inlines) */
  executionContext?: 'fork'
  source: SkillSource
  dir: string
  skillMdPath: string
  body: string
  validationIssues: SkillValidationIssue[]
}

export type SkillOverride = {
  name: string
  previousSource: SkillSource
  winnerSource: SkillSource
}

export type SkillsLoadMeta = {
  skills: LoadedSkill[]
  overrides: SkillOverride[]
  validationIssues: Array<{ name: string; folderName: string; issues: SkillValidationIssue[] }>
}

export type SkillLoadOptions = {
  cwd: string
  /** Also scan ~/.claude/skills (import). Default false — Ackem downloads its own. */
  useClaudeSkills?: boolean
  extraSkillDirs?: string[]
}

export function defaultSkillRoots(opts: SkillLoadOptions): { root: string; source: SkillSource }[] {
  const cwd = path.resolve(opts.cwd || process.cwd())
  const roots: { root: string; source: SkillSource }[] = [
    { root: ackemSkillsHome(), source: 'user' },
    { root: path.join(os.homedir(), '.agents', 'skills'), source: 'agents-user' },
    { root: projectSkillsHome(cwd), source: 'project' },
    { root: path.join(cwd, '.agents', 'skills'), source: 'agents-project' }
  ]
  if (opts.useClaudeSkills) {
    roots.push(
      { root: path.join(os.homedir(), '.claude', 'skills'), source: 'claude-user' },
      { root: path.join(cwd, '.claude', 'skills'), source: 'claude-project' }
    )
  }
  for (const extra of opts.extraSkillDirs ?? []) {
    if (extra?.trim()) roots.push({ root: path.resolve(extra.trim()), source: 'extra' })
  }
  return roots
}

async function loadOneSkillDir(
  skillDir: string,
  source: SkillSource
): Promise<LoadedSkill | null> {
  const skillMdPath = path.join(skillDir, 'SKILL.md')
  let raw: string
  try {
    raw = await fs.readFile(skillMdPath, 'utf8')
  } catch {
    return null
  }
  const { frontmatter, body } = parseFrontmatter(raw)
  const folderName = path.basename(skillDir)
  const name = (frontmatter.name || folderName).trim()
  if (!name) return null
  const mdCheck = validateSkillMarkdown(raw, { folderName })
  // Hard-invalid names: skip load (fail closed for discovery)
  if (!mdCheck.ok && mdCheck.issues.some((i) => i.code === 'invalid_name')) {
    return null
  }
  let description = (frontmatter.description || '').trim()
  if (!description) {
    const para = body
      .split(/\n\s*\n/)
      .map((p) => p.replace(/^#+\s*/, '').trim())
      .find((p) => p.length > 0)
    description = para ? para.slice(0, 200) : `Skill ${name}`
  }
  const userInvocable =
    frontmatter['user-invocable'] === undefined
      ? true
      : asBool(frontmatter['user-invocable'], true)
  const ctxRaw = (frontmatter.context || '').trim().toLowerCase()
  return {
    name,
    folderName,
    description,
    whenToUse: frontmatter.when_to_use || frontmatter['when-to-use'],
    disableModelInvocation: asBool(frontmatter['disable-model-invocation']),
    userInvocable,
    allowedTools: parseAllowedToolsList(frontmatter['allowed-tools']),
    argumentHint:
      frontmatter['argument-hint']?.trim() ||
      frontmatter.argument_hint?.trim() ||
      undefined,
    executionContext: ctxRaw === 'fork' ? 'fork' : undefined,
    source,
    dir: skillDir,
    skillMdPath,
    body,
    validationIssues: mdCheck.issues
  }
}

async function loadFromRoot(root: string, source: SkillSource): Promise<LoadedSkill[]> {
  let entries: { name: string; isDirectory(): boolean; isSymbolicLink(): boolean }[]
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const skills: LoadedSkill[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    const skill = await loadOneSkillDir(path.join(root, String(entry.name)), source)
    if (skill) skills.push(skill)
  }
  return skills
}

/**
 * Later roots override earlier ones with the same name (project beats user).
 * Returns overrides + validation issues for doctor/API (GM-SKILL).
 */
export async function loadSkillsDetailed(
  opts: SkillLoadOptions
): Promise<SkillsLoadMeta> {
  const roots = defaultSkillRoots(opts)
  const byName = new Map<string, LoadedSkill>()
  const overrides: SkillOverride[] = []
  // R6: bundled skills seed the map first — any disk root with the same name
  // overrides them (recorded like any other override, contract 5).
  const { BUNDLED_SKILLS } = await import('./bundled/index.js')
  for (const skill of BUNDLED_SKILLS) byName.set(skill.name, skill)
  for (const { root, source } of roots) {
    const batch = await loadFromRoot(root, source)
    for (const skill of batch) {
      const prev = byName.get(skill.name)
      if (prev && prev.source !== skill.source) {
        overrides.push({
          name: skill.name,
          previousSource: prev.source,
          winnerSource: skill.source
        })
      }
      byName.set(skill.name, skill)
    }
  }
  const skills = [...byName.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  )
  const validationIssues = skills
    .filter((s) => s.validationIssues.length)
    .map((s) => ({
      name: s.name,
      folderName: s.folderName,
      issues: s.validationIssues
    }))
  return { skills, overrides, validationIssues }
}

/** Later roots override earlier ones with the same name (project beats user). */
export async function loadSkills(opts: SkillLoadOptions): Promise<LoadedSkill[]> {
  const { skills } = await loadSkillsDetailed(opts)
  return skills
}

export function findSkill(
  skills: LoadedSkill[],
  name: string
): LoadedSkill | undefined {
  const key = name.trim().replace(/^\//, '')
  if (!key) return undefined
  return (
    skills.find((s) => s.name === key || s.folderName === key) ||
    skills.find(
      (s) =>
        s.name.toLowerCase() === key.toLowerCase() ||
        s.folderName.toLowerCase() === key.toLowerCase()
    )
  )
}

export function skillsInvocableByModel(skills: LoadedSkill[]): LoadedSkill[] {
  return skills.filter((s) => !s.disableModelInvocation)
}

export function formatSkillsListing(
  skills: LoadedSkill[],
  maxChars = getSkillListingCharBudget()
): string {
  const invocable = skillsInvocableByModel(skills)
  if (!invocable.length) {
    return '(none installed yet — use install_skill with a GitHub spec like owner/repo or owner/repo + skillName)'
  }
  // R6 contract 4: bundled skills come first so they always survive the
  // listing budget (installed skills fill whatever budget remains).
  const ordered = [
    ...invocable.filter((s) => s.source === 'bundled'),
    ...invocable.filter((s) => s.source !== 'bundled')
  ]
  const lines: string[] = []
  let used = 0
  for (const s of ordered) {
    const desc = s.whenToUse ? `${s.description} — ${s.whenToUse}` : s.description
    const clipped =
      desc.length > MAX_LISTING_DESC_CHARS
        ? desc.slice(0, MAX_LISTING_DESC_CHARS - 1) + '…'
        : desc
    const alias =
      s.folderName !== s.name ? ` (folder: ${s.folderName})` : ''
    const hint = s.argumentHint ? ` args:${s.argumentHint}` : ''
    const line = `- ${s.name}${alias}: ${clipped}${hint} [${s.source}]`
    if (used + line.length + 1 > maxChars) {
      lines.push(`- …and ${invocable.length - lines.length} more`)
      break
    }
    lines.push(line)
    used += line.length + 1
  }
  return lines.join('\n')
}

export function renderSkillPrompt(skill: LoadedSkill, args = ''): string {
  // Bundled skills have no on-disk directory
  let content = skill.dir
    ? `Base directory for this skill: ${skill.dir}\n\n${skill.body}`
    : skill.body
  const skillDir =
    process.platform === 'win32' ? skill.dir.replace(/\\/g, '/') : skill.dir
  content = content.replaceAll('${CLAUDE_SKILL_DIR}', skillDir)
  content = content.replaceAll('${ACKEM_SKILL_DIR}', skillDir)
  content = substituteArguments(content, args)
  return content
}

export async function invokeSkillByName(
  skills: LoadedSkill[],
  name: string,
  args = '',
  opts: {
    /** R6: why a context:fork skill is being inlined instead of forked */
    inlineForkReason?: string
  } = {}
): Promise<{ ok: boolean; output: string }> {
  const skill = findSkill(skills, name)
  if (!skill) {
    const available = skillsInvocableByModel(skills)
      .map((s) =>
        s.folderName !== s.name ? `${s.name}|${s.folderName}` : s.name
      )
      .slice(0, 40)
      .join(', ')
    return {
      ok: false,
      output: `Unknown skill "${name}". Available: ${available || '(none)'}. Install with install_skill.`
    }
  }
  if (skill.disableModelInvocation) {
    return {
      ok: false,
      output: `Skill "${skill.name}" has disable-model-invocation; user must invoke it explicitly.`
    }
  }
  const prompt = renderSkillPrompt(skill, args)
  return {
    ok: true,
    output: [
      `Skill "${skill.name}" loaded from ${skill.skillMdPath} (${skill.source}).`,
      skill.folderName !== skill.name
        ? `(Also invocable as folder name "${skill.folderName}".)`
        : '',
      skill.argumentHint
        ? `Argument hint: ${skill.argumentHint}`
        : '',
      skill.allowedTools.length
        ? `Preferred tools (allowed-tools): ${skill.allowedTools.join(', ')}`
        : '',
      skill.executionContext === 'fork'
        ? `Note: skill declares context:fork — executed inline here (${opts.inlineForkReason || 'forked execution unavailable in this context'}).`
        : '',
      'Follow the instructions below to complete the user request. Use normal tools as needed.',
      '',
      '----- SKILL START -----',
      prompt,
      '----- SKILL END -----'
    ]
      .filter(Boolean)
      .join('\n')
  }
}

/** Catalog rows for GET /api/skills (CC /skills listing spirit). */
export function toCatalogRows(skills: LoadedSkill[]) {
  return skills.map((s) => ({
    name: s.name,
    folderName: s.folderName,
    description: s.description,
    whenToUse: s.whenToUse,
    source: s.source,
    dir: s.dir,
    disableModelInvocation: s.disableModelInvocation,
    userInvocable: s.userInvocable,
    allowedTools: s.allowedTools,
    argumentHint: s.argumentHint,
    executionContext: s.executionContext,
    validationIssues: s.validationIssues,
    /** Only Ackem user/project roots are uninstallable via API */
    uninstallable: s.source === 'user' || s.source === 'project'
  }))
}

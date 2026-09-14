import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import {
  isValidSkillName,
  validateSkillMarkdown
} from './skillValidation.js'

export type InstallScope = 'user' | 'project'

export type InstalledSkill = {
  /** Folder name under skills root (disk identity) */
  name: string
  /** Frontmatter name when present (preferred invoke id) */
  invokeName?: string
  targetDir: string
}

export type InstallResult = {
  ok: boolean
  installed?: InstalledSkill[]
  /** @deprecated use installed[0] */
  name?: string
  /** @deprecated use installed[0] */
  targetDir?: string
  source?: string
  error?: string
}

export function ackemSkillsHome(): string {
  return path.join(os.homedir(), '.ackemcode', 'skills')
}

export function projectSkillsHome(cwd: string): string {
  return path.join(path.resolve(cwd), '.ackemcode', 'skills')
}

function skillsRoot(scope: InstallScope, cwd?: string): string {
  if (scope === 'project') {
    if (!cwd?.trim()) throw new Error('project scope requires cwd')
    return projectSkillsHome(cwd)
  }
  return ackemSkillsHome()
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const from = path.join(src, String(entry.name))
    const to = path.join(dest, String(entry.name))
    if (entry.isDirectory()) {
      await copyDir(from, to)
    } else if (entry.isSymbolicLink()) {
      const link = await fs.readlink(from)
      await fs.symlink(link, to)
    } else {
      await fs.copyFile(from, to)
    }
  }
}

function run(cmd: string, args: string[], cwd?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      windowsHide: true,
      shell: false,
      env: process.env
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr?.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', (err) => {
      resolve({ code: 1, stdout, stderr: err.message })
    })
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

/** Find directories that contain SKILL.md (max depth 4). */
export async function findSkillDirs(root: string, maxDepth = 4): Promise<string[]> {
  const found: string[] = []

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth || found.length >= 80) return
    let entries: { name: string; isDirectory(): boolean; isFile(): boolean }[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    const names = entries.map((e) => String(e.name))
    if (names.includes('SKILL.md')) {
      found.push(dir)
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const name = String(entry.name)
      if (name === '.git' || name === 'node_modules' || name === '.github') continue
      await walk(path.join(dir, name), depth + 1)
    }
  }

  await walk(root, 0)
  return found
}

async function readFrontmatterName(skillDir: string): Promise<string | undefined> {
  try {
    const raw = await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf8')
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!m) return undefined
    const nameLine = m[1]!.split(/\r?\n/).find((l) => /^\s*name\s*:/i.test(l))
    if (!nameLine) return undefined
    const v = nameLine.replace(/^\s*name\s*:\s*/i, '').trim().replace(/^["']|["']$/g, '')
    return v || undefined
  } catch {
    return undefined
  }
}

async function validateSkillDirForInstall(
  skillDir: string
): Promise<{ ok: boolean; error?: string }> {
  const folderName = path.basename(skillDir)
  if (!isValidSkillName(folderName)) {
    return {
      ok: false,
      error: `Invalid skill folder name "${folderName}" (must be alphanumeric / ._+-)`
    }
  }
  let raw: string
  try {
    raw = await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf8')
  } catch {
    return { ok: false, error: `Missing SKILL.md in ${skillDir}` }
  }
  const check = validateSkillMarkdown(raw, { folderName })
  if (!check.ok) {
    const err = check.issues
      .filter((i) => i.level === 'error')
      .map((i) => i.message)
      .join('; ')
    return { ok: false, error: err || 'SKILL.md validation failed' }
  }
  return { ok: true }
}

async function installDirs(
  skillDirs: string[],
  targetRoot: string,
  onlyName?: string
): Promise<InstalledSkill[]> {
  await fs.mkdir(targetRoot, { recursive: true })
  const installed: InstalledSkill[] = []
  for (const skillDir of skillDirs) {
    const name = path.basename(skillDir)
    if (onlyName && name !== onlyName) continue
    const gate = await validateSkillDirForInstall(skillDir)
    if (!gate.ok) {
      throw new Error(gate.error || 'skill validation failed')
    }
    const targetDir = path.join(targetRoot, name)
    if (await pathExists(targetDir)) {
      await fs.rm(targetDir, { recursive: true, force: true })
    }
    await copyDir(skillDir, targetDir)
    const invokeName = (await readFrontmatterName(targetDir)) || name
    if (invokeName && !isValidSkillName(invokeName)) {
      throw new Error(
        `Invalid frontmatter name "${invokeName}" in ${name}/SKILL.md`
      )
    }
    installed.push({ name, invokeName, targetDir })
  }
  return installed
}

export type UninstallResult = {
  ok: boolean
  name?: string
  removedDir?: string
  error?: string
}

/**
 * Remove an installed skill directory (CC: delete ~/.claude/skills/<name>).
 * Only touches Ackem user/project roots — never agents/claude/extra.
 */
export async function uninstallSkill(
  skillName: string,
  opts: { scope?: InstallScope | 'auto'; cwd?: string } = {}
): Promise<UninstallResult> {
  const key = skillName.trim().replace(/^\//, '')
  if (!key) return { ok: false, error: 'skill name required' }

  const scope = opts.scope ?? 'auto'
  const candidates: { root: string; label: string }[] = []
  if (scope === 'user' || scope === 'auto') {
    candidates.push({ root: ackemSkillsHome(), label: 'user' })
  }
  if (scope === 'project' || scope === 'auto') {
    if (!opts.cwd?.trim() && scope === 'project') {
      return { ok: false, error: 'project scope requires cwd' }
    }
    if (opts.cwd?.trim()) {
      candidates.push({ root: projectSkillsHome(opts.cwd), label: 'project' })
    }
  }

  for (const { root } of candidates) {
    // Match folder name first
    let target = path.join(root, key)
    if (await pathExists(target)) {
      await fs.rm(target, { recursive: true, force: true })
      return { ok: true, name: key, removedDir: target }
    }
    // Match frontmatter name inside any skill dir
    try {
      const entries = await fs.readdir(root, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
        const dir = path.join(root, String(entry.name))
        const fm = await readFrontmatterName(dir)
        if (fm === key || String(entry.name) === key) {
          await fs.rm(dir, { recursive: true, force: true })
          return {
            ok: true,
            name: String(entry.name),
            removedDir: dir
          }
        }
      }
    } catch {
      /* missing root */
    }
  }

  return {
    ok: false,
    error: `Skill "${key}" not found under Ackem user/project skills roots`
  }
}

/**
 * Install a skill folder from a local path into Ackem skills home.
 */
export async function installSkillFromPath(
  sourcePath: string,
  opts: { scope?: InstallScope; cwd?: string; skillName?: string } = {}
): Promise<InstallResult> {
  const scope = opts.scope ?? 'user'
  let targetRoot: string
  try {
    targetRoot = skillsRoot(scope, opts.cwd)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  const resolved = path.resolve(sourcePath.trim())
  if (!(await pathExists(resolved))) {
    return { ok: false, error: `Path not found: ${resolved}` }
  }

  let searchRoot = resolved
  const stat = await fs.stat(resolved)
  if (stat.isFile()) {
    if (path.basename(resolved) !== 'SKILL.md') {
      return { ok: false, error: 'File install only accepts SKILL.md' }
    }
    searchRoot = path.dirname(resolved)
  }

  let skillDirs = await findSkillDirs(searchRoot)
  if (!skillDirs.length && (await pathExists(path.join(searchRoot, 'SKILL.md')))) {
    skillDirs = [searchRoot]
  }
  if (!skillDirs.length) {
    return {
      ok: false,
      error: `No SKILL.md found under ${resolved}. Expected skill-name/SKILL.md`
    }
  }

  if (opts.skillName) {
    skillDirs = skillDirs.filter((d) => path.basename(d) === opts.skillName)
    if (!skillDirs.length) {
      return { ok: false, error: `Skill "${opts.skillName}" not found in source` }
    }
  }

  try {
    const installed = await installDirs(skillDirs, targetRoot, opts.skillName)
    return {
      ok: true,
      installed,
      name: installed[0]?.name,
      targetDir: installed[0]?.targetDir,
      source: resolved
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

type ParsedRemote =
  | { kind: 'github'; owner: string; repo: string; ref?: string; subpath?: string }
  | { kind: 'git'; url: string; ref?: string; subpath?: string }
  | { kind: 'zip'; url: string }
  | { kind: 'skillmd'; url: string; suggestedName?: string }
  | { kind: 'local'; path: string }

function skillNameFromUrl(url: string): string | undefined {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    const skillIdx = parts.findIndex((p) => p.toLowerCase() === 'skill.md')
    if (skillIdx > 0) return parts[skillIdx - 1]
    if (parts.length >= 2) return parts[parts.length - 2]
  } catch {
    /* ignore */
  }
  return undefined
}

/**
 * Parse install specs:
 * - owner/repo
 * - owner/repo@ref
 * - owner/repo/path/to/skill
 * - owner/repo@ref:path/to/skill
 * - https://github.com/owner/repo[.git][/tree/ref/path]
 * - https://github.com/owner/repo/blob/ref/path/SKILL.md
 * - https://raw.githubusercontent.com/.../SKILL.md
 * - https://.../*.zip
 * - absolute/relative local path
 */
export function parseInstallSpec(spec: string): ParsedRemote {
  const raw = spec.trim()
  if (!raw) throw new Error('Empty install spec')

  if (raw.endsWith('.zip') && /^https?:\/\//i.test(raw)) {
    return { kind: 'zip', url: raw }
  }

  // Direct SKILL.md (raw or any host)
  if (/^https?:\/\//i.test(raw) && /SKILL\.md(?:\?|#|$)/i.test(raw)) {
    const blob = raw.match(
      /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+\/)?SKILL\.md(?:\?|#|$)/i
    )
    if (blob) {
      const owner = blob[1]!
      const repo = blob[2]!
      const ref = blob[3]!
      const dir = (blob[4] || '').replace(/\/$/, '')
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${dir ? dir + '/' : ''}SKILL.md`
      return {
        kind: 'skillmd',
        url: rawUrl,
        suggestedName: dir ? path.posix.basename(dir) : repo
      }
    }
    return {
      kind: 'skillmd',
      url: raw.split(/[?#]/)[0]!,
      suggestedName: skillNameFromUrl(raw)
    }
  }

  const ghTree = raw.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.*))?)?\/?$/i
  )
  if (ghTree) {
    return {
      kind: 'github',
      owner: ghTree[1]!,
      repo: ghTree[2]!.replace(/\.git$/i, ''),
      ref: ghTree[3],
      subpath: ghTree[4] || undefined
    }
  }

  if (/^https?:\/\/|^git@/i.test(raw)) {
    // git URL optionally with #ref or #ref:subpath
    const [base, frag] = raw.split('#')
    let ref: string | undefined
    let subpath: string | undefined
    if (frag) {
      const [r, ...rest] = frag.split(':')
      ref = r
      if (rest.length) subpath = rest.join(':')
    }
    return { kind: 'git', url: base!, ref, subpath }
  }

  // owner/repo[/sub/path][@ref] or owner/repo@ref:sub/path
  if (!path.isAbsolute(raw) && !raw.startsWith('.') && !raw.includes('\\')) {
    let rest = raw
    let ref: string | undefined
    let subpath: string | undefined
    const atIdx = rest.indexOf('@')
    if (atIdx !== -1) {
      const after = rest.slice(atIdx + 1)
      rest = rest.slice(0, atIdx)
      const colon = after.indexOf(':')
      if (colon !== -1) {
        ref = after.slice(0, colon)
        subpath = after.slice(colon + 1) || undefined
      } else {
        ref = after || undefined
      }
    }
    const parts = rest.split('/').filter(Boolean)
    if (parts.length >= 2 && /^[\w.-]+$/.test(parts[0]!) && /^[\w.-]+$/.test(parts[1]!)) {
      const owner = parts[0]!
      const repo = parts[1]!
      if (!subpath && parts.length > 2) {
        subpath = parts.slice(2).join('/')
      }
      return { kind: 'github', owner, repo, ref, subpath }
    }
  }

  return { kind: 'local', path: raw }
}

async function mkTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

async function gitClone(url: string, dest: string, ref?: string): Promise<void> {
  const args = ['clone', '--depth', '1']
  if (ref) args.push('--branch', ref)
  args.push(url, dest)
  const r = await run('git', args)
  if (r.code !== 0) {
    throw new Error(`git clone failed: ${r.stderr || r.stdout || `exit ${r.code}`}`)
  }
}

async function downloadZip(url: string, destZip: string): Promise<void> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'AckemCode' },
    redirect: 'follow'
  })
  if (!res.ok || !res.body) {
    throw new Error(`Download failed HTTP ${res.status} for ${url}`)
  }
  const body = res.body as unknown as import('node:stream/web').ReadableStream
  await pipeline(Readable.fromWeb(body), createWriteStream(destZip))
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  await fs.mkdir(destDir, { recursive: true })
  if (process.platform === 'win32') {
    const ps = await run('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`
    ])
    if (ps.code !== 0) {
      throw new Error(`Expand-Archive failed: ${ps.stderr || ps.stdout}`)
    }
    return
  }
  const uz = await run('unzip', ['-q', zipPath, '-d', destDir])
  if (uz.code !== 0) {
    throw new Error(`unzip failed: ${uz.stderr || uz.stdout}`)
  }
}

async function resolveCloneRoot(tmp: string): Promise<string> {
  const entries = await fs.readdir(tmp, { withFileTypes: true })
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => String(e.name))
  // GitHub zipball extracts to owner-repo-sha/
  if (dirs.length === 1 && !(await pathExists(path.join(tmp, 'SKILL.md')))) {
    return path.join(tmp, dirs[0]!)
  }
  return tmp
}

/**
 * Download and install skills from GitHub / git URL / zip / local path.
 * Spec examples: anthropics/skills, owner/repo@main:skill-name, https://github.com/...
 */
export async function installSkillFromSpec(
  spec: string,
  opts: {
    scope?: InstallScope
    cwd?: string
    /** Install only this skill folder name when the repo has many */
    skillName?: string
  } = {}
): Promise<InstallResult> {
  const scope = opts.scope ?? 'user'
  let targetRoot: string
  try {
    targetRoot = skillsRoot(scope, opts.cwd)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  let parsed: ParsedRemote
  try {
    parsed = parseInstallSpec(spec)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  if (parsed.kind === 'local') {
    return installSkillFromPath(parsed.path, opts)
  }

  if (parsed.kind === 'skillmd') {
    const name =
      opts.skillName?.trim() ||
      parsed.suggestedName ||
      'downloaded-skill'
    if (!isValidSkillName(name)) {
      return {
        ok: false,
        error: `Invalid skill name "${name}" for SKILL.md install`
      }
    }
    try {
      const res = await fetch(parsed.url, {
        headers: { 'User-Agent': 'AckemCode' },
        redirect: 'follow'
      })
      if (!res.ok) {
        return { ok: false, error: `Failed to fetch SKILL.md: HTTP ${res.status}` }
      }
      const text = await res.text()
      if (!text.trim()) {
        return { ok: false, error: 'Downloaded SKILL.md is empty' }
      }
      const check = validateSkillMarkdown(text, { folderName: name })
      if (!check.ok) {
        return {
          ok: false,
          error: check.issues
            .filter((i) => i.level === 'error')
            .map((i) => i.message)
            .join('; ')
        }
      }
      const targetDir = path.join(targetRoot, name)
      await fs.mkdir(targetDir, { recursive: true })
      await fs.writeFile(path.join(targetDir, 'SKILL.md'), text, 'utf8')
      const invokeName = (await readFrontmatterName(targetDir)) || name
      return {
        ok: true,
        installed: [{ name, invokeName, targetDir }],
        name,
        targetDir,
        source: parsed.url
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  const tmp = await mkTempDir('ackem-skill-')
  try {
    let workRoot = tmp
    if (parsed.kind === 'github') {
      const url = `https://github.com/${parsed.owner}/${parsed.repo}.git`
      try {
        await gitClone(url, path.join(tmp, 'repo'), parsed.ref)
        workRoot = path.join(tmp, 'repo')
      } catch (gitErr) {
        // Fallback: GitHub zipball (no git required)
        const ref = parsed.ref || 'HEAD'
        const zipUrl = `https://codeload.github.com/${parsed.owner}/${parsed.repo}/zip/${encodeURIComponent(ref)}`
        const zipPath = path.join(tmp, 'repo.zip')
        try {
          await downloadZip(zipUrl, zipPath)
          const extractTo = path.join(tmp, 'extract')
          await extractZip(zipPath, extractTo)
          workRoot = await resolveCloneRoot(extractTo)
        } catch (zipErr) {
          return {
            ok: false,
            error: `Git failed (${gitErr instanceof Error ? gitErr.message : String(gitErr)}); zip fallback failed (${zipErr instanceof Error ? zipErr.message : String(zipErr)})`
          }
        }
      }
      if (parsed.subpath) {
        workRoot = path.join(workRoot, parsed.subpath)
      }
    } else if (parsed.kind === 'git') {
      // Bare https://docs… URLs parse as `git` but are intro pages — fail fast for discover.
      const looksLikeGitRemote =
        /\.git$/i.test(parsed.url) ||
        /^git@/i.test(parsed.url) ||
        /(?:^|\/\/)(?:github\.com|gitlab\.com|bitbucket\.org)\b/i.test(parsed.url)
      if (!looksLikeGitRemote) {
        return {
          ok: false,
          error:
            'URL is not a git remote. If this is a docs/intro page, Ackem will discover install links next.'
        }
      }
      await gitClone(parsed.url, path.join(tmp, 'repo'), parsed.ref)
      workRoot = path.join(tmp, 'repo')
      if (parsed.subpath) workRoot = path.join(workRoot, parsed.subpath)
    } else {
      const zipPath = path.join(tmp, 'skill.zip')
      await downloadZip(parsed.url, zipPath)
      const extractTo = path.join(tmp, 'extract')
      await extractZip(zipPath, extractTo)
      workRoot = await resolveCloneRoot(extractTo)
    }

    if (!(await pathExists(workRoot))) {
      return { ok: false, error: `Source path missing after download: ${workRoot}` }
    }

    let skillDirs = await findSkillDirs(workRoot)
    if (!skillDirs.length && (await pathExists(path.join(workRoot, 'SKILL.md')))) {
      skillDirs = [workRoot]
    }
    if (!skillDirs.length) {
      return {
        ok: false,
        error: `Downloaded OK but no SKILL.md found under ${spec}. Point to a skill folder (owner/repo/path) or pass skillName.`
      }
    }

    if (opts.skillName) {
      const filtered = skillDirs.filter((d) => path.basename(d) === opts.skillName)
      if (!filtered.length) {
        const available = skillDirs.map((d) => path.basename(d)).slice(0, 30).join(', ')
        return {
          ok: false,
          error: `Skill "${opts.skillName}" not in source. Available: ${available}`
        }
      }
      skillDirs = filtered
    } else if (skillDirs.length > 12) {
      // Large catalogs (e.g. anthropics/skills): require skillName
      const available = skillDirs.map((d) => path.basename(d)).slice(0, 40).join(', ')
      return {
        ok: false,
        error: `Repo contains ${skillDirs.length} skills. Pass skillName to install one (or a few). Available: ${available}`
      }
    }

    const installed = await installDirs(skillDirs, targetRoot)
    return {
      ok: true,
      installed,
      name: installed[0]?.name,
      targetDir: installed[0]?.targetDir,
      source: spec.trim()
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** Re-export validation helpers for tools / API. */
export { isValidSkillName, validateSkillMarkdown } from './skillValidation.js'

/** Curated starting points (download-on-demand — not a full marketplace). */
export const SKILL_CATALOG: {
  id: string
  title: string
  spec: string
  skillName?: string
  note: string
}[] = [
  {
    id: 'anthropics-skills',
    title: 'Anthropic example skills (repo)',
    spec: 'anthropics/skills',
    note: 'Large repo — pick skillName (e.g. docx, pdf, pptx)'
  },
  {
    id: 'anthropics-skills-docx',
    title: 'Document skill: docx',
    spec: 'anthropics/skills',
    skillName: 'docx',
    note: 'One-click install of the docx example skill'
  },
  {
    id: 'anthropics-skills-template',
    title: 'Template skill (SKILL.md raw)',
    spec: 'https://raw.githubusercontent.com/anthropics/skills/main/template/SKILL.md',
    note: 'Install directly from a SKILL.md URL'
  }
]

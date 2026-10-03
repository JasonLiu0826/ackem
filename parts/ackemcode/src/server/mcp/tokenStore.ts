/**
 * Persist MCP OAuth credentials — Claude Code secureStorage / mcp auth spirit.
 *
 * Primary path: ~/.ackemcode/mcp-oauth/<server>.json (mode 0o600; dir 0o700).
 * Legacy fallback read: <DATA_DIR>/mcp-oauth/ (project data/) — migrate on save.
 * Never store tokens in settings.json.
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DATA_DIR } from '../settingsStore.js'
import { sanitizeMcpName } from './types.js'

export type StoredOAuthTokens = {
  access_token: string
  token_type?: string
  expires_in?: number
  scope?: string
  refresh_token?: string
  id_token?: string
}

export type StoredClientInformation = {
  client_id: string
  client_secret?: string
  client_id_issued_at?: number
  client_secret_expires_at?: number
  redirect_uris?: string[]
  [key: string]: unknown
}

export type McpOAuthRecord = {
  serverName: string
  serverUrl: string
  tokens?: StoredOAuthTokens
  clientInformation?: StoredClientInformation
  codeVerifier?: string
  updatedAt: string
}

/** Public status snapshot — never includes raw secrets. */
export type McpOAuthPublicSummary = {
  serverName: string
  serverUrl: string
  hasAccessToken: boolean
  hasRefreshToken: boolean
  hasClientId: boolean
  hasClientSecret: boolean
  tokenType?: string
  scope?: string
  updatedAt: string
}

function getAckemHome(): string {
  if (process.env.ACKEMCODE_HOME?.trim()) {
    return path.resolve(process.env.ACKEMCODE_HOME.trim())
  }
  return path.join(os.homedir(), '.ackemcode')
}

/** Primary oauth store directory (override with ACKEM_MCP_OAUTH_DIR). */
export function getMcpOAuthDir(): string {
  if (process.env.ACKEM_MCP_OAUTH_DIR?.trim()) {
    return path.resolve(process.env.ACKEM_MCP_OAUTH_DIR.trim())
  }
  return path.join(getAckemHome(), 'mcp-oauth')
}

/** Legacy project-local dir (pre–GM-MCP). */
export function getLegacyMcpOAuthDir(): string {
  return path.join(DATA_DIR, 'mcp-oauth')
}

function recordFileName(serverName: string): string {
  return `${sanitizeMcpName(serverName)}.json`
}

export function mcpOAuthRecordPath(serverName: string): string {
  return path.join(getMcpOAuthDir(), recordFileName(serverName))
}

function legacyRecordPath(serverName: string): string {
  return path.join(getLegacyMcpOAuthDir(), recordFileName(serverName))
}

async function chmodBestEffort(p: string, mode: number): Promise<void> {
  try {
    await fs.chmod(p, mode)
  } catch {
    /* Windows / unsupported FS — best effort */
  }
}

async function ensureOAuthDir(): Promise<string> {
  const dir = getMcpOAuthDir()
  await fs.mkdir(dir, { recursive: true, mode: 0o700 })
  await chmodBestEffort(dir, 0o700)
  return dir
}

async function writeSecureJson(filePath: string, data: unknown): Promise<void> {
  await ensureOAuthDir()
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), {
    encoding: 'utf8',
    mode: 0o600
  })
  await fs.rename(tmp, filePath)
  await chmodBestEffort(filePath, 0o600)
}

/** POSIX: file mode should be 0o600 (owner rw). Windows often reports differently. */
export async function getTokenFileMode(
  serverName: string
): Promise<number | null> {
  try {
    const st = await fs.stat(mcpOAuthRecordPath(serverName))
    return st.mode & 0o777
  } catch {
    return null
  }
}

export function isSecureTokenMode(mode: number | null): boolean {
  if (mode == null) return false
  if (process.platform === 'win32') return true
  // Owner read/write only (no group/other bits).
  return (mode & 0o077) === 0 && (mode & 0o600) === 0o600
}

export function toPublicOAuthSummary(
  record: McpOAuthRecord
): McpOAuthPublicSummary {
  return {
    serverName: record.serverName,
    serverUrl: record.serverUrl,
    hasAccessToken: Boolean(record.tokens?.access_token),
    hasRefreshToken: Boolean(record.tokens?.refresh_token),
    hasClientId: Boolean(record.clientInformation?.client_id),
    hasClientSecret: Boolean(record.clientInformation?.client_secret),
    tokenType: record.tokens?.token_type,
    scope: record.tokens?.scope,
    updatedAt: record.updatedAt
  }
}

export async function hasOAuthTokens(serverName: string): Promise<boolean> {
  const rec = await loadOAuthRecord(serverName)
  return Boolean(rec?.tokens?.access_token)
}

async function readRecordAt(filePath: string): Promise<McpOAuthRecord | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as McpOAuthRecord
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

export async function loadOAuthRecord(
  serverName: string
): Promise<McpOAuthRecord | null> {
  const key = sanitizeMcpName(serverName)
  const primary = await readRecordAt(mcpOAuthRecordPath(key))
  if (primary) return primary
  const legacy = await readRecordAt(legacyRecordPath(key))
  if (legacy) {
    // Opportunistic migrate to secure home path (best-effort).
    try {
      await saveOAuthRecord({ ...legacy, serverName: key })
      await fs.unlink(legacyRecordPath(key)).catch(() => {})
    } catch {
      /* keep serving legacy if migrate fails */
    }
    return legacy
  }
  return null
}

export async function saveOAuthRecord(record: McpOAuthRecord): Promise<void> {
  const next: McpOAuthRecord = {
    ...record,
    serverName: sanitizeMcpName(record.serverName),
    updatedAt: new Date().toISOString()
  }
  await writeSecureJson(mcpOAuthRecordPath(next.serverName), next)
}

export async function clearOAuthRecord(serverName: string): Promise<void> {
  const key = sanitizeMcpName(serverName)
  for (const p of [mcpOAuthRecordPath(key), legacyRecordPath(key)]) {
    try {
      await fs.unlink(p)
    } catch {
      /* missing ok */
    }
  }
}

export async function updateOAuthRecord(
  serverName: string,
  patch: Partial<Omit<McpOAuthRecord, 'serverName'>>
): Promise<McpOAuthRecord> {
  const key = sanitizeMcpName(serverName)
  const prev = (await loadOAuthRecord(key)) || {
    serverName: key,
    serverUrl: '',
    updatedAt: new Date().toISOString()
  }
  const next: McpOAuthRecord = {
    ...prev,
    ...patch,
    serverName: key,
    updatedAt: new Date().toISOString()
  }
  await saveOAuthRecord(next)
  return next
}

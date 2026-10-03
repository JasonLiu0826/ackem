/**
 * MCP secret hygiene — Claude Code mcp/auth redact + envExpansion spirit.
 * No Keychain/AS/XAA (exempt); focus on redact + ${VAR} expansion.
 */

const SENSITIVE_OAUTH_PARAMS = [
  'state',
  'nonce',
  'code_challenge',
  'code_verifier',
  'code',
  'access_token',
  'refresh_token',
  'id_token',
  'client_secret'
] as const

/**
 * Redact sensitive OAuth query parameters from a URL for logs / tool hints / status.
 */
export function redactSensitiveUrlParams(url: string): string {
  try {
    const parsed = new URL(url)
    for (const param of SENSITIVE_OAUTH_PARAMS) {
      if (parsed.searchParams.has(param)) {
        // Use plain token — URLSearchParams encodes `[` `]` as %5B %5D.
        parsed.searchParams.set(param, 'REDACTED')
      }
    }
    return parsed.toString()
  } catch {
    return redactSecretsInText(url)
  }
}

/** Best-effort redact of bearer/token-like substrings in free text. */
export function redactSecretsInText(text: string): string {
  if (!text) return text
  return text
    .replace(
      /(access_token|refresh_token|id_token|client_secret|Bearer)\s*[=:]\s*["']?[^\s"'&]+/gi,
      '$1=[REDACTED]'
    )
    .replace(/\b(sk-[A-Za-z0-9_-]{12,}|ya29\.[A-Za-z0-9._-]{20,})\b/g, '[REDACTED]')
}

/**
 * Expand `${VAR}` / `${VAR:-default}` in a string (CC envExpansion).
 */
export function expandEnvVarsInString(value: string): {
  expanded: string
  missingVars: string[]
} {
  const missingVars: string[] = []
  const expanded = value.replace(/\$\{([^}]+)\}/g, (match, varContent: string) => {
    const [varName, defaultValue] = varContent.split(':-', 2)
    const name = String(varName || '').trim()
    if (!name) return match
    const envValue = process.env[name]
    if (envValue !== undefined) return envValue
    if (defaultValue !== undefined) return defaultValue
    missingVars.push(name)
    return match
  })
  return { expanded, missingVars }
}

export function expandEnvRecord(
  env: Record<string, string> | undefined
): { env: Record<string, string> | undefined; missingVars: string[] } {
  if (!env) return { env: undefined, missingVars: [] }
  const out: Record<string, string> = {}
  const missingVars: string[] = []
  for (const [k, v] of Object.entries(env)) {
    const r = expandEnvVarsInString(String(v))
    out[k] = r.expanded
    missingVars.push(...r.missingVars)
  }
  return { env: out, missingVars }
}

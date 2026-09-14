/**
 * Simple secret scan before writing memory files (roadmap M22; team-memory spirit).
 */

const PATTERNS: Array<{ name: string; re: RegExp }> = [
  {
    name: 'aws_access_key',
    re: /\bAKIA[0-9A-Z]{16}\b/
  },
  {
    name: 'github_token',
    re: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/
  },
  {
    name: 'openai_key',
    re: /\bsk-[A-Za-z0-9]{20,}\b/
  },
  {
    name: 'anthropic_key',
    re: /\bsk-ant-[A-Za-z0-9\-_]{20,}\b/
  },
  {
    name: 'private_key_block',
    re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/
  },
  {
    name: 'generic_api_key_assign',
    re: /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token|password)\s*[:=]\s*['"][^'"]{8,}['"]/i
  },
  {
    name: 'bearer_token',
    re: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/i
  }
]

export type SecretScanHit = { name: string; snippet: string }

export function scanMemoryContentForSecrets(content: string): SecretScanHit[] {
  const hits: SecretScanHit[] = []
  for (const { name, re } of PATTERNS) {
    const m = content.match(re)
    if (m?.[0]) {
      const snip = m[0].length > 24 ? `${m[0].slice(0, 12)}…` : m[0]
      hits.push({ name, snippet: snip })
    }
  }
  return hits
}

export function assertNoSecretsInMemory(content: string): void {
  const hits = scanMemoryContentForSecrets(content)
  if (hits.length === 0) return
  const detail = hits.map((h) => `${h.name}(${h.snippet})`).join(', ')
  throw new Error(
    `Memory write blocked: possible secret(s) detected — ${detail}. Never store credentials in memory files.`
  )
}

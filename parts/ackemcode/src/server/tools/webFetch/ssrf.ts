import { isIP } from 'node:net'
import { lookup as dnsLookup } from 'node:dns/promises'

/**
 * SSRF guard aligned with Claude Code hooks/ssrfGuard intent for outbound fetches.
 * WebFetch additionally blocks loopback (agent should not hit local services by default).
 */

export function isBlockedV4(address: string, opts?: { allowLoopback?: boolean }): boolean {
  const parts = address.split('.').map(Number)
  const [a, b] = parts
  if (parts.length !== 4 || a === undefined || b === undefined || parts.some(Number.isNaN)) {
    return false
  }
  if (a === 127) return !opts?.allowLoopback
  if (a === 0) return true
  if (a === 10) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 192 && b === 168) return true
  return false
}

export function isBlockedV6(address: string, opts?: { allowLoopback?: boolean }): boolean {
  const lower = address.toLowerCase()
  if (lower === '::1') return !opts?.allowLoopback
  if (lower === '::') return true
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
    return true
  }
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isBlockedV4(mapped[1]!, opts)
  return false
}

export function isBlockedAddress(address: string, opts?: { allowLoopback?: boolean }): boolean {
  const v = isIP(address)
  if (v === 4) return isBlockedV4(address, opts)
  if (v === 6) return isBlockedV6(address, opts)
  return false
}

export async function assertSafeHostname(
  hostname: string,
  opts?: { allowLoopback?: boolean }
): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) {
    if (isBlockedAddress(host, opts)) {
      throw new Error(`Blocked address (SSRF): ${host}`)
    }
    return
  }
  const lower = host.toLowerCase()
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.local')) {
    if (!opts?.allowLoopback) {
      throw new Error(`Blocked hostname (SSRF): ${host}`)
    }
  }
  const results = await dnsLookup(host, { all: true })
  for (const r of results) {
    if (isBlockedAddress(r.address, opts)) {
      throw new Error(`Blocked resolved address (SSRF): ${host} → ${r.address}`)
    }
  }
}

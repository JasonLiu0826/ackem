import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { kvGet, kvSet } from '../../db/repos/kv'
import { getDatabase } from '../../db/database'
import type { AttentionBudgetState, UserExtensionProfile } from './types'

const KV_NS = 'extensions.policy'
const KV_KEY = 'main'
import { DEFAULT_PROACTIVE_PER_HOUR } from './types'

export interface PolicyStoreFile extends AttentionBudgetState {
  profile?: UserExtensionProfile
}

function policyPath(dataRoot: string): string {
  return join(dataRoot, 'extensions', 'policy.json')
}

export function defaultPolicyStore(): PolicyStoreFile {
  return {
    proactiveMessagesPerHour: DEFAULT_PROACTIVE_PER_HOUR,
    lastProactiveAt: [],
    categoryCooldown: {},
    profile: {
      extensionPreference: {},
      extensionSnoozeUntil: {},
      lastRejectAt: {}
    }
  }
}

function mergePolicyRaw(raw: Partial<PolicyStoreFile>): PolicyStoreFile {
  return {
    ...defaultPolicyStore(),
    ...raw,
    lastProactiveAt: Array.isArray(raw.lastProactiveAt) ? raw.lastProactiveAt : [],
    categoryCooldown: raw.categoryCooldown ?? {},
    profile: {
      extensionPreference: raw.profile?.extensionPreference ?? {},
      extensionSnoozeUntil: raw.profile?.extensionSnoozeUntil ?? {},
      lastRejectAt: raw.profile?.lastRejectAt ?? {}
    }
  }
}

export function loadPolicyStore(dataRoot: string): PolicyStoreFile {
  if (getDatabase(dataRoot)) {
    const blob = kvGet(dataRoot, KV_NS, KV_KEY)
    if (blob) {
      try {
        return mergePolicyRaw(JSON.parse(blob) as Partial<PolicyStoreFile>)
      } catch {
        /* fall through */
      }
    }
  }
  const path = policyPath(dataRoot)
  if (!existsSync(path)) return defaultPolicyStore()
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<PolicyStoreFile>
    const merged = mergePolicyRaw(raw)
    kvSet(dataRoot, KV_NS, KV_KEY, JSON.stringify(merged))
    return merged
  } catch {
    return defaultPolicyStore()
  }
}

export function savePolicyStore(dataRoot: string, state: PolicyStoreFile): void {
  const path = policyPath(dataRoot)
  mkdirSync(dirname(path), { recursive: true })
  const body = JSON.stringify(state, null, 2)
  writeFileSync(path, body, 'utf-8')
  kvSet(dataRoot, KV_NS, KV_KEY, body)
}

export function loadAttentionBudgetFromStore(dataRoot: string): AttentionBudgetState {
  const s = loadPolicyStore(dataRoot)
  return {
    proactiveMessagesPerHour: s.proactiveMessagesPerHour,
    lastProactiveAt: s.lastProactiveAt,
    globalDnd: s.globalDnd,
    categoryCooldown: s.categoryCooldown
  }
}

export function saveAttentionBudgetToStore(
  dataRoot: string,
  budget: AttentionBudgetState
): void {
  const store = loadPolicyStore(dataRoot)
  savePolicyStore(dataRoot, { ...store, ...budget })
}

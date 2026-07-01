import type { DispatchCatalogEntry } from '../protocols'
import type { ExtensionPreference } from './types'
import { loadPolicyStore, savePolicyStore } from './policyStore'

const REJECT_COOLDOWN_MS = 2 * 60 * 60 * 1000

export function loadUserProfile(dataRoot: string) {
  return loadPolicyStore(dataRoot).profile ?? {
    extensionPreference: {},
    extensionSnoozeUntil: {},
    lastRejectAt: {}
  }
}

export function isExtensionSnoozed(
  dataRoot: string,
  extensionId: string,
  now = Date.now()
): boolean {
  const until = loadUserProfile(dataRoot).extensionSnoozeUntil[extensionId]
  return typeof until === 'number' && until > now
}

export function getExtensionPreference(
  dataRoot: string,
  extensionId: string
): ExtensionPreference | undefined {
  return loadUserProfile(dataRoot).extensionPreference[extensionId]
}

/** Step 1 前：过滤用户永久拒绝 / 临时静音的扩展 */
export function filterDispatchedCatalogByProfile(
  catalog: DispatchCatalogEntry[],
  dataRoot: string,
  now = Date.now()
): DispatchCatalogEntry[] {
  return catalog.filter((entry) => {
    const pref = getExtensionPreference(dataRoot, entry.id)
    if (pref === 'deny') return false
    if (isExtensionSnoozed(dataRoot, entry.id, now)) return false
    return true
  })
}

export function recordExtensionReject(
  dataRoot: string,
  extensionId: string,
  options?: { remember?: boolean; snoozeMs?: number }
): void {
  const store = loadPolicyStore(dataRoot)
  const profile = store.profile ?? {
    extensionPreference: {},
    extensionSnoozeUntil: {},
    lastRejectAt: {}
  }
  const now = Date.now()
  if (options?.remember) {
    profile.extensionPreference[extensionId] = 'deny'
  } else {
    profile.lastRejectAt[extensionId] = now
    if (options?.snoozeMs) {
      profile.extensionSnoozeUntil[extensionId] = now + options.snoozeMs
    }
  }
  savePolicyStore(dataRoot, { ...store, profile })
}

export function recordExtensionAllow(
  dataRoot: string,
  extensionId: string,
  remember?: boolean
): void {
  if (!remember) return
  const store = loadPolicyStore(dataRoot)
  const profile = store.profile ?? {
    extensionPreference: {},
    extensionSnoozeUntil: {},
    lastRejectAt: {}
  }
  profile.extensionPreference[extensionId] = 'allow'
  delete profile.lastRejectAt[extensionId]
  savePolicyStore(dataRoot, { ...store, profile })
}

/** dispatched LLM 置信度微调（JP-B） */
export function getDispatchedConfidenceDelta(
  dataRoot: string,
  extensionId: string,
  sessionRejected: boolean,
  now = Date.now()
): number {
  let delta = 0
  if (getExtensionPreference(dataRoot, extensionId) === 'allow') {
    return 0.12
  }
  if (sessionRejected) delta -= 0.2
  const lastReject = loadUserProfile(dataRoot).lastRejectAt[extensionId]
  if (lastReject && now - lastReject < REJECT_COOLDOWN_MS) {
    delta -= 0.15
  }
  return delta
}

/** 用户已记住「允许」时可直接 auto_invoke */
export function shouldForceAutoInvoke(
  dataRoot: string,
  extensionId: string
): boolean {
  return getExtensionPreference(dataRoot, extensionId) === 'allow'
}

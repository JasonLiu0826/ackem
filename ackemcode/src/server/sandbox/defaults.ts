/**
 * F-04 / Batch 7 — sandbox default only when platform + deps allow (CC spirit).
 */
import {
  SandboxManager as BaseSandboxManager
} from '@anthropic-ai/sandbox-runtime'

export function resolveDefaultSandboxEnabled(): boolean {
  try {
    if (!BaseSandboxManager.isSupportedPlatform()) return false
    return BaseSandboxManager.checkDependencies().errors.length === 0
  } catch {
    return false
  }
}

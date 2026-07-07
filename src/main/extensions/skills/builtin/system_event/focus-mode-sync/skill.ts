import { loadSettings } from '../../../../../settings'
import { resolveDataRoot } from '../../../../../paths'
import {
  clearGlobalDnd,
  setGlobalDnd
} from '../../../../policy/attentionBudget'
import type { EngineSnapshot } from '../../../../protocols'
import type { SkillHandler, SkillInvocation, SkillResult } from '../../../types'
import { detectFocusAssistActive } from './focusDetect'
import { FOCUS_DND_REASON, FOCUS_MODE_SYNC_MANIFEST } from './manifest'

let lastKnownFocus: boolean | null = null

export function resetFocusModeSyncState(): void {
  lastKnownFocus = null
}

function resolveDataRootForSkill(): string {
  if (process.env.Ackem_TEST_DATA_ROOT) {
    return process.env.Ackem_TEST_DATA_ROOT
  }
  try {
    return resolveDataRoot(loadSettings())
  } catch {
    return ''
  }
}

async function execute(invocation: SkillInvocation): Promise<SkillResult> {
  const start = Date.now()
  const dataRoot = resolveDataRootForSkill()
  const detected = detectFocusAssistActive()

  if (detected === null) {
    return {
      ok: true,
      output: '',
      injectToContext: false,
      events: [],
      durationMs: Date.now() - start
    }
  }

  if (detected) {
    setGlobalDnd(dataRoot, Date.now() + 365 * 24 * 60 * 60 * 1000, FOCUS_DND_REASON)
  } else {
    clearGlobalDnd(dataRoot, FOCUS_DND_REASON)
  }

  lastKnownFocus = detected

  return {
    ok: true,
    output: '',
    injectToContext: false,
    events: [
      {
        id: `evt-focus-${Date.now()}`,
        category: 'skill',
        sourceId: FOCUS_MODE_SYNC_MANIFEST.id,
        type: detected ? 'focus_mode:active' : 'focus_mode:cleared',
        payload: { active: detected },
        injectToContext: false,
        timestamp: new Date().toISOString()
      }
    ],
    data: { focusActive: detected },
    durationMs: Date.now() - start
  }
}

async function shouldActivate(_snapshot: EngineSnapshot): Promise<boolean> {
  const detected = detectFocusAssistActive()
  if (detected === null) return false
  if (lastKnownFocus === null) return true
  return detected !== lastKnownFocus
}

async function getProactiveInvocation(snapshot: EngineSnapshot): Promise<SkillInvocation> {
  return {
    invocationId: `focus-${Date.now()}`,
    skillId: FOCUS_MODE_SYNC_MANIFEST.id,
    trigger: 'scheduled',
    triggerDetail: 'autonomous:system_poll',
    snapshot
  }
}

export const focusModeSyncSkill: SkillHandler = {
  manifest: FOCUS_MODE_SYNC_MANIFEST,
  execute,
  shouldActivate,
  getProactiveInvocation
}

import { loadSettings } from '../../../../../settings'
import { resolveDataRoot } from '../../../../../paths'
import type { SkillHandler, SkillInvocation, SkillResult } from '../../../types'
import { FILE_OPS_MANIFEST } from './manifest'
import {
  listStaging,
  readStagingFile,
  writeStagingFile
} from './fileOpsStorage'

function resolveDataRootForSkill(): string {
  try {
    return resolveDataRoot(loadSettings())
  } catch {
    return process.env.Ackem_TEST_DATA_ROOT ?? ''
  }
}

async function execute(invocation: SkillInvocation): Promise<SkillResult> {
  const start = Date.now()
  const dataRoot = resolveDataRootForSkill()
  const action = String(invocation.args?.action ?? 'list').trim()
  const path = typeof invocation.args?.path === 'string' ? invocation.args.path : ''
  const content = typeof invocation.args?.content === 'string' ? invocation.args.content : ''

  try {
    if (action === 'list') {
      const files = listStaging(dataRoot)
      return {
        ok: true,
        output: files.length ? `staging 鏂囦欢锛?{files.join(', ')}` : 'staging 鐩綍涓虹┖銆?,
        injectToContext: true,
        events: [],
        data: { files },
        durationMs: Date.now() - start
      }
    }
    if (action === 'read') {
      const text = readStagingFile(dataRoot, path)
      return {
        ok: true,
        output: text.slice(0, 4000),
        injectToContext: true,
        events: [],
        data: { path },
        durationMs: Date.now() - start
      }
    }
    if (action === 'write') {
      const saved = writeStagingFile(dataRoot, path, content)
      return {
        ok: true,
        output: `宸插啓鍏?staging/${saved}`,
        injectToContext: true,
        events: [],
        data: { path: saved },
        durationMs: Date.now() - start
      }
    }
    return {
      ok: false,
      output: '',
      error: 'unknown action',
      injectToContext: false,
      events: [],
      durationMs: Date.now() - start
    }
  } catch (err) {
    return {
      ok: false,
      output: '',
      error: err instanceof Error ? err.message : String(err),
      injectToContext: false,
      events: [],
      durationMs: Date.now() - start
    }
  }
}

export const fileOpsSkill: SkillHandler = {
  manifest: FILE_OPS_MANIFEST,
  execute
}

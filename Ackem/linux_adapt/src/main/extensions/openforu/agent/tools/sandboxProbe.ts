import type { ArtifactBundle } from '../bundleTypes'
import {
  runSandboxProbeUpluginTool,
  SANDBOX_PROBE_UPLUGIN_TOOL_ID,
  type SandboxProbeUpluginToolResult
} from './sandboxProbeUplugin'

/** W6：Repair / Deploy 统一探测工具 ID（uplugin 走 Worker 探测） */
export const SANDBOX_PROBE_TOOL_ID = 'sandbox_probe'

export { SANDBOX_PROBE_UPLUGIN_TOOL_ID }

export type SandboxProbeToolResult = SandboxProbeUpluginToolResult

export async function runSandboxProbeTool(
  bundle: ArtifactBundle,
  dataRoot: string
): Promise<SandboxProbeToolResult> {
  if (bundle.kind === 'uplugin') {
    return runSandboxProbeUpluginTool(bundle, dataRoot)
  }
  return {
    ok: true,
    skipped: true,
    skipReason: `${SANDBOX_PROBE_TOOL_ID}: 仅 uplugin 需要 Worker 探测`,
    errors: [],
    logs: [],
    durationMs: 0
  }
}

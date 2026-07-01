import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { UpluginArtifactBundle } from '../bundleTypes'
import { UpluginSandboxHost } from '../../sandbox/upluginSandboxHost'
import type { SandboxProbeResult } from '../../sandbox/sandboxTypes'

export const SANDBOX_PROBE_UPLUGIN_TOOL_ID = 'sandbox_probe_uplugin'

export type SandboxProbeUpluginToolResult = SandboxProbeResult & {
  skipped?: boolean
  skipReason?: string
}

/**
 * JE-1f：Agent Repair / Deploy 前探测 uplugin Worker（staticScan + esbuild + beforeUserMessage probe）
 */
export async function runSandboxProbeUpluginTool(
  bundle: UpluginArtifactBundle,
  dataRoot: string
): Promise<SandboxProbeUpluginToolResult> {
  const mainTs = bundle.files['main.ts']?.trim()
  if (!mainTs) {
    return {
      ok: true,
      skipped: true,
      skipReason: 'template-only uplugin（无 main.ts，跳过 Worker 探测）',
      errors: [],
      logs: [],
      durationMs: 0
    }
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'ackem-sandbox-probe-'))
  const pluginDir = join(tmpDir, bundle.dirName || 'probe')
  mkdirSync(pluginDir, { recursive: true })
  writeFileSync(join(pluginDir, 'main.ts'), mainTs.endsWith('\n') ? mainTs : `${mainTs}\n`)
  if (bundle.files['manifest.json']) {
    writeFileSync(join(pluginDir, 'manifest.json'), bundle.files['manifest.json'])
  }

  const host = new UpluginSandboxHost(dataRoot)
  return host.probe(mainTs, bundle.manifest, pluginDir)
}

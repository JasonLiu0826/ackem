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
 * JE-1f锛欰gent Repair / Deploy 鍓嶆帰娴?uplugin Worker锛坰taticScan + esbuild + beforeUserMessage probe锛?
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
      skipReason: 'template-only uplugin锛堟棤 main.ts锛岃烦杩?Worker 鎺㈡祴锛?,
      errors: [],
      logs: [],
      durationMs: 0
    }
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'Ackem-sandbox-probe-'))
  const pluginDir = join(tmpDir, bundle.dirName || 'probe')
  mkdirSync(pluginDir, { recursive: true })
  writeFileSync(join(pluginDir, 'main.ts'), mainTs.endsWith('\n') ? mainTs : `${mainTs}\n`)
  if (bundle.files['manifest.json']) {
    writeFileSync(join(pluginDir, 'manifest.json'), bundle.files['manifest.json'])
  }

  const host = new UpluginSandboxHost(dataRoot)
  return host.probe(mainTs, bundle.manifest, pluginDir)
}

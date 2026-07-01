import type { ArtifactBundle } from './bundleTypes'

/** 将内存中的 manifest/skill/meta 写回 bundle.files（staging / deploy 用） */
export function syncBundleFiles(bundle: ArtifactBundle): void {
  bundle.files['manifest.json'] = `${JSON.stringify(bundle.manifest, null, 2)}\n`
  if (bundle.kind === 'uskill') {
    bundle.files['skill.json'] = `${JSON.stringify(bundle.skillConfig, null, 2)}\n`
  } else {
    bundle.files['plugin.meta.json'] = `${JSON.stringify(bundle.meta, null, 2)}\n`
    const surfaceHtml = bundle.files['surface.html'] ?? bundle.meta.surface?.html
    if (surfaceHtml?.trim()) {
      bundle.files['surface.html'] = surfaceHtml
    }
  }
}

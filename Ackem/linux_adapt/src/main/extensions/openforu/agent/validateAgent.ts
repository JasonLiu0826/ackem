import {
  assertValidGeneratedUplugin,
  assertValidGeneratedUskill,
  validateGeneratedUplugin,
  validateGeneratedUskill
} from '../validator'
import { staticScan } from '../sandbox/staticScan'
import type { ArtifactBundle } from './bundleTypes'

export function validateArtifactBundle(bundle: ArtifactBundle): string[] {
  if (bundle.kind === 'uskill') {
    return validateGeneratedUskill(bundle.manifest, bundle.skillConfig)
  }

  const errors = validateGeneratedUplugin(bundle.manifest, bundle.meta, bundle.files)
  const mainTs = bundle.files['main.ts']
  if (mainTs?.trim()) {
    for (const issue of staticScan(mainTs)) {
      errors.push(`main.ts: ${issue}`)
    }
  }
  return errors
}

export function assertValidArtifactBundle(bundle: ArtifactBundle): void {
  const errors = validateArtifactBundle(bundle)
  if (errors.length) {
    throw new Error(errors.join('; '))
  }
  if (bundle.kind === 'uskill') {
    assertValidGeneratedUskill(bundle.manifest, bundle.skillConfig)
  } else {
    assertValidGeneratedUplugin(bundle.manifest, bundle.meta, bundle.files)
  }
}

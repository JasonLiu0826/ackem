import { describe, expect, it } from 'vitest'
import {
  ACKEM_ENGINE_API_VERSION,
  buildAckemExtensionPackage,
  formatExtensionId,
  generatePublisherKeyPair,
  isCommunityExtensionId,
  isOfficialExtensionId,
  isUserExtensionId,
  parseExtensionId,
  semverSatisfies,
  validateExtensionManifest,
  verifyAckemExtensionPackage
} from './index'

describe('ecosystem extensionId', () => {
  it('parses ackem/community/u namespaces', () => {
    expect(parseExtensionId('ackem/web-search@1.0.0')?.scope).toBe('ackem')
    expect(parseExtensionId('community/hello-world@2.1.0')?.scope).toBe('community')
    expect(parseExtensionId('u/my-timer@1.0.0')?.scope).toBe('u')
    expect(parseExtensionId('invalid/foo')).toBeNull()
  })

  it('formatExtensionId round-trips slug', () => {
    expect(formatExtensionId('community', 'demo-skill', '1.0.0')).toBe('community/demo-skill@1.0.0')
    expect(isCommunityExtensionId('community/demo-skill@1.0.0')).toBe(true)
    expect(isOfficialExtensionId('ackem/foo@1.0.0')).toBe(true)
    expect(isUserExtensionId('u/foo@1.0.0')).toBe(true)
  })
})

describe('ecosystem semverRange', () => {
  it('matches common ranges', () => {
    expect(semverSatisfies('1.0.0', '^1.0.0')).toBe(true)
    expect(semverSatisfies('1.2.3', '^1.0.0')).toBe(true)
    expect(semverSatisfies('2.0.0', '^1.0.0')).toBe(false)
    expect(semverSatisfies('0.0.0', '>=0.0.0 <1.0.0')).toBe(true)
    expect(semverSatisfies('1.0.0', '>=0.0.0 <1.0.0')).toBe(false)
  })
})

describe('ecosystem manifestValidate', () => {
  it('requires engineApiVersion for community/', () => {
    const result = validateExtensionManifest({
      id: 'community/demo@1.0.0',
      name: 'Demo',
      version: '1.0.0',
      category: 'skill',
      description: 'test',
      author: 'test',
      license: 'MIT',
      main: 'skill.json',
      engineVersion: '>=0.0.0 <1.0.0'
    })
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('engineApiVersion'))).toBe(true)
  })

  it('accepts compatible community manifest', () => {
    const result = validateExtensionManifest({
      id: 'community/demo@1.0.0',
      name: 'Demo',
      version: '1.0.0',
      category: 'skill',
      description: 'test',
      author: 'test',
      license: 'MIT',
      main: 'skill.json',
      engineVersion: '>=0.0.0 <1.0.0',
      engineApiVersion: `^${ACKEM_ENGINE_API_VERSION}`
    })
    expect(result.ok).toBe(true)
  })
})

describe('ecosystem package signing', () => {
  it('builds and verifies signed .ackem-ext package', () => {
    const keys = generatePublisherKeyPair('test-publisher:2026')
    const manifest = {
      id: 'community/plug-demo@1.0.0',
      name: 'Plug Demo',
      version: '1.0.0',
      category: 'skill' as const,
      skillType: 'rule' as const,
      description: 'plug test',
      author: 'test',
      license: 'MIT',
      main: 'skill.json',
      engineVersion: '>=0.0.0 <1.0.0',
      engineApiVersion: `^${ACKEM_ENGINE_API_VERSION}`,
      triggers: ['keyword'],
      keywords: ['plug-demo'],
      permissions: ['engine_read', 'engine_inject', 'readonly'],
      dispatch: {
        mode: 'dispatched' as const,
        subtype: 'keyword_hint' as const,
        time: { habits: [], scenarios: [], keywords: ['plug-demo'] },
        habits: ['用户说 plug-demo'],
        scenarios: ['测试'],
        summary: 'plug demo',
        keywords: ['plug-demo']
      }
    }
    const skillJson = JSON.stringify(
      {
        version: '1.0.0',
        promptTemplates: {
          contextInjection: '【社区扩展】用户触发了 plug-demo，请简短确认。'
        }
      },
      null,
      2
    )
    const manifestJson = JSON.stringify(manifest, null, 2)
    const files = {
      'manifest.json': manifestJson,
      'skill.json': skillJson
    }
    const pkg = buildAckemExtensionPackage({
      publisherId: keys.publisherId,
      manifest,
      files,
      privateKeyPem: keys.privateKeyPem
    })
    expect(pkg.format).toBe('ackem-ext')
    expect(pkg.signature.manifestId).toBe('community/plug-demo@1.0.0')
  })
})

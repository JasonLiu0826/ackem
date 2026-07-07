import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'

import { SkillRegistry } from '../skills/registry'
import { PluginRegistry } from '../plugins/registry'
import {
  Ackem_ENGINE_API_VERSION,
  buildAckemExtensionPackage,
  CommunityExtensionLoader,
  generatePublisherKeyPair,
  installCommunityPackage,
  upsertTrustedPublisher
} from './index'

describe('ecosystem plug-and-play', () => {
  it('installs signed community skill and loads into SkillRegistry via coordinator path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'Ackem-eco-'))
    const keys = generatePublisherKeyPair('Ackem-test:2026')
    upsertTrustedPublisher(root, keys.publisherId, {
      name: 'Ackem Test Publisher',
      algorithm: 'ed25519',
      publicKey: keys.publicKeyPem,
      scopes: ['community/*']
    })

    const manifest = {
      id: 'community/plug-demo@1.0.0',
      name: 'Plug Demo',
      version: '1.0.0',
      category: 'skill' as const,
      skillType: 'rule' as const,
      description: '鎻掓嫈娴嬭瘯 Skill',
      author: 'Ackem Test',
      license: 'MIT',
      main: 'skill.json',
      engineVersion: '>=0.0.0 <1.0.0',
      engineApiVersion: `^${Ackem_ENGINE_API_VERSION}`,
      triggers: ['keyword'] as const,
      keywords: ['plug-demo'],
      permissions: ['engine_read', 'engine_inject', 'readonly'],
      dispatch: {
        mode: 'dispatched' as const,
        subtype: 'keyword_hint' as const,
        time: { habits: [], scenarios: [], keywords: ['plug-demo'] },
        habits: ['鐢ㄦ埛璇?plug-demo'],
        scenarios: ['鎻掓嫈娴嬭瘯'],
        summary: '鎻掓嫈 demo',
        keywords: ['plug-demo']
      }
    }
    const skillJson = JSON.stringify(
      {
        version: '1.0.0',
        promptTemplates: {
          contextInjection: '銆愮ぞ鍖烘墿灞?plug-demo銆戝凡瑙﹀彂锛岃鐢ㄤ即渚ｈ姘旂畝鐭洖搴斻€?
        }
      },
      null,
      2
    )
    const manifestJson = JSON.stringify(manifest, null, 2)
    const pkg = buildAckemExtensionPackage({
      publisherId: keys.publisherId,
      manifest,
      files: {
        'manifest.json': manifestJson,
        'skill.json': skillJson
      },
      privateKeyPem: keys.privateKeyPem
    })

    const verify = installCommunityPackage(root, pkg)
    expect(verify.ok).toBe(true)
    expect(verify.data?.id).toBe('community/plug-demo@1.0.0')

    const skills = new SkillRegistry(join(root, 'extensions', 'skills'))
    const plugins = new PluginRegistry(join(root, 'extensions', 'plugins'))
    skills.loadRegistry()

    const loader = new CommunityExtensionLoader(root, skills, plugins)
    await loader.scanSkills()

    const instance = loader.getSkill('community/plug-demo@1.0.0')
    expect(instance).toBeDefined()
    expect(instance?.status).toBe('active')
    expect(instance?.publisherId).toBe(keys.publisherId)

    const handler = skills.getHandler('community/plug-demo@1.0.0')
    expect(handler).toBeDefined()

    const result = await handler!.execute({
      invocationId: 'test-invoke',
      skillId: 'community/plug-demo@1.0.0',
      trigger: 'keyword',
      triggerDetail: 'plug-demo',
      snapshot: {
        personality: { presetId: 'default', T: 50, I: 50, S: 50, O: 50, R: 50, tags: [] },
        emotion: { aff: 0, sec: 0, aro: 0, dom: 0, primaryLabel: 'neutral', isLocked: false },
        relationship: {
          stage: 'STRANGER',
          trust: 0,
          rifts: 0,
          atmosphere: 'neutral',
          sharedEventsCount: 0,
          consecutivePositiveTurns: 0
        },
        memory: { activeFactCount: 0, recentFactSummaries: [], kgNodeCount: 0, episodeCount: 0 },
        totalTurns: 0,
        adultMode: false,
        capturedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        sessionId: 'test'
      }
    })
    expect(result.ok).toBe(true)
    expect(result.injectToContext).toBe(true)
    expect(result.events?.[0]?.contextInjection).toContain('plug-demo')
  })

  it('rejects unsigned community install without trusted publisher', async () => {
    const root = mkdtempSync(join(tmpdir(), 'Ackem-eco-bad-'))
    const keys = generatePublisherKeyPair('unknown:2026')
    const manifest = {
      id: 'community/bad@1.0.0',
      name: 'Bad',
      version: '1.0.0',
      category: 'skill' as const,
      skillType: 'rule' as const,
      description: 'bad',
      author: 'x',
      license: 'MIT',
      main: 'skill.json',
      engineVersion: '>=0.0.0 <1.0.0',
      engineApiVersion: `^${Ackem_ENGINE_API_VERSION}`,
      triggers: ['keyword'] as const,
      keywords: ['bad'],
      permissions: ['readonly'],
      dispatch: {
        mode: 'dispatched' as const,
        time: { habits: [], scenarios: [], keywords: ['bad'] },
        habits: [],
        scenarios: [],
        summary: 'bad',
        keywords: ['bad']
      }
    }
    const files = {
      'manifest.json': JSON.stringify(manifest, null, 2),
      'skill.json': JSON.stringify({ version: '1.0.0', onKeyword: { reply: 'bad' } }, null, 2)
    }
    const pkg = buildAckemExtensionPackage({
      publisherId: keys.publisherId,
      manifest,
      files,
      privateKeyPem: keys.privateKeyPem
    })
    const result = installCommunityPackage(root, pkg)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('鏈俊浠荤殑鍙戝竷鑰?)
  })
})

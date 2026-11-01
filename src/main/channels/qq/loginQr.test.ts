import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { describeNapcatError, hashWebuiToken, toQrDataUrl } from './loginQr'
import {
  QQ_WEBUI_DEFAULT_BASE,
  isValidWebuiBaseUrl,
  loadQqWebuiConfig,
  normalizeWebuiBaseUrl,
  saveQqWebuiConfig
} from './webuiConfig'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ackem-qq-webui-'))
  tempRoots.push(root)
  return root
}

describe('hashWebuiToken', () => {
  it('matches NapCat sha256(token + ".napcat")', () => {
    const expected = createHash('sha256').update('secret.napcat').digest('hex')
    expect(hashWebuiToken('secret')).toBe(expected)
  })
})

describe('toQrDataUrl', () => {
  it('passes through a data url', async () => {
    const raw = 'data:image/png;base64,AAAA'
    await expect(toQrDataUrl(raw)).resolves.toBe(raw)
  })

  it('wraps a base64 png', async () => {
    await expect(toQrDataUrl('iVBORw0KGgo=')).resolves.toBe('data:image/png;base64,iVBORw0KGgo=')
  })

  it('renders a scan string into a qr image', async () => {
    const out = await toQrDataUrl('https://accounts.qq.com/example?token=abc')
    expect(out.startsWith('data:image/png;base64,')).toBe(true)
    expect(out.length).toBeGreaterThan(100)
  })

  it('rejects empty content', async () => {
    await expect(toQrDataUrl('   ')).rejects.toThrow()
  })
})

describe('describeNapcatError', () => {
  const base = 'http://127.0.0.1:6099'

  it('explains connection failures', () => {
    expect(describeNapcatError(new Error('fetch failed: connect ECONNREFUSED'), base)).toContain(
      '连不上 NapCat WebUI'
    )
  })

  it('explains bad tokens', () => {
    expect(describeNapcatError(new Error('token is invalid'), base)).toContain('令牌不对')
  })

  it('explains already logged in', () => {
    expect(describeNapcatError(new Error('QQ Is Logined'), base)).toContain('已经登录')
  })

  it('keeps unknown errors readable', () => {
    expect(describeNapcatError(new Error('boom'), base)).toBe('boom')
  })
})

describe('webui config url normalization', () => {
  it('accepts the webui page url and api url', () => {
    expect(normalizeWebuiBaseUrl('http://127.0.0.1:6099/webui')).toBe('http://127.0.0.1:6099')
    expect(normalizeWebuiBaseUrl('http://127.0.0.1:6099/api/')).toBe('http://127.0.0.1:6099')
    expect(normalizeWebuiBaseUrl('  http://127.0.0.1:6099/  ')).toBe('http://127.0.0.1:6099')
  })

  it('falls back to the default base', () => {
    expect(normalizeWebuiBaseUrl('')).toBe(QQ_WEBUI_DEFAULT_BASE)
  })

  it('rejects non-http schemes', () => {
    expect(isValidWebuiBaseUrl('ftp://127.0.0.1:6099')).toBe(false)
    expect(isValidWebuiBaseUrl('http://127.0.0.1:6099')).toBe(true)
  })
})

describe('webui config persistence', () => {
  it('saves and reads back a normalized config', () => {
    const root = tempRoot()
    const saved = saveQqWebuiConfig(root, {
      baseUrl: 'http://127.0.0.1:6099/webui',
      token: ' secret '
    })
    expect(saved).toEqual({ baseUrl: 'http://127.0.0.1:6099', token: 'secret' })
    expect(loadQqWebuiConfig(root)).toEqual({ baseUrl: 'http://127.0.0.1:6099', token: 'secret' })
  })

  it('keeps the saved token when only the base url changes', () => {
    const root = tempRoot()
    saveQqWebuiConfig(root, { baseUrl: 'http://127.0.0.1:6099', token: 'secret' })
    const saved = saveQqWebuiConfig(root, { baseUrl: 'http://192.168.1.5:6099' })
    expect(saved).toEqual({ baseUrl: 'http://192.168.1.5:6099', token: 'secret' })
  })

  it('throws on a bad base url', () => {
    expect(() => saveQqWebuiConfig(tempRoot(), { baseUrl: 'ftp://x', token: 's' })).toThrow()
  })

  it('returns defaults when no file exists', () => {
    expect(loadQqWebuiConfig(tempRoot())).toEqual({
      baseUrl: QQ_WEBUI_DEFAULT_BASE,
      token: ''
    })
  })
})

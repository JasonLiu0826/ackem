import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'

import {
  hashWebuiToken,
  pollQqLogin,
  refreshQqLogin,
  startQqLogin
} from './loginQr'
import type { QqWebuiConfig } from './webuiConfig'

type MockResult = { status?: number; json: unknown }

/**
 * 起一个假的 NapCat WebUI，验证真实的鉴权头、请求体和响应解析。
 * 不需要 Docker，也不会碰真实 QQ。
 */
async function withMockNapcat(
  route: (req: IncomingMessage, body: string) => MockResult | undefined,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const body = Buffer.concat(chunks).toString('utf-8')
    const result = route(req, body)
    if (!result) {
      res.statusCode = 404
      res.end('{}')
      return
    }
    res.statusCode = result.status ?? 200
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(result.json))
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

function qrRoute(
  overrides: { loginStatus?: unknown; qrcode?: string; refresh?: string; getFails?: boolean } = {}
) {
  return (req: IncomingMessage, body: string): MockResult | undefined => {
    const url = req.url ?? ''
    if (url === '/api/auth/login') {
      const parsed = JSON.parse(body) as { hash?: string }
      if (parsed.hash !== hashWebuiToken('secret')) {
        return { json: { code: -1, message: 'token is invalid' } }
      }
      return { json: { code: 0, data: { Credential: 'cred-1' } } }
    }
    if (req.headers.authorization !== 'Bearer cred-1') {
      return { json: { code: -1, message: 'Unauthorized' } }
    }
    if (url === '/api/QQLogin/CheckLoginStatus') {
      return {
        json: {
          code: 0,
          data: overrides.loginStatus ?? {
            isLogin: false,
            isOffline: false,
            loginPhase: 'waiting_qrcode'
          }
        }
      }
    }
    if (url === '/api/QQLogin/GetQQLoginQrcode') {
      if (overrides.getFails) return { json: { code: -1, message: 'QRCode Get Error' } }
      return {
        json: {
          code: 0,
          data: { qrcode: overrides.qrcode ?? 'https://accounts.qq.com/qr/abc' }
        }
      }
    }
    if (url === '/api/QQLogin/RefreshQRcode') {
      return {
        json: {
          code: 0,
          data: { qrcodeurl: overrides.refresh ?? 'https://accounts.qq.com/qr/def' }
        }
      }
    }
    return undefined
  }
}

const config = (baseUrl: string, token = 'secret'): QqWebuiConfig => ({ baseUrl, token })

describe('NapCat login flow', () => {
  it('logs in, fetches a QR and polls status', async () => {
    await withMockNapcat(qrRoute(), async (baseUrl) => {
      const cfg = config(baseUrl)

      const started = await startQqLogin(cfg)
      expect(started.ok).toBe(true)
      if (!started.ok) throw new Error(started.error)
      expect(started.alreadyLoggedIn).toBe(false)
      if (started.alreadyLoggedIn) throw new Error('unexpected alreadyLoggedIn')
      expect(started.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true)

      const polled = await pollQqLogin(cfg)
      expect(polled.ok).toBe(true)
      if (!polled.ok) throw new Error(polled.error)
      expect(polled.status.phase).toBe('waiting_qrcode')
      expect(polled.status.isLogin).toBe(false)

      const refreshed = await refreshQqLogin(cfg)
      expect(refreshed.ok).toBe(true)
      if (!refreshed.ok) throw new Error(refreshed.error)
      expect(refreshed.alreadyLoggedIn).toBe(false)
    })
  })

  it('falls back to RefreshQRcode when Get returns QRCode Get Error', async () => {
    await withMockNapcat(qrRoute({ getFails: true }), async (baseUrl) => {
      const started = await startQqLogin(config(baseUrl))
      expect(started.ok).toBe(true)
      if (!started.ok) throw new Error(started.error)
      expect(started.alreadyLoggedIn).toBe(false)
      if (started.alreadyLoggedIn) throw new Error('unexpected alreadyLoggedIn')
      expect(started.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true)
    })
  })

  it('returns alreadyLoggedIn when NapCat already has a session', async () => {
    await withMockNapcat(
      qrRoute({ loginStatus: { isLogin: true, isOffline: false, loginPhase: 'ready' } }),
      async (baseUrl) => {
        const started = await startQqLogin(config(baseUrl))
        expect(started.ok).toBe(true)
        if (!started.ok) throw new Error(started.error)
        expect(started.alreadyLoggedIn).toBe(true)
        if (!started.alreadyLoggedIn) throw new Error('expected alreadyLoggedIn')
        expect(started.status.phase).toBe('ready')
      }
    )
  })

  it('reports a readable error for a wrong token', async () => {
    await withMockNapcat(qrRoute(), async (baseUrl) => {
      const started = await startQqLogin(config(baseUrl, 'wrong'))
      expect(started.ok).toBe(false)
      if (started.ok) throw new Error('expected failure')
      expect(started.error).toContain('令牌不对')
    })
  })

  it('surfaces two-factor authentication', async () => {
    await withMockNapcat(
      (req, body) => {
        if ((req.url ?? '') === '/api/auth/login') {
          const parsed = JSON.parse(body) as { hash?: string }
          if (parsed.hash === hashWebuiToken('secret')) {
            return { json: { code: 0, data: { require2FA: true } } }
          }
        }
        return undefined
      },
      async (baseUrl) => {
        const started = await startQqLogin(config(baseUrl))
        expect(started.ok).toBe(false)
        if (started.ok) throw new Error('expected failure')
        expect(started.need2FA).toBe(true)
      }
    )
  })
})

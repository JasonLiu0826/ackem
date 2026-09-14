/**
 * OAuthClientProvider for MCP HTTP/SSE — Claude Code mcp/auth.ts spirit.
 * Captures authorization URL (no auto-browser); persists tokens via tokenStore.
 */
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens
} from '@modelcontextprotocol/sdk/shared/auth.js'
import {
  clearOAuthRecord,
  loadOAuthRecord,
  updateOAuthRecord,
  type StoredClientInformation
} from './tokenStore.js'
import { sanitizeMcpName } from './types.js'

export type AckemOAuthProvider = OAuthClientProvider & {
  serverName: string
  serverUrl: string
  /** Last URL from redirectToAuthorization (for UI / authorize tool). */
  lastAuthorizationUrl: string | null
  clearAuthorizationUrl(): void
}

export function getMcpOAuthRedirectUrl(port: number): string {
  return `http://127.0.0.1:${port}/api/mcp/oauth/callback`
}

export function createMcpOAuthProvider(opts: {
  serverName: string
  serverUrl: string
  redirectUrl: string
}): AckemOAuthProvider {
  const serverName = sanitizeMcpName(opts.serverName)
  let lastAuthorizationUrl: string | null = null
  let memoryVerifier: string | undefined
  let memoryClient: OAuthClientInformationMixed | undefined
  let memoryTokens: OAuthTokens | undefined

  const provider: AckemOAuthProvider = {
    serverName,
    serverUrl: opts.serverUrl,
    get lastAuthorizationUrl() {
      return lastAuthorizationUrl
    },
    clearAuthorizationUrl() {
      lastAuthorizationUrl = null
    },

    get redirectUrl() {
      return opts.redirectUrl
    },

    get clientMetadata(): OAuthClientMetadata {
      return {
        client_name: 'AckemCode',
        redirect_uris: [opts.redirectUrl],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        client_uri: 'https://github.com/ackem/ackem-code'
      }
    },

    state() {
      return serverName
    },

    async clientInformation() {
      if (memoryClient) return memoryClient
      const rec = await loadOAuthRecord(serverName)
      return (rec?.clientInformation as OAuthClientInformationMixed | undefined) ?? undefined
    },

    async saveClientInformation(info: OAuthClientInformationMixed) {
      memoryClient = info
      await updateOAuthRecord(serverName, {
        serverUrl: opts.serverUrl,
        clientInformation: info as StoredClientInformation
      })
    },

    async tokens() {
      if (memoryTokens) return memoryTokens
      const rec = await loadOAuthRecord(serverName)
      return rec?.tokens as OAuthTokens | undefined
    },

    async saveTokens(tokens: OAuthTokens) {
      memoryTokens = tokens
      await updateOAuthRecord(serverName, {
        serverUrl: opts.serverUrl,
        tokens: {
          access_token: tokens.access_token,
          token_type: tokens.token_type,
          expires_in: tokens.expires_in,
          scope: tokens.scope,
          refresh_token: tokens.refresh_token
        }
      })
    },

    async redirectToAuthorization(authorizationUrl: URL) {
      lastAuthorizationUrl = authorizationUrl.toString()
    },

    async saveCodeVerifier(codeVerifier: string) {
      memoryVerifier = codeVerifier
      await updateOAuthRecord(serverName, {
        serverUrl: opts.serverUrl,
        codeVerifier
      })
    },

    async codeVerifier() {
      if (memoryVerifier) return memoryVerifier
      const rec = await loadOAuthRecord(serverName)
      if (!rec?.codeVerifier) {
        throw new Error(`No PKCE code verifier for MCP server "${serverName}"`)
      }
      return rec.codeVerifier
    },

    async invalidateCredentials(scope) {
      if (scope === 'all') {
        memoryClient = undefined
        memoryTokens = undefined
        memoryVerifier = undefined
        await clearOAuthRecord(serverName)
        return
      }
      if (scope === 'tokens') {
        memoryTokens = undefined
        await updateOAuthRecord(serverName, { tokens: undefined })
      }
      if (scope === 'client') {
        memoryClient = undefined
        await updateOAuthRecord(serverName, { clientInformation: undefined })
      }
      if (scope === 'verifier') {
        memoryVerifier = undefined
        await updateOAuthRecord(serverName, { codeVerifier: undefined })
      }
    }
  }

  return provider
}

/** Pseudo-tool name (CC McpAuthTool spirit) — appears when server needs OAuth. */
export const MCP_AUTHORIZE_TOOL = 'authorize'

export function mcpAuthorizeToolName(server: string): string {
  return `mcp__${sanitizeMcpName(server)}__${MCP_AUTHORIZE_TOOL}`
}

export function isMcpAuthorizeTool(qualified: string): boolean {
  return /__authorize$/.test(qualified) && qualified.startsWith('mcp__')
}

import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'

export interface IssuedUser {
  sub: string
  email: string
  givenName: string
  tenant: string
  tenantId: string
  roles: string[]
  entitlements: string[]
  puppeteer?: string
}

export interface MockIssuerOptions {
  accessTokenLifetimeSeconds?: number
  rotateRefreshTokens?: boolean
  user?: Partial<IssuedUser>
}

export interface MockIssuer {
  url: string
  clientId: string
  clientSecret: string
  close: () => Promise<void>
  /** Fails the next N token requests with the given OAuth error and status. */
  failNextTokenRequests: (_count: number, _error: string, _status: number) => void
  tokenRequests: () => Array<Record<string, string>>
  revoked: () => string[]
  endSessionRequests: () => Array<Record<string, string>>
  currentRefreshToken: () => string | null
  setUser: (_user: Partial<IssuedUser>) => void
}

const DEFAULT_USER: IssuedUser = {
  sub: 'user-1',
  email: 'owner@example.com',
  givenName: 'Owner',
  tenant: 'rx_test01',
  tenantId: '00000000-0000-0000-0000-000000000001',
  roles: ['urn:activagt:telematic:roles:self-service-owner'],
  entitlements: ['urn:activagt:telematic:self-service']
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ''
    request.on('data', chunk => (body += chunk))
    request.on('end', () => resolve(body))
  })
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  response.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
  response.end(body)
}

export async function startMockIssuer(options: MockIssuerOptions = {}): Promise<MockIssuer> {
  const accessTokenLifetime = options.accessTokenLifetimeSeconds ?? 3600
  const rotateRefreshTokens = options.rotateRefreshTokens ?? true
  const clientId = 'fleet-visualizer'
  const clientSecret = 'fleet-visualizer-secret'
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true })
  const jwk = { ...await exportJWK(publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' }

  let user: IssuedUser = { ...DEFAULT_USER, ...options.user }
  let issuerUrl = ''
  let refreshToken: string | null = null
  let failures: { count: number, error: string, status: number } | null = null
  const authorizationCodes = new Map<string, { nonce?: string, codeChallenge?: string }>()
  const tokenRequests: Array<Record<string, string>> = []
  const revoked: string[] = []
  const endSessionRequests: Array<Record<string, string>> = []

  async function signAccessToken(): Promise<string> {
    return new SignJWT({
      jti: Math.random().toString(36).slice(2),
      client_id: clientId,
      scope: 'openid profile email offline_access tenant roles groups entitlements applications',
      tenant: user.tenant,
      tid: user.tenantId,
      email: user.email,
      given_name: user.givenName,
      entitlements_url: `${issuerUrl}/api/public/token/entitlements`,
      roles_url: `${issuerUrl}/api/public/token/roles`,
      ...(user.puppeteer ? { puppeteer: user.puppeteer } : {})
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(issuerUrl)
      .setAudience(clientId)
      .setSubject(user.sub)
      .setIssuedAt()
      .setExpirationTime(`${accessTokenLifetime}s`)
      .sign(privateKey)
  }

  async function signIdToken(nonce: string | undefined, sid: string): Promise<string> {
    const payload: Record<string, unknown> = {
      sid,
      email: user.email,
      given_name: user.givenName,
      preferred_username: user.email,
      tenant_name: 'Tenant de prueba',
      applications_url: `${issuerUrl}/api/public/token/applications`,
      roles: user.roles,
      entitlements: user.entitlements,
      groups: []
    }
    if (nonce)
      payload.nonce = nonce
    if (user.puppeteer)
      payload.puppeteer = user.puppeteer

    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(issuerUrl)
      .setAudience(clientId)
      .setSubject(user.sub)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey)
  }

  async function issueTokens(nonce: string | undefined): Promise<Record<string, unknown>> {
    refreshToken = rotateRefreshTokens || !refreshToken
      ? `refresh-${Math.random().toString(36).slice(2)}`
      : refreshToken

    return {
      access_token: await signAccessToken(),
      id_token: await signIdToken(nonce, 'session-1'),
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: accessTokenLifetime
    }
  }

  const server: Server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', issuerUrl || 'http://localhost')

    if (url.pathname === '/.well-known/openid-configuration') {
      sendJson(response, 200, {
        issuer: issuerUrl,
        authorization_endpoint: `${issuerUrl}/connect/authorize`,
        token_endpoint: `${issuerUrl}/connect/token`,
        jwks_uri: `${issuerUrl}/.well-known/jwks`,
        revocation_endpoint: `${issuerUrl}/connect/revoke`,
        end_session_endpoint: `${issuerUrl}/connect/endsession`,
        userinfo_endpoint: `${issuerUrl}/connect/userinfo`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['client_secret_basic', 'none'],
        frontchannel_logout_supported: true,
        frontchannel_logout_session_supported: true
      })
      return
    }

    if (url.pathname === '/.well-known/jwks') {
      sendJson(response, 200, { keys: [jwk] })
      return
    }

    if (url.pathname === '/connect/authorize') {
      const code = `code-${Math.random().toString(36).slice(2)}`
      authorizationCodes.set(code, {
        nonce: url.searchParams.get('nonce') ?? undefined,
        codeChallenge: url.searchParams.get('code_challenge') ?? undefined
      })
      const redirectUri = new URL(url.searchParams.get('redirect_uri')!)
      redirectUri.searchParams.set('code', code)
      const state = url.searchParams.get('state')
      if (state)
        redirectUri.searchParams.set('state', state)

      response.writeHead(302, { location: redirectUri.toString() })
      response.end()
      return
    }

    if (url.pathname === '/connect/token') {
      const parameters = Object.fromEntries(new URLSearchParams(await readBody(request)))
      tokenRequests.push(parameters)

      if (failures && failures.count > 0) {
        failures.count -= 1
        sendJson(response, failures.status, { error: failures.error })
        return
      }

      if (parameters.grant_type === 'authorization_code') {
        const stored = authorizationCodes.get(parameters.code ?? '')
        if (!stored) {
          sendJson(response, 400, { error: 'invalid_grant' })
          return
        }
        authorizationCodes.delete(parameters.code!)
        sendJson(response, 200, await issueTokens(stored.nonce))
        return
      }

      if (parameters.grant_type === 'refresh_token') {
        if (!refreshToken || parameters.refresh_token !== refreshToken) {
          sendJson(response, 400, { error: 'invalid_grant' })
          return
        }
        sendJson(response, 200, await issueTokens(undefined))
        return
      }

      sendJson(response, 400, { error: 'unsupported_grant_type' })
      return
    }

    if (url.pathname === '/connect/revoke') {
      const parameters = Object.fromEntries(new URLSearchParams(await readBody(request)))
      if (parameters.token)
        revoked.push(parameters.token)
      response.writeHead(200)
      response.end()
      return
    }

    if (url.pathname === '/connect/endsession') {
      endSessionRequests.push(Object.fromEntries(url.searchParams))
      const redirect = url.searchParams.get('post_logout_redirect_uri')
      response.writeHead(302, { location: redirect ?? '/' })
      response.end()
      return
    }

    if (url.pathname === '/api/public/token/entitlements') {
      sendJson(response, 200, { value: user.entitlements.map(value => ({ value })) })
      return
    }

    if (url.pathname === '/api/public/token/applications') {
      sendJson(response, 200, { value: [] })
      return
    }

    response.writeHead(404)
    response.end()
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('The mock issuer could not bind a port')

  issuerUrl = `http://127.0.0.1:${address.port}`

  return {
    url: issuerUrl,
    clientId,
    clientSecret,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
    failNextTokenRequests: (count, error, status) => {
      failures = { count, error, status }
    },
    tokenRequests: () => tokenRequests,
    revoked: () => revoked,
    endSessionRequests: () => endSessionRequests,
    currentRefreshToken: () => refreshToken,
    setUser: (next) => {
      user = { ...user, ...next }
    }
  }
}

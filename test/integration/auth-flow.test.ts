import type { Server } from 'node:http'
import type { MockIssuer } from '../fixtures/oidc-issuer'
import { createServer } from 'node:http'
import { createApp, createRouter, toNodeListener } from 'h3'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { startMockIssuer } from '../fixtures/oidc-issuer'

const SESSION_PASSWORD = 'integration-session-password-0123456789'

let issuer: MockIssuer
let upstream: Server
let upstreamUrl: string
let application: Server
let applicationUrl: string
let session: Record<string, any>
let upstreamRequests: Array<{ url: string, authorization: string | undefined }>

function cookieJar() {
  const cookies = new Map<string, string>()

  return {
    header: () => [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; '),
    accept(response: Response) {
      for (const raw of response.headers.getSetCookie()) {
        const [pair] = raw.split(';')
        const separator = pair!.indexOf('=')
        const name = pair!.slice(0, separator)
        const value = pair!.slice(separator + 1)
        if (value === '')
          cookies.delete(name)
        else
          cookies.set(name, value)
      }
    }
  }
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('The test server could not bind a port')

  return `http://127.0.0.1:${address.port}`
}

beforeAll(async () => {
  issuer = await startMockIssuer({ accessTokenLifetimeSeconds: 3600 })

  upstream = createServer((request, response) => {
    upstreamRequests.push({
      url: request.url ?? '',
      authorization: request.headers.authorization
    })
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ value: [] }))
  })
  upstreamUrl = await listen(upstream)

  vi.stubGlobal('useRuntimeConfig', () => ({
    oidc: {
      issuer: issuer.url,
      clientId: issuer.clientId,
      clientSecret: issuer.clientSecret,
      clientAuthMethod: 'client_secret_basic',
      scope: 'openid profile email offline_access tenant roles groups entitlements applications',
      appUrl: '',
      loginPath: '/login',
      postLogoutPath: '/login',
      proxyUpstream: upstreamUrl
    },
    session: { password: SESSION_PASSWORD }
  }))
  vi.stubGlobal('getUserSession', async () => session)
  vi.stubGlobal('setUserSession', async (_event: unknown, data: Record<string, any>) => {
    session = { ...session, ...data, secure: { ...session.secure, ...data.secure } }
    return session
  })
  vi.stubGlobal('replaceUserSession', async (_event: unknown, data: Record<string, any>) => {
    session = { ...data }
    return session
  })
  vi.stubGlobal('clearUserSession', async () => {
    session = {}
    return true
  })

  const [login, callback, logout, frontChannelLogout, proxy] = await Promise.all([
    import('../../server/api/auth/login.get'),
    import('../../server/api/auth/callback.get'),
    import('../../server/api/auth/logout.post'),
    import('../../server/api/auth/frontchannel-logout.get'),
    import('../../server/routes/backend/[...]')
  ])

  const router = createRouter()
  router.get('/api/auth/login', login.default)
  router.get('/api/auth/callback', callback.default)
  router.post('/api/auth/logout', logout.default)
  router.get('/api/auth/frontchannel-logout', frontChannelLogout.default)
  router.use('/backend/**', proxy.default)

  application = createServer(toNodeListener(createApp().use(router)))
  applicationUrl = await listen(application)
})

beforeEach(() => {
  session = {}
  upstreamRequests = []
})

afterAll(async () => {
  vi.unstubAllGlobals()
  await issuer.close()
  await new Promise<void>(resolve => upstream.close(() => resolve()))
  await new Promise<void>(resolve => application.close(() => resolve()))
})

async function signIn(jar: ReturnType<typeof cookieJar>, returnPath?: string): Promise<void> {
  const loginUrl = returnPath
    ? `${applicationUrl}/api/auth/login?return=${encodeURIComponent(returnPath)}`
    : `${applicationUrl}/api/auth/login`

  const started = await fetch(loginUrl, { redirect: 'manual', headers: { cookie: jar.header() } })
  jar.accept(started)
  expect(started.status).toBe(302)

  const authorizeUrl = new URL(started.headers.get('location')!)
  expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256')
  expect(authorizeUrl.searchParams.get('state')).toBeTruthy()
  expect(authorizeUrl.searchParams.get('nonce')).toBeTruthy()

  const authorized = await fetch(authorizeUrl, { redirect: 'manual' })
  const callbackUrl = new URL(authorized.headers.get('location')!)

  const completed = await fetch(
    `${applicationUrl}/api/auth/callback${callbackUrl.search}`,
    { redirect: 'manual', headers: { cookie: jar.header() } }
  )
  jar.accept(completed)
  expect(completed.status).toBe(302)
}

describe('authorization code flow', () => {
  it('signs in and stores the tokens server side', async () => {
    const jar = cookieJar()
    await signIn(jar, '/vehicles?page=2')

    expect(session.user.sub).toBe('user-1')
    expect(session.user.tenant).toBe('rx_test01')
    expect(session.user).not.toHaveProperty('entitlements')
    expect(session.user).not.toHaveProperty('roles')
    expect(session.user.impersonated).toBe(false)
    expect(session.secure.accessToken).toBeTruthy()
    expect(session.secure.refreshToken).toBeTruthy()
    expect(session.fingerprint).toBeTruthy()
  })

  it('returns the browser to the requested internal path', async () => {
    const jar = cookieJar()
    const started = await fetch(
      `${applicationUrl}/api/auth/login?return=${encodeURIComponent('/vehicles?page=2')}`,
      { redirect: 'manual' }
    )
    jar.accept(started)
    const authorized = await fetch(new URL(started.headers.get('location')!), { redirect: 'manual' })
    const callbackUrl = new URL(authorized.headers.get('location')!)
    const completed = await fetch(
      `${applicationUrl}/api/auth/callback${callbackUrl.search}`,
      { redirect: 'manual', headers: { cookie: jar.header() } }
    )

    expect(completed.headers.get('location')).toBe('/vehicles?page=2')
  })

  it('refuses a callback whose state does not match the stored flow', async () => {
    const jar = cookieJar()
    const started = await fetch(`${applicationUrl}/api/auth/login`, { redirect: 'manual' })
    jar.accept(started)
    const authorized = await fetch(new URL(started.headers.get('location')!), { redirect: 'manual' })
    const callbackUrl = new URL(authorized.headers.get('location')!)
    callbackUrl.searchParams.set('state', 'tampered')

    const completed = await fetch(
      `${applicationUrl}/api/auth/callback${callbackUrl.search}`,
      { redirect: 'manual', headers: { cookie: jar.header() } }
    )

    expect(completed.headers.get('location')).toBe('/login')
    expect(session.user).toBeUndefined()
  })

  it('sends the browser back to the login page when the provider reports an error', async () => {
    const jar = cookieJar()
    const started = await fetch(`${applicationUrl}/api/auth/login`, { redirect: 'manual' })
    jar.accept(started)

    const completed = await fetch(
      `${applicationUrl}/api/auth/callback?error=access_denied`,
      { redirect: 'manual', headers: { cookie: jar.header() } }
    )

    expect(completed.headers.get('location')).toBe('/login')
    expect(completed.headers.getSetCookie().join(';')).toContain('lightning-auth.oidc-error')
  })
})

describe('tenant API proxy', () => {
  it('forwards the session bearer token and never exposes it to the browser', async () => {
    const jar = cookieJar()
    await signIn(jar)

    const response = await fetch(`${applicationUrl}/backend/odata/vehicles`, {
      headers: { cookie: jar.header() }
    })

    expect(response.status).toBe(200)
    expect(upstreamRequests).toHaveLength(1)
    expect(upstreamRequests[0]!.url).toBe('/odata/vehicles')
    expect(upstreamRequests[0]!.authorization).toBe(`Bearer ${session.secure.accessToken}`)
  })

  it('answers 401 with a terminal code when there is no session', async () => {
    const response = await fetch(`${applicationUrl}/backend/odata/vehicles`)
    const payload = await response.json() as any

    expect(response.status).toBe(401)
    expect(payload.data.code).toBe('AUTH_ACCESS_TOKEN_UNAVAILABLE')
    expect(upstreamRequests).toHaveLength(0)
  })

  it('refreshes an access token that is about to expire and keeps serving the request', async () => {
    const jar = cookieJar()
    await signIn(jar)
    const firstAccessToken = session.secure.accessToken
    session.secure.expiresAt = Math.floor(Date.now() / 1000) + 5

    const response = await fetch(`${applicationUrl}/backend/odata/vehicles`, {
      headers: { cookie: jar.header() }
    })

    expect(response.status).toBe(200)
    expect(session.secure.accessToken).not.toBe(firstAccessToken)
    expect(upstreamRequests[0]!.authorization).toBe(`Bearer ${session.secure.accessToken}`)
    expect(issuer.tokenRequests().at(-1)!.grant_type).toBe('refresh_token')
  })

  it('answers 503 and keeps the credentials when the provider is temporarily unavailable', async () => {
    const jar = cookieJar()
    await signIn(jar)
    const refreshToken = session.secure.refreshToken
    session.secure.expiresAt = Math.floor(Date.now() / 1000) + 5
    issuer.failNextTokenRequests(1, 'server_error', 503)

    const response = await fetch(`${applicationUrl}/backend/odata/vehicles`, {
      headers: { cookie: jar.header() }
    })
    const payload = await response.json() as any

    expect(response.status).toBe(503)
    expect(payload.data.code).toBe('AUTH_REFRESH_UNAVAILABLE')
    expect(session.secure.refreshToken).toBe(refreshToken)
    expect(session.error).toBe('RefreshTokenTransientError')
  })

  it('clears the credentials when the refresh token is rejected', async () => {
    const jar = cookieJar()
    await signIn(jar)
    session.secure.expiresAt = Math.floor(Date.now() / 1000) + 5
    issuer.failNextTokenRequests(1, 'invalid_grant', 400)

    const response = await fetch(`${applicationUrl}/backend/odata/vehicles`, {
      headers: { cookie: jar.header() }
    })
    const payload = await response.json() as any

    expect(response.status).toBe(401)
    expect(payload.data.code).toBe('AUTH_SESSION_EXPIRED')
    expect(session.secure).toBeUndefined()
    expect(session.error).toBe('RefreshTokenTerminalError')
  })

  it('ends a session whose absolute lifetime has passed', async () => {
    const jar = cookieJar()
    await signIn(jar)
    session.secure.authStartedAt = Math.floor(Date.now() / 1000) - 9 * 24 * 60 * 60

    const response = await fetch(`${applicationUrl}/backend/odata/vehicles`, {
      headers: { cookie: jar.header() }
    })
    const payload = await response.json() as any

    expect(response.status).toBe(401)
    expect(payload.data.code).toBe('AUTH_SESSION_EXPIRED')
    expect(session.error).toBe('SessionAbsoluteExpired')
  })
})

describe('logout', () => {
  it('revokes the refresh token, clears the session and returns the end-session URL', async () => {
    const jar = cookieJar()
    await signIn(jar)
    const refreshToken = session.secure.refreshToken
    const fingerprint = session.fingerprint

    const response = await fetch(`${applicationUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { cookie: jar.header() }
    })
    jar.accept(response)
    const payload = await response.json() as any

    expect(issuer.revoked()).toContain(refreshToken)
    expect(payload.logoutFingerprint).toBe(fingerprint)
    expect(new URL(payload.endSessionUrl).searchParams.get('client_id')).toBe(issuer.clientId)
    expect(session.secure).toBeUndefined()
  })

  it('refuses a cross-origin logout', async () => {
    const response = await fetch(`${applicationUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { origin: 'https://evil.test' }
    })

    expect(response.status).toBe(403)
  })
})

describe('front-channel logout', () => {
  it('tombstones the session so a later proxy request cannot use it', async () => {
    const jar = cookieJar()
    await signIn(jar)
    const signedInSession = JSON.parse(JSON.stringify(session))

    const notified = await fetch(
      `${applicationUrl}/api/auth/frontchannel-logout?iss=${encodeURIComponent(issuer.url)}&sid=session-1`,
      { headers: { cookie: jar.header() } }
    )
    jar.accept(notified)
    const body = await notified.text()

    expect(notified.headers.get('content-security-policy')).toContain(`frame-ancestors ${issuer.url}`)
    expect(body).toContain('logout-committed')

    // A refresh that was already in flight can restore the cookie; the tombstone
    // must still keep that session unusable.
    session = signedInSession

    const response = await fetch(`${applicationUrl}/backend/odata/vehicles`, {
      headers: { cookie: jar.header() }
    })
    const payload = await response.json() as any

    expect(response.status).toBe(401)
    expect(payload.data.code).toBe('AUTH_SESSION_LOGGED_OUT')
  })

  it('ignores a notification from another issuer', async () => {
    const jar = cookieJar()
    await signIn(jar)

    const notified = await fetch(
      `${applicationUrl}/api/auth/frontchannel-logout?iss=https://evil.test&sid=session-1`,
      { headers: { cookie: jar.header() } }
    )
    const body = await notified.text()

    expect(body).not.toContain('logout-committed')
    expect(session.secure.accessToken).toBeTruthy()
  })
})

describe('impersonated session', () => {
  it('marks the session as a support session', async () => {
    issuer.setUser({ puppeteer: 'operator-1' })
    const jar = cookieJar()
    await signIn(jar)
    issuer.setUser({ puppeteer: undefined })

    expect(session.user.impersonated).toBe(true)
    expect(session.user.sub).toBe('user-1')
    expect(session.user.tenant).toBe('rx_test01')
  })
})

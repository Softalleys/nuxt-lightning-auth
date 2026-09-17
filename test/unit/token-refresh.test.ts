import { describe, expect, it, vi } from 'vitest'
import { classifyRefreshFailure } from '../../server/utils/token-refresh'

describe('classifyRefreshFailure', () => {
  it('keeps credentials for failures the provider may recover from', () => {
    expect(classifyRefreshFailure('temporarily_unavailable', 400)).toBe(true)
    expect(classifyRefreshFailure('server_error', 400)).toBe(true)
    expect(classifyRefreshFailure('unknown_error', 500)).toBe(true)
    expect(classifyRefreshFailure('unknown_error', 503)).toBe(true)
    expect(classifyRefreshFailure('unknown_error', 429)).toBe(true)
    expect(classifyRefreshFailure('unknown_error', 408)).toBe(true)
    expect(classifyRefreshFailure('unknown_error', 425)).toBe(true)
    expect(classifyRefreshFailure('unknown_error', undefined)).toBe(true)
  })

  it('clears credentials for failures that cannot be retried', () => {
    expect(classifyRefreshFailure('invalid_grant', 400)).toBe(false)
    expect(classifyRefreshFailure('invalid_client', 401)).toBe(false)
    expect(classifyRefreshFailure('unauthorized_client', 400)).toBe(false)
    expect(classifyRefreshFailure('invalid_request', 400)).toBe(false)
    expect(classifyRefreshFailure('unknown_error', 400)).toBe(false)
  })
})

describe('refreshAccessTokenSingleFlight', () => {
  it('shares one exchange between concurrent callers holding the same refresh token', async () => {
    vi.resetModules()
    const grant = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return {
        access_token: 'access-2',
        refresh_token: 'refresh-2',
        expiresIn: () => 3600
      }
    })

    vi.doMock('openid-client', () => ({
      refreshTokenGrant: grant,
      ClientSecretBasic: () => ({}),
      None: () => ({}),
      discovery: vi.fn(),
      allowInsecureRequests: vi.fn()
    }))
    vi.doMock('../../server/utils/oidc', () => ({
      getOidcConfiguration: async () => ({ serverMetadata: () => ({}) })
    }))

    const { refreshAccessTokenSingleFlight } = await import('../../server/utils/token-refresh')
    const config = {
      issuer: 'https://accounts.example.com',
      clientId: 'client',
      clientAuthMethod: 'none' as const,
      scope: 'openid',
      proxyUpstream: '',
      loginPath: '/login',
      postLogoutPath: '/login'
    }

    const [first, second] = await Promise.all([
      refreshAccessTokenSingleFlight(config, 'refresh-1'),
      refreshAccessTokenSingleFlight(config, 'refresh-1')
    ])

    expect(grant).toHaveBeenCalledTimes(1)
    expect(first).toEqual(second)
    expect(first.refreshToken).toBe('refresh-2')

    await refreshAccessTokenSingleFlight(config, 'refresh-2')
    expect(grant).toHaveBeenCalledTimes(2)

    vi.doUnmock('openid-client')
    vi.doUnmock('../../server/utils/oidc')
  })
})

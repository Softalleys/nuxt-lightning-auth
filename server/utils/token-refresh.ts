import type { LightningAuthConfig } from './oidc'
import { createHash } from 'node:crypto'
import * as client from 'openid-client'
import { getOidcConfiguration } from './oidc'

export interface RefreshedTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export class TokenRefreshError extends Error {
  public readonly oauthError: string
  public readonly status: number | undefined
  public readonly transient: boolean

  constructor(oauthError: string, status: number | undefined, transient: boolean) {
    super('OIDC token refresh failed')
    this.name = 'TokenRefreshError'
    this.oauthError = oauthError
    this.status = status
    this.transient = transient
  }
}

const TERMINAL_OAUTH_ERRORS = new Set([
  'invalid_grant',
  'invalid_client',
  'unauthorized_client',
  'invalid_request',
  'invalid_scope',
  'unsupported_grant_type'
])

function isTransientStatus(status: number | undefined): boolean {
  return status === undefined || status === 408 || status === 425 || status === 429 || status >= 500
}

export function classifyRefreshFailure(oauthError: string, status: number | undefined): boolean {
  if (oauthError === 'temporarily_unavailable' || oauthError === 'server_error')
    return true

  if (TERMINAL_OAUTH_ERRORS.has(oauthError))
    return false

  return isTransientStatus(status)
}

function toRefreshError(error: unknown): TokenRefreshError {
  const candidate = error as { error?: unknown, status?: unknown } | null
  const oauthError = typeof candidate?.error === 'string' ? candidate.error : null
  const status = typeof candidate?.status === 'number' ? candidate.status : undefined

  if (!oauthError)
    return new TokenRefreshError('temporarily_unavailable', status, true)

  return new TokenRefreshError(oauthError, status, classifyRefreshFailure(oauthError, status))
}

/**
 * Lightning rotates refresh tokens, so two concurrent requests holding the same
 * cookie must share one exchange instead of spending the replaced token twice.
 * The key is a digest so no credential is ever kept as a map key.
 */
const flights = new Map<string, Promise<RefreshedTokens>>()

function flightKey(config: LightningAuthConfig, refreshToken: string): string {
  return createHash('sha256')
    .update(config.issuer)
    .update(String.fromCharCode(0))
    .update(config.clientId)
    .update(String.fromCharCode(0))
    .update(refreshToken)
    .digest('base64url')
}

export async function refreshAccessToken(
  config: LightningAuthConfig,
  refreshToken: string
): Promise<RefreshedTokens> {
  let configuration: client.Configuration
  try {
    configuration = await getOidcConfiguration(config)
  } catch {
    throw new TokenRefreshError('temporarily_unavailable', undefined, true)
  }

  let response: Awaited<ReturnType<typeof client.refreshTokenGrant>>
  try {
    response = await client.refreshTokenGrant(configuration, refreshToken)
  } catch (error) {
    throw toRefreshError(error)
  }

  const expiresIn = response.expiresIn()
  if (!response.access_token || typeof expiresIn !== 'number' || expiresIn <= 0)
    throw new TokenRefreshError('invalid_token_response', undefined, false)

  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token || refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + expiresIn
  }
}

export async function refreshAccessTokenSingleFlight(
  config: LightningAuthConfig,
  refreshToken: string
): Promise<RefreshedTokens> {
  const key = flightKey(config, refreshToken)
  const existing = flights.get(key)
  if (existing)
    return existing

  const flight = refreshAccessToken(config, refreshToken)
  flights.set(key, flight)
  try {
    return await flight
  } finally {
    if (flights.get(key) === flight)
      flights.delete(key)
  }
}

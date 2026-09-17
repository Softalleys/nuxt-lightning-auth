import type { H3Event } from 'h3'
import type { LightningAuthConfig } from './oidc'
import { createError } from 'h3'
import {
  AUTH_REFRESH_LEEWAY_SECONDS,
  AUTH_REFRESH_RETRY_DELAY_SECONDS,
  AUTH_RESPONSE_CODES,
  AUTH_SESSION_ABSOLUTE_MAX_AGE_SECONDS,
  AUTH_SESSION_ERRORS,
  isTerminalAuthSessionError
} from '../../utils/auth-errors'
import { isTombstoned, readSessionPassword } from './logout-tombstone'
import { readLightningAuthConfig } from './oidc'
import { decodeTokenClaims, readStringArrayClaim, readStringClaim } from './token-claims'
import { refreshAccessTokenSingleFlight, TokenRefreshError } from './token-refresh'

export interface AuthSecureSession {
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  authStartedAt?: number
  sid?: string
  issuer?: string
  entitlementsUrl?: string
  applicationsUrl?: string
  refreshRetryAfter?: number
}

export interface TenantContext {
  subject: string
  tenantIdentifier: string | null
  tenantId: string | null
  entitlements: string[]
  impersonated: boolean
}

function unauthorized(code: string, message: string) {
  return createError({ statusCode: 401, message, data: { code } })
}

function refreshUnavailable() {
  return createError({
    statusCode: 503,
    message: 'Authentication service is temporarily unavailable.',
    data: { code: AUTH_RESPONSE_CODES.refreshUnavailable }
  })
}

async function clearCredentials(event: H3Event, error: string): Promise<void> {
  const session = await getUserSession(event)
  await replaceUserSession(event, {
    ...session,
    user: undefined,
    secure: undefined,
    fingerprint: undefined,
    error
  } as any)
}

/**
 * Returns a usable bearer token for the current browser session, refreshing it
 * when it is about to expire. Throws the codes the browser uses to decide
 * between a silent retry and a new login.
 */
export async function requireAccessToken(event: H3Event): Promise<string> {
  const config = readLightningAuthConfig(event)
  const session = await getUserSession(event) as {
    secure?: AuthSecureSession
    fingerprint?: string
    error?: unknown
  }
  const secure = session.secure

  if (isTombstoned(event, readSessionPassword(event), session.fingerprint ?? null)) {
    await clearCredentials(event, AUTH_SESSION_ERRORS.terminal)
    throw unauthorized(AUTH_RESPONSE_CODES.loggedOut, 'Authentication session has been signed out.')
  }

  if (isTerminalAuthSessionError(session.error))
    throw unauthorized(AUTH_RESPONSE_CODES.sessionExpired, 'Authentication session has expired.')

  if (!secure?.accessToken) {
    throw unauthorized(
      AUTH_RESPONSE_CODES.accessTokenUnavailable,
      'Authentication session has no access token.'
    )
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  const authStartedAt = secure.authStartedAt ?? nowSeconds
  if (nowSeconds >= authStartedAt + AUTH_SESSION_ABSOLUTE_MAX_AGE_SECONDS) {
    await clearCredentials(event, AUTH_SESSION_ERRORS.absoluteExpired)
    throw unauthorized(AUTH_RESPONSE_CODES.sessionExpired, 'Authentication session has expired.')
  }

  const expiresAt = secure.expiresAt ?? 0
  if (expiresAt - AUTH_REFRESH_LEEWAY_SECONDS > nowSeconds)
    return secure.accessToken

  if (!secure.refreshToken) {
    await clearCredentials(event, AUTH_SESSION_ERRORS.terminal)
    throw unauthorized(AUTH_RESPONSE_CODES.sessionExpired, 'Authentication session has expired.')
  }

  if (secure.refreshRetryAfter && nowSeconds < secure.refreshRetryAfter)
    throw refreshUnavailable()

  return refreshSessionTokens(event, config, secure)
}

async function refreshSessionTokens(
  event: H3Event,
  config: LightningAuthConfig,
  secure: AuthSecureSession
): Promise<string> {
  try {
    const refreshed = await refreshAccessTokenSingleFlight(config, secure.refreshToken!)
    await setUserSession(event, {
      secure: {
        ...secure,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt,
        refreshRetryAfter: undefined
      },
      error: undefined
    } as any)

    return refreshed.accessToken
  } catch (error) {
    const failure = error instanceof TokenRefreshError
      ? error
      : new TokenRefreshError('temporarily_unavailable', undefined, true)

    console.log('[AUTH] Token refresh failed', {
      error: failure.oauthError,
      status: failure.status,
      classification: failure.transient ? 'transient' : 'terminal'
    })

    if (!failure.transient) {
      await clearCredentials(event, AUTH_SESSION_ERRORS.terminal)
      throw unauthorized(AUTH_RESPONSE_CODES.sessionExpired, 'Authentication session has expired.')
    }

    await setUserSession(event, {
      secure: {
        ...secure,
        refreshRetryAfter: Math.floor(Date.now() / 1000) + AUTH_REFRESH_RETRY_DELAY_SECONDS
      },
      error: AUTH_SESSION_ERRORS.transient
    } as any)

    throw refreshUnavailable()
  }
}

/**
 * Lightning puts the entitlement list in the ID token and only a resource URL
 * in the access token, so the list is read from the session captured at login.
 */
export async function requireTenantContext(event: H3Event): Promise<TenantContext> {
  const accessToken = await requireAccessToken(event)
  const claims = decodeTokenClaims(accessToken)
  const subject = readStringClaim(claims, 'sub')
  if (!subject)
    throw unauthorized(AUTH_RESPONSE_CODES.accessTokenUnavailable, 'The access token has no subject.')

  const session = await getUserSession(event) as { user?: { entitlements?: unknown } }

  return {
    subject,
    tenantIdentifier: readStringClaim(claims, 'tenant'),
    tenantId: readStringClaim(claims, 'tid'),
    entitlements: readStringArrayClaim(session.user as any, 'entitlements'),
    impersonated: Boolean(readStringClaim(claims, 'puppeteer'))
  }
}

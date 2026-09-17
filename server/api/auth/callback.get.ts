import { defineEventHandler, getQuery, getRequestURL, sendRedirect, setCookie } from 'h3'
import * as client from 'openid-client'
import { OIDC_ERROR_COOKIE } from '../../../utils/oidc-error-cookie'
import { resolveApplicationOrigin, useAuthFlowSession } from '../../utils/auth-flow'
import { createSessionFingerprint, isSecureRequest } from '../../utils/logout-tombstone'
import { getOidcConfiguration, readLightningAuthConfig } from '../../utils/oidc'
import { decodeTokenClaims, readStringArrayClaim, readStringClaim } from '../../utils/token-claims'

function captureError(event: any, error: string, errorUri: unknown, issuer: string): void {
  let sanitizedUri: string | undefined
  if (typeof errorUri === 'string') {
    try {
      const candidate = new URL(errorUri)
      if (candidate.origin === new URL(issuer).origin)
        sanitizedUri = candidate.toString()
    } catch {
      // A malformed error_uri is simply dropped.
    }
  }

  setCookie(event, OIDC_ERROR_COOKIE, JSON.stringify({ error, errorUri: sanitizedUri }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(event),
    path: '/',
    maxAge: 120
  })
}

export default defineEventHandler(async (event) => {
  const config = readLightningAuthConfig(event)
  const query = getQuery(event)
  const flow = await useAuthFlowSession(event)
  const { codeVerifier, state, nonce, returnPath } = flow.data
  await flow.clear()

  if (typeof query.error === 'string') {
    captureError(event, query.error, query.error_uri, config.issuer)
    return sendRedirect(event, config.loginPath, 302)
  }

  if (!codeVerifier || !state) {
    captureError(event, 'callback', undefined, config.issuer)
    return sendRedirect(event, config.loginPath, 302)
  }

  const configuration = await getOidcConfiguration(config)
  const origin = resolveApplicationOrigin(event, config.appUrl)
  const currentUrl = new URL(
    getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).search,
    `${origin}/api/auth/callback`
  )

  let tokens
  try {
    tokens = await client.authorizationCodeGrant(configuration, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedState: state,
      expectedNonce: nonce,
      idTokenExpected: true
    })
  } catch (error) {
    const oauthError = (error as { error?: unknown })?.error
    captureError(
      event,
      typeof oauthError === 'string' ? oauthError : 'callback',
      undefined,
      config.issuer
    )
    return sendRedirect(event, config.loginPath, 302)
  }

  const idClaims = tokens.claims() as Record<string, unknown> | undefined
  const accessClaims = decodeTokenClaims(tokens.access_token)
  const expiresIn = tokens.expiresIn() ?? 0
  const nowSeconds = Math.floor(Date.now() / 1000)
  const sid = readStringClaim(idClaims, 'sid')

  await replaceUserSession(event, {
    user: {
      sub: readStringClaim(idClaims, 'sub') ?? '',
      name: readStringClaim(idClaims, 'given_name', 'name'),
      email: readStringClaim(idClaims, 'email'),
      picture: readStringClaim(idClaims, 'picture'),
      username: readStringClaim(idClaims, 'preferred_username'),
      tenant: readStringClaim(accessClaims, 'tenant'),
      tenantId: readStringClaim(accessClaims, 'tid'),
      tenantName: readStringClaim(idClaims, 'tenant_name'),
      tenantPicture: readStringClaim(idClaims, 'tenant_picture'),
      roles: readStringArrayClaim(idClaims, 'roles'),
      entitlements: readStringArrayClaim(idClaims, 'entitlements'),
      impersonated: Boolean(readStringClaim(idClaims, 'puppeteer'))
    },
    fingerprint: sid ? createSessionFingerprint(config.issuer, sid) : undefined,
    secure: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: nowSeconds + expiresIn,
      authStartedAt: nowSeconds,
      sid,
      issuer: config.issuer,
      entitlementsUrl: readStringClaim(accessClaims, 'entitlements_url'),
      applicationsUrl: readStringClaim(idClaims, 'applications_url')
    },
    error: undefined
  } as any)

  return sendRedirect(event, returnPath || '/', 302)
})

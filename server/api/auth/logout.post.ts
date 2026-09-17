import { createError, defineEventHandler, getHeader, getRequestURL } from 'h3'
import * as client from 'openid-client'
import { resolveApplicationOrigin } from '../../utils/auth-flow'
import { appendTombstone, readSessionPassword } from '../../utils/logout-tombstone'
import { getOidcConfiguration, readLightningAuthConfig } from '../../utils/oidc'

interface LogoutResponse {
  endSessionUrl: string | null
  logoutFingerprint: string | null
}

export default defineEventHandler(async (event): Promise<LogoutResponse> => {
  const origin = getHeader(event, 'origin')
  const requestOrigin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
  if (origin && origin !== requestOrigin)
    throw createError({ statusCode: 403, statusMessage: 'Cross-origin logout is not allowed.' })

  const config = readLightningAuthConfig(event)
  const session = await getUserSession(event) as {
    secure?: Record<string, unknown>
    fingerprint?: unknown
  }
  const secure = session.secure ?? {}
  const fingerprint = typeof session.fingerprint === 'string' ? session.fingerprint : null
  const refreshToken = typeof secure.refreshToken === 'string' ? secure.refreshToken : null

  if (fingerprint) {
    try {
      appendTombstone(event, readSessionPassword(event), fingerprint)
    } catch {
      console.log('[AUTH] Local logout tombstone could not be persisted')
    }
  }

  let configuration
  try {
    configuration = await getOidcConfiguration(config)
  } catch {
    console.log('[AUTH] OIDC discovery was unavailable during logout')
    await clearUserSession(event)
    return { endSessionUrl: null, logoutFingerprint: fingerprint }
  }

  if (refreshToken && configuration.serverMetadata().revocation_endpoint) {
    try {
      await client.tokenRevocation(configuration, refreshToken, { token_type_hint: 'refresh_token' })
    } catch {
      console.log('[AUTH] Refresh token revocation was unavailable')
    }
  }

  await clearUserSession(event)

  if (!configuration.serverMetadata().end_session_endpoint)
    return { endSessionUrl: null, logoutFingerprint: fingerprint }

  const applicationOrigin = resolveApplicationOrigin(event, config.appUrl)
  const endSessionUrl = client.buildEndSessionUrl(configuration, {
    client_id: config.clientId,
    post_logout_redirect_uri: `${applicationOrigin}${config.postLogoutPath}`
  })

  return { endSessionUrl: endSessionUrl.href, logoutFingerprint: fingerprint }
})

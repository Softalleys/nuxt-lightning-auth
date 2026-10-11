import { createError, defineEventHandler } from 'h3'
import { requireAccessToken } from '../../utils/auth-session'
import { readLightningAuthConfig } from '../../utils/oidc'
import { resolveTokenResourceUrl } from '../../utils/token-resource'

export default defineEventHandler(async (event): Promise<unknown> => {
  const config = readLightningAuthConfig(event)
  const accessToken = await requireAccessToken(event)
  const session = await getUserSession(event) as { secure?: { entitlementsUrl?: string } }
  const resourceUrl = resolveTokenResourceUrl(
    session.secure?.entitlementsUrl,
    config.issuer,
    'entitlements'
  )

  if (!resourceUrl) {
    throw createError({
      statusCode: 502,
      message: 'The access token does not carry a trusted entitlements resource.'
    })
  }

  return $fetch<unknown>(resourceUrl, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` }
  })
})

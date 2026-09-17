import { defineEventHandler } from 'h3'
import { requireAccessToken } from '../../utils/auth-session'
import { readLightningAuthConfig } from '../../utils/oidc'
import { resolveTokenResourceUrl } from '../../utils/token-resource'

export default defineEventHandler(async (event) => {
  const config = readLightningAuthConfig(event)
  const accessToken = await requireAccessToken(event)
  const session = await getUserSession(event) as { secure?: { applicationsUrl?: string } }
  const resourceUrl = resolveTokenResourceUrl(
    session.secure?.applicationsUrl,
    config.issuer,
    'applications'
  )

  if (!resourceUrl)
    return { value: [] }

  return $fetch(resourceUrl, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` }
  })
})

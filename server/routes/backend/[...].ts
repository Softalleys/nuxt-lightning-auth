import { createError, defineEventHandler, proxyRequest } from 'h3'
import { requireAccessToken } from '../../utils/auth-session'
import { readLightningAuthConfig } from '../../utils/oidc'

export default defineEventHandler(async (event) => {
  const { proxyUpstream } = readLightningAuthConfig(event)
  if (!proxyUpstream)
    throw createError({ statusCode: 500, statusMessage: 'The proxy upstream is not configured.' })

  const accessToken = await requireAccessToken(event)
  const path = event.path.replace(/^\/backend/, '')

  return proxyRequest(event, `${proxyUpstream.replace(/\/+$/, '')}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
})

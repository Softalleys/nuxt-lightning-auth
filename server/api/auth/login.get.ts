import { defineEventHandler, getQuery, sendRedirect } from 'h3'
import * as client from 'openid-client'
import { resolveApplicationOrigin, resolveReturnPath, useAuthFlowSession } from '../../utils/auth-flow'
import { getOidcConfiguration, readLightningAuthConfig } from '../../utils/oidc'

const ALLOWED_PROMPTS = new Set(['select_account', 'login', 'consent'])

export default defineEventHandler(async (event) => {
  const config = readLightningAuthConfig(event)
  const configuration = await getOidcConfiguration(config)
  const query = getQuery(event)
  const origin = resolveApplicationOrigin(event, config.appUrl)

  const codeVerifier = client.randomPKCECodeVerifier()
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier)
  const state = client.randomState()
  const nonce = client.randomNonce()

  const flow = await useAuthFlowSession(event)
  await flow.update({
    codeVerifier,
    state,
    nonce,
    returnPath: resolveReturnPath(query.return, origin)
  })

  const parameters: Record<string, string> = {
    redirect_uri: `${origin}/api/auth/callback`,
    scope: config.scope,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce
  }

  const prompt = typeof query.prompt === 'string' ? query.prompt : ''
  if (ALLOWED_PROMPTS.has(prompt))
    parameters.prompt = prompt

  return sendRedirect(
    event,
    client.buildAuthorizationUrl(configuration, parameters).href,
    302
  )
})

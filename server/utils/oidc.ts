import type { H3Event } from 'h3'
import * as client from 'openid-client'

export type LightningClientAuthMethod = 'none' | 'client_secret_basic'

export interface LightningAuthConfig {
  issuer: string
  clientId: string
  clientSecret?: string
  clientAuthMethod: LightningClientAuthMethod
  scope: string
  proxyUpstream: string
  loginPath: string
  postLogoutPath: string
  appUrl?: string
}

const configurations = new Map<string, Promise<client.Configuration>>()

export function normalizeIssuer(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new Error('NUXT_OIDC_ISSUER is required')

  const url = new URL(value)
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new Error('The Lightning issuer must use HTTP or HTTPS')

  return value.replace(/\/+$/, '')
}

export function resolveClientAuthMethod(value: unknown): LightningClientAuthMethod {
  if (value === 'none' || value === 'client_secret_basic')
    return value

  throw new Error('NUXT_OIDC_CLIENT_AUTH_METHOD must be "none" or "client_secret_basic"')
}

export function readLightningAuthConfig(event?: H3Event): LightningAuthConfig {
  const source = (useRuntimeConfig(event).oidc ?? {}) as Record<string, unknown>
  const clientAuthMethod = resolveClientAuthMethod(source.clientAuthMethod)
  const clientSecret = typeof source.clientSecret === 'string' && source.clientSecret
    ? source.clientSecret
    : undefined

  if (clientAuthMethod === 'client_secret_basic' && !clientSecret)
    throw new Error('NUXT_OIDC_CLIENT_SECRET is required for client_secret_basic')

  if (typeof source.clientId !== 'string' || !source.clientId)
    throw new Error('NUXT_OIDC_CLIENT_ID is required')

  return {
    issuer: normalizeIssuer(source.issuer),
    clientId: source.clientId,
    clientSecret,
    clientAuthMethod,
    scope: typeof source.scope === 'string' && source.scope
      ? source.scope
      : 'openid profile email offline_access tenant roles groups entitlements applications',
    proxyUpstream: typeof source.proxyUpstream === 'string' ? source.proxyUpstream : '',
    loginPath: typeof source.loginPath === 'string' && source.loginPath ? source.loginPath : '/login',
    postLogoutPath: typeof source.postLogoutPath === 'string' && source.postLogoutPath
      ? source.postLogoutPath
      : '/login',
    appUrl: typeof source.appUrl === 'string' && source.appUrl ? source.appUrl : undefined
  }
}

async function discoverConfiguration(config: LightningAuthConfig): Promise<client.Configuration> {
  const issuerUrl = new URL(config.issuer)
  const clientAuth = config.clientAuthMethod === 'client_secret_basic'
    ? client.ClientSecretBasic(config.clientSecret!)
    : client.None()

  const discovered = await client.discovery(
    issuerUrl,
    config.clientId,
    { client_id: config.clientId },
    clientAuth,
    issuerUrl.protocol === 'http:' ? { execute: [client.allowInsecureRequests] } : undefined
  )

  const metadata = discovered.serverMetadata()
  if (normalizeIssuer(metadata.issuer) !== config.issuer)
    throw new Error('OIDC discovery issuer does not match the configured issuer')

  return discovered
}

export function getOidcConfiguration(config: LightningAuthConfig): Promise<client.Configuration> {
  const key = `${config.issuer} ${config.clientId} ${config.clientAuthMethod}`
  let pending = configurations.get(key)
  if (!pending) {
    pending = discoverConfiguration(config)
    configurations.set(key, pending)
    pending.catch(() => configurations.delete(key))
  }

  return pending
}

export function resetOidcConfigurationCache(): void {
  configurations.clear()
}

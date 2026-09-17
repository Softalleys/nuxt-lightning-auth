import { Buffer } from 'node:buffer'

export type TokenClaims = Record<string, unknown>

/**
 * The token is read straight from the token endpoint response over TLS, so the
 * payload is decoded without a signature check; nothing here grants access.
 */
export function decodeTokenClaims(token: unknown): TokenClaims | null {
  if (typeof token !== 'string')
    return null

  const parts = token.split('.')
  if (parts.length !== 3 || !parts[1])
    return null

  try {
    const decoded = Buffer.from(parts[1], 'base64url').toString('utf8')
    const parsed = JSON.parse(decoded)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as TokenClaims
      : null
  } catch {
    return null
  }
}

export function readStringClaim(claims: TokenClaims | null | undefined, ...names: string[]): string | null {
  for (const name of names) {
    const value = claims?.[name]
    if (typeof value === 'string' && value)
      return value
  }

  return null
}

export function readStringArrayClaim(claims: TokenClaims | null | undefined, name: string): string[] {
  const value = claims?.[name]
  if (typeof value === 'string')
    return value ? [value] : []

  if (!Array.isArray(value))
    return []

  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

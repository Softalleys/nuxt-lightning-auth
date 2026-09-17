export type TokenResource = 'entitlements' | 'roles' | 'groups' | 'applications'

/**
 * Only the exact Lightning resource endpoint may receive the access token, so a
 * tampered claim cannot redirect the bearer to another host.
 */
export function resolveTokenResourceUrl(
  candidateUrl: unknown,
  issuer: string,
  resource: TokenResource
): string | null {
  if (typeof candidateUrl !== 'string' || !candidateUrl)
    return null

  try {
    const provider = new URL(issuer)
    const candidate = new URL(candidateUrl)
    const expectedPath = `${provider.pathname.replace(/\/+$/, '')}/api/public/token/${resource}`
      .replace(/\/{2,}/g, '/')

    if (
      candidate.origin !== provider.origin
      || candidate.pathname !== expectedPath
      || candidate.search
      || candidate.hash
      || candidate.username
      || candidate.password
    ) {
      return null
    }

    return candidate.toString()
  } catch {
    return null
  }
}

import { describe, expect, it } from 'vitest'
import { resolveTokenResourceUrl } from '../../server/utils/token-resource'

const ISSUER = 'https://accounts.example.com'

describe('resolveTokenResourceUrl', () => {
  it('accepts the exact resource endpoint of the configured issuer', () => {
    expect(resolveTokenResourceUrl(
      `${ISSUER}/api/public/token/entitlements`,
      ISSUER,
      'entitlements'
    )).toBe(`${ISSUER}/api/public/token/entitlements`)
  })

  it('supports an issuer hosted under a path prefix', () => {
    expect(resolveTokenResourceUrl(
      'https://example.com/auth/api/public/token/roles',
      'https://example.com/auth',
      'roles'
    )).toBe('https://example.com/auth/api/public/token/roles')
  })

  it('refuses another host, another path, or any query or credentials', () => {
    expect(resolveTokenResourceUrl('https://evil.test/api/public/token/entitlements', ISSUER, 'entitlements')).toBeNull()
    expect(resolveTokenResourceUrl(`${ISSUER}/api/public/token/groups`, ISSUER, 'entitlements')).toBeNull()
    expect(resolveTokenResourceUrl(`${ISSUER}/api/public/token/entitlements?x=1`, ISSUER, 'entitlements')).toBeNull()
    expect(resolveTokenResourceUrl(`https://user:pass@accounts.example.com/api/public/token/entitlements`, ISSUER, 'entitlements')).toBeNull()
    expect(resolveTokenResourceUrl(undefined, ISSUER, 'entitlements')).toBeNull()
  })
})

import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { decodeTokenClaims, readStringArrayClaim, readStringClaim } from '../../server/utils/token-claims'

function token(payload: unknown): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `header.${encoded}.signature`
}

describe('decodeTokenClaims', () => {
  it('reads the payload of a well-formed token', () => {
    expect(decodeTokenClaims(token({ sub: 'user-1', tenant: 'rx_a' })))
      .toEqual({ sub: 'user-1', tenant: 'rx_a' })
  })

  it('returns null for anything that is not a three-part token with a JSON object payload', () => {
    expect(decodeTokenClaims('not-a-token')).toBeNull()
    expect(decodeTokenClaims(token(['array']))).toBeNull()
    expect(decodeTokenClaims('a.%%%.c')).toBeNull()
    expect(decodeTokenClaims(undefined)).toBeNull()
  })
})

describe('claim readers', () => {
  it('returns the first non-empty string claim', () => {
    const claims = { given_name: '', name: 'Owner' }
    expect(readStringClaim(claims, 'given_name', 'name')).toBe('Owner')
    expect(readStringClaim(claims, 'missing')).toBeNull()
    expect(readStringClaim(null, 'name')).toBeNull()
  })

  it('normalizes single values and drops non-strings from arrays', () => {
    expect(readStringArrayClaim({ entitlements: 'one' }, 'entitlements')).toEqual(['one'])
    expect(readStringArrayClaim({ entitlements: ['one', 2, '', 'two'] }, 'entitlements'))
      .toEqual(['one', 'two'])
    expect(readStringArrayClaim({}, 'entitlements')).toEqual([])
  })
})

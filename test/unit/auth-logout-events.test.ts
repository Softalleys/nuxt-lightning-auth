import type { AuthLogoutEvent } from '../../utils/auth-logout-events'
import { describe, expect, it } from 'vitest'
import {
  AUTH_LOGOUT_GUARD_KEY,
  authLogoutEventMatchesSession,
  clearAuthLogoutInProgress,
  isAuthLogoutEvent,
  isAuthLogoutInProgress,
  markAuthLogoutInProgress,
  parseAuthLogoutEvent
} from '../../utils/auth-logout-events'

const VALID: AuthLogoutEvent = {
  version: 1,
  type: 'logout-committed',
  eventId: 'event-1',
  fingerprint: 'fingerprint-1',
  occurredAt: 1_700_000_000_000
}

describe('isAuthLogoutEvent', () => {
  it('accepts a complete event', () => {
    expect(isAuthLogoutEvent(VALID)).toBe(true)
  })

  it('rejects anything with a missing or malformed field', () => {
    expect(isAuthLogoutEvent({ ...VALID, version: 2 })).toBe(false)
    expect(isAuthLogoutEvent({ ...VALID, fingerprint: '' })).toBe(false)
    expect(isAuthLogoutEvent({ ...VALID, occurredAt: Number.NaN })).toBe(false)
    expect(isAuthLogoutEvent(null)).toBe(false)
    expect(isAuthLogoutEvent([VALID])).toBe(false)
  })
})

describe('parseAuthLogoutEvent', () => {
  it('parses a serialized event and rejects invalid JSON', () => {
    expect(parseAuthLogoutEvent(JSON.stringify(VALID))).toEqual(VALID)
    expect(parseAuthLogoutEvent('{')).toBeNull()
    expect(parseAuthLogoutEvent(null)).toBeNull()
  })
})

describe('event matching', () => {
  it('only matches the exact session fingerprint', () => {
    expect(authLogoutEventMatchesSession(VALID, 'fingerprint-1')).toBe(true)
    expect(authLogoutEventMatchesSession(VALID, 'other')).toBe(false)
    expect(authLogoutEventMatchesSession(VALID, null)).toBe(false)
  })
})

describe('logout guard', () => {
  it('is set and cleared in storage', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key)
    }

    expect(isAuthLogoutInProgress(storage)).toBe(false)
    markAuthLogoutInProgress(storage)
    expect(values.get(AUTH_LOGOUT_GUARD_KEY)).toBe('true')
    expect(isAuthLogoutInProgress(storage)).toBe(true)
    clearAuthLogoutInProgress(storage)
    expect(isAuthLogoutInProgress(storage)).toBe(false)
  })
})

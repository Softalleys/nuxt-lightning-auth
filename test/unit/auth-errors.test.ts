import { describe, expect, it } from 'vitest'
import {
  AUTH_SESSION_ERRORS,
  isRefreshUnavailableResponse,
  isTerminalAuthSessionError,
  isTerminalAuthSessionResponse,
  isTransientAuthSessionError
} from '../../utils/auth-errors'

describe('auth session error classification', () => {
  it('treats terminal and absolute expiry as terminal', () => {
    expect(isTerminalAuthSessionError(AUTH_SESSION_ERRORS.terminal)).toBe(true)
    expect(isTerminalAuthSessionError(AUTH_SESSION_ERRORS.absoluteExpired)).toBe(true)
    expect(isTerminalAuthSessionError(AUTH_SESSION_ERRORS.transient)).toBe(false)
    expect(isTerminalAuthSessionError(undefined)).toBe(false)
  })

  it('treats only the transient marker as transient', () => {
    expect(isTransientAuthSessionError(AUTH_SESSION_ERRORS.transient)).toBe(true)
    expect(isTransientAuthSessionError(AUTH_SESSION_ERRORS.terminal)).toBe(false)
  })
})

describe('auth session responses', () => {
  it('recognises the proxy codes that end the local session', () => {
    expect(isTerminalAuthSessionResponse(401, { data: { code: 'AUTH_SESSION_EXPIRED' } })).toBe(true)
    expect(isTerminalAuthSessionResponse(401, { code: 'AUTH_SESSION_LOGGED_OUT' })).toBe(true)
    expect(isTerminalAuthSessionResponse(401, { code: 'AUTH_ACCESS_TOKEN_UNAVAILABLE' })).toBe(true)
  })

  it('leaves an upstream 401 without a known code alone', () => {
    expect(isTerminalAuthSessionResponse(401, { message: 'Forbidden tenant' })).toBe(false)
    expect(isTerminalAuthSessionResponse(401, undefined)).toBe(false)
    expect(isTerminalAuthSessionResponse(403, { code: 'AUTH_SESSION_EXPIRED' })).toBe(false)
  })

  it('recognises a transient refresh failure', () => {
    expect(isRefreshUnavailableResponse(503, { data: { code: 'AUTH_REFRESH_UNAVAILABLE' } })).toBe(true)
    expect(isRefreshUnavailableResponse(503, { code: 'SOMETHING_ELSE' })).toBe(false)
    expect(isRefreshUnavailableResponse(500, { code: 'AUTH_REFRESH_UNAVAILABLE' })).toBe(false)
  })
})

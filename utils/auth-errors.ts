export const AUTH_SESSION_ABSOLUTE_MAX_AGE_SECONDS = 8 * 24 * 60 * 60
export const AUTH_REFRESH_RETRY_DELAY_SECONDS = 30
export const AUTH_REFRESH_LEEWAY_SECONDS = 60

export const AUTH_SESSION_ERRORS = {
  terminal: 'RefreshTokenTerminalError',
  transient: 'RefreshTokenTransientError',
  absoluteExpired: 'SessionAbsoluteExpired'
} as const

export const AUTH_RESPONSE_CODES = {
  sessionExpired: 'AUTH_SESSION_EXPIRED',
  loggedOut: 'AUTH_SESSION_LOGGED_OUT',
  accessTokenUnavailable: 'AUTH_ACCESS_TOKEN_UNAVAILABLE',
  refreshUnavailable: 'AUTH_REFRESH_UNAVAILABLE'
} as const

export type AuthSessionError = typeof AUTH_SESSION_ERRORS[keyof typeof AUTH_SESSION_ERRORS]

const TERMINAL_RESPONSE_CODES = new Set<string>([
  AUTH_RESPONSE_CODES.sessionExpired,
  AUTH_RESPONSE_CODES.loggedOut,
  AUTH_RESPONSE_CODES.accessTokenUnavailable
])

export function isTerminalAuthSessionError(error: unknown): boolean {
  return error === AUTH_SESSION_ERRORS.terminal || error === AUTH_SESSION_ERRORS.absoluteExpired
}

export function isTransientAuthSessionError(error: unknown): boolean {
  return error === AUTH_SESSION_ERRORS.transient
}

function readResponseCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return undefined

  const record = payload as Record<string, unknown>
  if (typeof record.code === 'string')
    return record.code

  const data = record.data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const nested = (data as Record<string, unknown>).code
    if (typeof nested === 'string')
      return nested
  }

  return undefined
}

/**
 * A 401 alone is not enough: the tenant API returns legitimate 401s that must
 * reach the user instead of restarting the login flow.
 */
export function isTerminalAuthSessionResponse(status: number, payload: unknown): boolean {
  return status === 401 && TERMINAL_RESPONSE_CODES.has(readResponseCode(payload) ?? '')
}

export function isRefreshUnavailableResponse(status: number, payload: unknown): boolean {
  return status === 503 && readResponseCode(payload) === AUTH_RESPONSE_CODES.refreshUnavailable
}

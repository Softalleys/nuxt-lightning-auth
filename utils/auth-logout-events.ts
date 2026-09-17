export const AUTH_LOGOUT_BROADCAST_CHANNEL = 'lightning-auth.logout'
export const AUTH_LOGOUT_STORAGE_KEY = 'lightning-auth.logout-event'
export const AUTH_LOGOUT_GUARD_KEY = 'lightning-auth.logout-in-progress'

export interface AuthLogoutEvent {
  version: 1
  type: 'logout-committed'
  eventId: string
  fingerprint: string
  occurredAt: number
}

export interface StorageLike {
  getItem: (_key: string) => string | null
  setItem: (_key: string, _value: string) => void
  removeItem: (_key: string) => void
}

export function isAuthLogoutEvent(value: unknown): value is AuthLogoutEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false

  const event = value as Record<string, unknown>
  return event.version === 1
    && event.type === 'logout-committed'
    && typeof event.eventId === 'string'
    && event.eventId.length > 0
    && typeof event.fingerprint === 'string'
    && event.fingerprint.length > 0
    && typeof event.occurredAt === 'number'
    && Number.isFinite(event.occurredAt)
}

export function parseAuthLogoutEvent(value: string | null): AuthLogoutEvent | null {
  if (!value)
    return null

  try {
    const parsed = JSON.parse(value)
    return isAuthLogoutEvent(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function authLogoutEventMatchesSession(
  event: AuthLogoutEvent,
  sessionFingerprint: string | null
): boolean {
  return sessionFingerprint === event.fingerprint
}

export function markAuthLogoutInProgress(storage: StorageLike): void {
  try {
    storage.setItem(AUTH_LOGOUT_GUARD_KEY, 'true')
  } catch {
    // In-memory reconciliation still covers browsers with storage disabled.
  }
}

export function clearAuthLogoutInProgress(storage: StorageLike): void {
  try {
    storage.removeItem(AUTH_LOGOUT_GUARD_KEY)
  } catch {
    // A storage implementation that cannot write cannot retain the guard.
  }
}

export function isAuthLogoutInProgress(storage: StorageLike): boolean {
  try {
    return storage.getItem(AUTH_LOGOUT_GUARD_KEY) === 'true'
  } catch {
    return false
  }
}

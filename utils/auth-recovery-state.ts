import type { StorageLike } from './auth-logout-events'

export const AUTH_RECOVERY_STORAGE_KEY = 'lightning-auth.recovery-started-at'

export function resolveInternalReturnPath(candidate: string | undefined, origin: string): string {
  const fallback = '/'
  if (!candidate)
    return fallback

  try {
    const url = new URL(candidate, origin)
    if (
      url.origin !== origin
      || url.pathname === '/login'
      || url.pathname === '/logout/callback'
      || url.pathname.startsWith('/api/auth')
    ) {
      return fallback
    }

    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}

export function claimAuthRecovery(storage: StorageLike): boolean {
  try {
    if (storage.getItem(AUTH_RECOVERY_STORAGE_KEY))
      return false

    storage.setItem(AUTH_RECOVERY_STORAGE_KEY, 'started')
  } catch {
    // The module-level latch still protects browsers with storage disabled.
  }

  return true
}

export function clearAuthRecovery(storage: StorageLike): void {
  try {
    storage.removeItem(AUTH_RECOVERY_STORAGE_KEY)
  } catch {
    // Recovery stays functional when storage is unavailable.
  }
}

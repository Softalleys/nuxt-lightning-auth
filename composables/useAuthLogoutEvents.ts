import type { AuthLogoutEvent } from '../utils/auth-logout-events'
import {
  AUTH_LOGOUT_BROADCAST_CHANNEL,
  AUTH_LOGOUT_STORAGE_KEY
} from '../utils/auth-logout-events'

export function createAuthLogoutEvent(fingerprint: string): AuthLogoutEvent {
  return {
    version: 1,
    type: 'logout-committed',
    eventId: window.crypto.randomUUID(),
    fingerprint,
    occurredAt: Date.now()
  }
}

export function publishAuthLogoutEvent(event: AuthLogoutEvent): void {
  try {
    const channel = new BroadcastChannel(AUTH_LOGOUT_BROADCAST_CHANNEL)
    channel.postMessage(event)
    channel.close()
  } catch {
    // localStorage remains as the compatibility transport.
  }

  try {
    window.localStorage.setItem(AUTH_LOGOUT_STORAGE_KEY, JSON.stringify(event))
  } catch {
    // The initiating tab still logs out when storage is unavailable.
  }
}

import type { AuthLogoutEvent } from '../utils/auth-logout-events'
import {
  AUTH_LOGOUT_BROADCAST_CHANNEL,
  AUTH_LOGOUT_STORAGE_KEY,
  authLogoutEventMatchesSession,
  clearAuthLogoutInProgress,
  isAuthLogoutEvent,
  markAuthLogoutInProgress,
  parseAuthLogoutEvent
} from '../utils/auth-logout-events'

export default defineNuxtPlugin(() => {
  const { session, fetch: fetchSession, clear } = useUserSession()
  const router = useRouter()
  const seenEventIds = new Set<string>()
  const blockedSessions = new Map<string, AuthLogoutEvent>()
  const reconciliations = new Map<string, Promise<void>>()

  const currentFingerprint = () => {
    const value = (session.value as { fingerprint?: unknown } | null)?.fingerprint
    return typeof value === 'string' && value ? value : null
  }

  async function reconcileLogout(event: AuthLogoutEvent): Promise<void> {
    const existing = reconciliations.get(event.fingerprint)
    if (existing)
      return existing

    const pending = (async () => {
      const observed = currentFingerprint()
      if (observed && !authLogoutEventMatchesSession(event, observed))
        return

      markAuthLogoutInProgress(window.sessionStorage)

      try {
        await fetchSession()
        const refreshed = currentFingerprint()

        // A newer login in this tab must survive a late event from an old frame.
        if (refreshed && !authLogoutEventMatchesSession(event, refreshed)) {
          clearAuthLogoutInProgress(window.sessionStorage)
          return
        }

        if (authLogoutEventMatchesSession(event, refreshed))
          await clear()
      } catch {
        console.log('[AUTH] Local cleanup after a logout event did not complete')
      }

      if (router.currentRoute.value.path !== '/login')
        await router.replace('/login')
    })()

    reconciliations.set(event.fingerprint, pending)
    try {
      await pending
    } finally {
      reconciliations.delete(event.fingerprint)
    }
  }

  function receiveLogout(value: unknown): void {
    if (!isAuthLogoutEvent(value) || seenEventIds.has(value.eventId))
      return

    seenEventIds.add(value.eventId)
    if (seenEventIds.size > 128) {
      const oldest = seenEventIds.values().next().value
      if (typeof oldest === 'string')
        seenEventIds.delete(oldest)
    }

    blockedSessions.set(value.fingerprint, value)
    void reconcileLogout(value)
  }

  try {
    const channel = new BroadcastChannel(AUTH_LOGOUT_BROADCAST_CHANNEL)
    channel.addEventListener('message', event => receiveLogout(event.data))
  } catch {
    // The storage event stays as the compatibility transport.
  }

  window.addEventListener('storage', (event) => {
    if (event.key === AUTH_LOGOUT_STORAGE_KEY)
      receiveLogout(parseAuthLogoutEvent(event.newValue))
  })

  try {
    receiveLogout(parseAuthLogoutEvent(window.localStorage.getItem(AUTH_LOGOUT_STORAGE_KEY)))
  } catch {
    // BroadcastChannel remains available when localStorage is disabled.
  }

  watch(currentFingerprint, (fingerprint) => {
    const pending = fingerprint ? blockedSessions.get(fingerprint) : undefined
    if (pending)
      void reconcileLogout(pending)
  })
})

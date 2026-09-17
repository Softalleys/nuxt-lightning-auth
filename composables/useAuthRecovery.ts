import { isAuthLogoutInProgress } from '../utils/auth-logout-events'
import {
  claimAuthRecovery,
  clearAuthRecovery,
  resolveInternalReturnPath
} from '../utils/auth-recovery-state'

let recoveryPromise: Promise<void> | null = null

export function useAuthRecovery() {
  const route = useRoute()
  const { clear } = useUserSession()

  /**
   * Runs at most once per episode: a second failing request during the same
   * redirect must not start a competing login.
   */
  async function recoverAuthentication(requestedPath = route.fullPath): Promise<void> {
    if (import.meta.server)
      return
    if (recoveryPromise)
      return recoveryPromise
    if (isAuthLogoutInProgress(window.sessionStorage))
      return
    if (!claimAuthRecovery(window.sessionStorage))
      return

    const returnPath = resolveInternalReturnPath(requestedPath, window.location.origin)
    recoveryPromise = (async () => {
      try {
        await clear()
      } catch {
        console.log('[AUTH] Local session cleanup failed before reauthentication')
      }

      window.location.href = `/api/auth/login?return=${encodeURIComponent(returnPath)}`
    })()

    try {
      await recoveryPromise
    } finally {
      recoveryPromise = null
    }
  }

  function markAuthenticationHealthy(): void {
    if (import.meta.client)
      clearAuthRecovery(window.sessionStorage)
  }

  return { recoverAuthentication, markAuthenticationHealthy }
}

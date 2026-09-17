import { markAuthLogoutInProgress } from '../utils/auth-logout-events'
import { resolveInternalReturnPath } from '../utils/auth-recovery-state'

interface LogoutResponse {
  endSessionUrl: string | null
  logoutFingerprint: string | null
}

export function useAuthActions() {
  const { clear } = useUserSession()

  function buildLoginUrl(returnPath?: string, prompt?: 'select_account' | 'login'): string {
    const parameters = new URLSearchParams()
    const resolved = resolveInternalReturnPath(returnPath, window.location.origin)
    if (resolved !== '/')
      parameters.set('return', resolved)
    if (prompt)
      parameters.set('prompt', prompt)

    const query = parameters.toString()
    return query ? `/api/auth/login?${query}` : '/api/auth/login'
  }

  function startLogin(returnPath?: string, prompt?: 'select_account' | 'login'): void {
    window.location.href = buildLoginUrl(returnPath, prompt)
  }

  async function logout(): Promise<void> {
    markAuthLogoutInProgress(window.sessionStorage)

    let response: LogoutResponse = { endSessionUrl: null, logoutFingerprint: null }
    try {
      response = await $fetch<LogoutResponse>('/api/auth/logout', { method: 'POST' })
    } catch (error) {
      console.log('Error during logout:', error)
    }

    if (response.logoutFingerprint)
      publishAuthLogoutEvent(createAuthLogoutEvent(response.logoutFingerprint))

    try {
      await clear()
    } catch {
      // The server session is already gone; the redirect finishes the logout.
    }

    window.location.href = response.endSessionUrl ?? '/login'
  }

  return { buildLoginUrl, startLogin, logout }
}

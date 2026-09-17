import { resolveInternalReturnPath } from '../utils/auth-recovery-state'

export default defineNuxtRouteMiddleware((to) => {
  if (to.meta.auth === false)
    return

  const { loggedIn } = useUserSession()
  if (loggedIn.value)
    return

  const returnPath = resolveInternalReturnPath(to.fullPath, 'http://localhost')
  return navigateTo(returnPath === '/'
    ? '/login'
    : { path: '/login', query: { return: returnPath } })
})

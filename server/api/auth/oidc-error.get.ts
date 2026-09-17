import type { CapturedOidcError } from '../../../utils/oidc-error-cookie'
import { defineEventHandler, deleteCookie, getCookie } from 'h3'
import { OIDC_ERROR_COOKIE } from '../../../utils/oidc-error-cookie'

export default defineEventHandler((event): CapturedOidcError | null => {
  const rawValue = getCookie(event, OIDC_ERROR_COOKIE)
  deleteCookie(event, OIDC_ERROR_COOKIE, { path: '/' })
  if (!rawValue)
    return null

  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>
    return typeof parsed.error === 'string'
      ? {
          error: parsed.error,
          errorUri: typeof parsed.errorUri === 'string' ? parsed.errorUri : undefined
        }
      : null
  } catch {
    return null
  }
})

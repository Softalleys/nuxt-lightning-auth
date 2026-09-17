export const OIDC_ERROR_COOKIE = 'lightning-auth.oidc-error'

export interface CapturedOidcError {
  error: string
  errorUri?: string
}

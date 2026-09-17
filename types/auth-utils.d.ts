declare module '#auth-utils' {
  interface User {
    sub: string
    name: string | null
    email: string | null
    picture: string | null
    username: string | null
    tenant: string | null
    tenantId: string | null
    tenantName: string | null
    tenantPicture: string | null
    roles: string[]
    entitlements: string[]
    impersonated: boolean
  }

  interface SecureSessionData {
    accessToken?: string
    refreshToken?: string
    expiresAt?: number
    authStartedAt?: number
    sid?: string | null
    issuer?: string
    entitlementsUrl?: string | null
    applicationsUrl?: string | null
    refreshRetryAfter?: number
  }

  interface UserSession {
    fingerprint?: string
    error?: string
  }
}

export {}

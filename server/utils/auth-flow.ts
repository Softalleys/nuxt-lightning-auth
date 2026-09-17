import type { H3Event, Session } from 'h3'
import { getRequestURL, useSession } from 'h3'
import { resolveInternalReturnPath } from '../../utils/auth-recovery-state'
import { isSecureRequest, readSessionPassword } from './logout-tombstone'

export interface AuthFlowState extends Record<string, unknown> {
  codeVerifier?: string
  state?: string
  nonce?: string
  returnPath?: string
}

const FLOW_COOKIE = 'lightning-auth.flow'
const FLOW_MAX_AGE_SECONDS = 600

export function useAuthFlowSession(event: H3Event): Promise<Session<AuthFlowState>> {
  return useSession<AuthFlowState>(event, {
    name: FLOW_COOKIE,
    password: readSessionPassword(event),
    maxAge: FLOW_MAX_AGE_SECONDS,
    cookie: {
      sameSite: 'lax',
      secure: isSecureRequest(event),
      path: '/'
    }
  })
}

export function resolveApplicationOrigin(event: H3Event, configuredUrl?: string): string {
  if (configuredUrl) {
    try {
      return new URL(configuredUrl).origin
    } catch {
      // A malformed configuration value must not break the login redirect.
    }
  }

  return getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
}

export function resolveReturnPath(candidate: unknown, origin: string): string {
  return resolveInternalReturnPath(
    typeof candidate === 'string' ? candidate : undefined,
    origin
  )
}

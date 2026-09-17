import { randomBytes, randomUUID } from 'node:crypto'
import { defineEventHandler, getQuery, setResponseHeaders } from 'h3'
import {
  AUTH_LOGOUT_BROADCAST_CHANNEL,
  AUTH_LOGOUT_STORAGE_KEY
} from '../../../utils/auth-logout-events'
import {
  appendTombstone,
  createSessionFingerprint,
  readSessionPassword
} from '../../utils/logout-tombstone'
import { readLightningAuthConfig } from '../../utils/oidc'

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

export default defineEventHandler(async (event) => {
  const config = readLightningAuthConfig(event)
  const issuerOrigin = new URL(config.issuer).origin
  const query = getQuery(event)
  const issuer = typeof query.iss === 'string' ? query.iss.replace(/\/+$/, '') : null
  const sid = typeof query.sid === 'string' && query.sid.length > 0 && query.sid.length <= 2048
    ? query.sid
    : null
  const nonce = randomBytes(18).toString('base64url')

  let logoutEvent: Record<string, unknown> | null = null

  if (issuer === config.issuer && sid) {
    const fingerprint = createSessionFingerprint(config.issuer, sid)
    try {
      const session = await getUserSession(event) as { fingerprint?: string }

      // The tombstone is written before the session is cleared: a refresh that
      // is already in flight can restore the cookie, but not an ended sid.
      appendTombstone(event, readSessionPassword(event), fingerprint)

      if (session.fingerprint === fingerprint)
        await clearUserSession(event)

      logoutEvent = {
        version: 1,
        type: 'logout-committed',
        eventId: randomUUID(),
        fingerprint,
        occurredAt: Date.now()
      }
    } catch {
      console.log('[AUTH] Front-channel logout could not be persisted')
    }
  }

  setResponseHeaders(event, {
    'cache-control': 'no-store',
    'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors ${issuerOrigin}; base-uri 'none'; form-action 'none'`,
    'content-type': 'text/html; charset=utf-8',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff'
  })

  const script = logoutEvent
    ? `const logoutEvent = ${safeJson(logoutEvent)};
try { const channel = new BroadcastChannel(${safeJson(AUTH_LOGOUT_BROADCAST_CHANNEL)}); channel.postMessage(logoutEvent); channel.close(); } catch {}
try { localStorage.setItem(${safeJson(AUTH_LOGOUT_STORAGE_KEY)}, JSON.stringify(logoutEvent)); } catch {}`
    : ''

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Signed out</title></head>
<body>
<script nonce="${nonce}">
${script}
try {
  if (window.parent !== window)
    window.parent.postMessage({ type: 'lightning-auth:frontchannel-logout-complete' }, ${safeJson(issuerOrigin)});
} catch {}
</script>
</body>
</html>`
})

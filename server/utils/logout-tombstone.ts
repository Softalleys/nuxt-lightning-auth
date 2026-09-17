import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { getHeader, getRequestURL, parseCookies, setCookie } from 'h3'
import { AUTH_SESSION_ABSOLUTE_MAX_AGE_SECONDS } from '../../utils/auth-errors'

const SECURE_COOKIE = '__Host-lightning-auth.logout'
const DEVELOPMENT_COOKIE = 'lightning-auth.logout'
const MAX_TOMBSTONES = 32

export interface LogoutTombstone {
  fingerprint: string
  createdAt: number
}

export function readSessionPassword(event: H3Event): string {
  const password = (useRuntimeConfig(event).session as { password?: string } | undefined)?.password
  if (typeof password !== 'string' || password.length < 32)
    throw new Error('NUXT_SESSION_PASSWORD must be at least 32 characters')

  return password
}

export function createSessionFingerprint(issuer: string, sid: string): string {
  return createHash('sha256')
    .update(issuer)
    .update(String.fromCharCode(0))
    .update(sid)
    .digest('base64url')
}

export function isSecureRequest(event: H3Event): boolean {
  const forwarded = getHeader(event, 'x-forwarded-proto')?.split(',', 1)[0]?.trim().toLowerCase()
  if (forwarded === 'https')
    return true
  if (forwarded === 'http')
    return false

  return getRequestURL(event, { xForwardedProto: false }).protocol === 'https:'
}

function cookieName(event: H3Event): string {
  return isSecureRequest(event) ? SECURE_COOKIE : DEVELOPMENT_COOKIE
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function serializeTombstones(tombstones: LogoutTombstone[], secret: string): string {
  const payload = Buffer
    .from(JSON.stringify(tombstones.map(item => [item.fingerprint, item.createdAt])), 'utf8')
    .toString('base64url')

  return `${payload}.${sign(payload, secret)}`
}

export function deserializeTombstones(
  value: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): LogoutTombstone[] {
  if (!value)
    return []

  const separator = value.lastIndexOf('.')
  if (separator <= 0)
    return []

  const payload = value.slice(0, separator)
  const signature = Buffer.from(value.slice(separator + 1), 'base64url')
  const expected = Buffer.from(sign(payload, secret), 'base64url')
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected))
    return []

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!Array.isArray(parsed))
      return []

    return parsed.flatMap((entry) => {
      if (
        !Array.isArray(entry)
        || typeof entry[0] !== 'string'
        || typeof entry[1] !== 'number'
        || entry[1] > nowSeconds
        || entry[1] <= nowSeconds - AUTH_SESSION_ABSOLUTE_MAX_AGE_SECONDS
      ) {
        return []
      }

      return [{ fingerprint: entry[0], createdAt: entry[1] }]
    })
  } catch {
    return []
  }
}

export function addTombstone(
  tombstones: LogoutTombstone[],
  fingerprint: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): LogoutTombstone[] {
  return [
    ...tombstones.filter(item => item.fingerprint !== fingerprint),
    { fingerprint, createdAt: nowSeconds }
  ]
    .sort((left, right) => left.createdAt - right.createdAt)
    .slice(-MAX_TOMBSTONES)
}

export function readTombstones(event: H3Event, secret: string): LogoutTombstone[] {
  return deserializeTombstones(parseCookies(event)[cookieName(event)], secret)
}

export function appendTombstone(event: H3Event, secret: string, fingerprint: string): void {
  const tombstones = addTombstone(readTombstones(event, secret), fingerprint)
  setCookie(event, cookieName(event), serializeTombstones(tombstones, secret), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(event),
    path: '/',
    maxAge: AUTH_SESSION_ABSOLUTE_MAX_AGE_SECONDS
  })
}

export function isTombstoned(event: H3Event, secret: string, fingerprint: string | null): boolean {
  if (!fingerprint)
    return false

  return readTombstones(event, secret).some(item => item.fingerprint === fingerprint)
}

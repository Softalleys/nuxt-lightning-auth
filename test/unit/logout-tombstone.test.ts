import { describe, expect, it } from 'vitest'
import {
  addTombstone,
  createSessionFingerprint,
  deserializeTombstones,
  serializeTombstones
} from '../../server/utils/logout-tombstone'

const SECRET = 'a'.repeat(32)
const ISSUER = 'https://accounts.example.com'

describe('session fingerprints', () => {
  it('separates issuer and session id so they cannot be confused', () => {
    expect(createSessionFingerprint(ISSUER, 'abc'))
      .not
      .toBe(createSessionFingerprint(`${ISSUER}abc`, ''))
  })

  it('is stable for the same pair', () => {
    expect(createSessionFingerprint(ISSUER, 'abc')).toBe(createSessionFingerprint(ISSUER, 'abc'))
  })
})

describe('tombstone cookie', () => {
  const now = 1_700_000_000

  it('round-trips signed entries', () => {
    const tombstones = [{ fingerprint: 'one', createdAt: now - 10 }]
    const cookie = serializeTombstones(tombstones, SECRET)
    expect(deserializeTombstones(cookie, SECRET, now)).toEqual(tombstones)
  })

  it('rejects a tampered payload or a foreign signature', () => {
    const cookie = serializeTombstones([{ fingerprint: 'one', createdAt: now - 10 }], SECRET)
    const [payload, signature] = cookie.split('.')
    expect(deserializeTombstones(`${payload}x.${signature}`, SECRET, now)).toEqual([])
    expect(deserializeTombstones(cookie, 'b'.repeat(32), now)).toEqual([])
    expect(deserializeTombstones('garbage', SECRET, now)).toEqual([])
    expect(deserializeTombstones(undefined, SECRET, now)).toEqual([])
  })

  it('drops entries that are in the future or older than the absolute session lifetime', () => {
    const cookie = serializeTombstones([
      { fingerprint: 'future', createdAt: now + 60 },
      { fingerprint: 'ancient', createdAt: now - 9 * 24 * 60 * 60 },
      { fingerprint: 'valid', createdAt: now - 60 }
    ], SECRET)

    expect(deserializeTombstones(cookie, SECRET, now)).toEqual([
      { fingerprint: 'valid', createdAt: now - 60 }
    ])
  })
})

describe('addTombstone', () => {
  it('replaces an existing fingerprint instead of duplicating it', () => {
    const existing = [{ fingerprint: 'one', createdAt: 10 }]
    expect(addTombstone(existing, 'one', 20)).toEqual([{ fingerprint: 'one', createdAt: 20 }])
  })

  it('keeps only the newest 32 entries', () => {
    let tombstones: ReturnType<typeof addTombstone> = []
    for (let index = 0; index < 40; index += 1)
      tombstones = addTombstone(tombstones, `session-${index}`, 1000 + index)

    expect(tombstones).toHaveLength(32)
    expect(tombstones[0]?.fingerprint).toBe('session-8')
    expect(tombstones.at(-1)?.fingerprint).toBe('session-39')
  })
})

import { describe, expect, it } from 'vitest'
import {
  AUTH_RECOVERY_STORAGE_KEY,
  claimAuthRecovery,
  clearAuthRecovery,
  resolveInternalReturnPath
} from '../../utils/auth-recovery-state'

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    values
  }
}

describe('resolveInternalReturnPath', () => {
  const origin = 'https://cloud.rastreo.express'

  it('keeps an internal path with query and hash', () => {
    expect(resolveInternalReturnPath('/vehicles?page=2#list', origin)).toBe('/vehicles?page=2#list')
  })

  it('rejects other origins and auth routes', () => {
    expect(resolveInternalReturnPath('https://evil.test/steal', origin)).toBe('/')
    expect(resolveInternalReturnPath('/login', origin)).toBe('/')
    expect(resolveInternalReturnPath('/logout/callback', origin)).toBe('/')
    expect(resolveInternalReturnPath('/api/auth/login', origin)).toBe('/')
    expect(resolveInternalReturnPath(undefined, origin)).toBe('/')
  })
})

describe('recovery latch', () => {
  it('is claimed once until cleared', () => {
    const storage = createStorage()
    expect(claimAuthRecovery(storage)).toBe(true)
    expect(storage.values.get(AUTH_RECOVERY_STORAGE_KEY)).toBe('started')
    expect(claimAuthRecovery(storage)).toBe(false)

    clearAuthRecovery(storage)
    expect(claimAuthRecovery(storage)).toBe(true)
  })

  it('still allows recovery when storage throws', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      }
    }

    expect(claimAuthRecovery(storage)).toBe(true)
    expect(() => clearAuthRecovery(storage)).not.toThrow()
  })
})

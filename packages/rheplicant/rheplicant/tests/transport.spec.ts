import { describe, expect, it } from 'vitest'
import { asTransport, isTransport, TRANSPORTS } from '@rheplicant/dsh-rheplicant/types'
import { ComputeError } from '@rheplicant/dsh-rheplicant'

describe('the transport names', () => {
  it('are the three the seam registers providers under', () => {
    expect([...TRANSPORTS]).toEqual(['local', 'ssh', 'http'])
  })
})

describe('isTransport', () => {
  it.each(['local', 'ssh', 'http'])('accepts %s', (name) => {
    expect(isTransport(name)).toBe(true)
  })

  it.each(['locl', 'LOCAL', '', 'stdio', undefined, null, 7, {}])('rejects %s', (value) => {
    expect(isTransport(value)).toBe(false)
  })
})

describe('asTransport', () => {
  it('passes a valid name through', () => {
    expect(asTransport('ssh', 'rheplicant_run')).toBe('ssh')
  })

  it('refuses a misspelling by NAMING the valid set', () => {
    // The failure this replaces: a typo reached the seam and came back as
    // "no provider is registered for transport 'locl'", which reads as a
    // composition problem — you forgot to mount something — rather than as
    // the typo it is. A model reading that goes looking for the wrong fix.
    expect(() => asTransport('locl', 'rheplicant_run'))
      .toThrow(/rheplicant_run.*locl.*local.*ssh.*http/s)
  })

  it('refuses with a routable code rather than a bare Error', () => {
    try {
      asTransport('locl', 'rheplicant_run')
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(ComputeError)
      expect((error as ComputeError).code).toBe('INVALID_TRANSPORT')
    }
  })

  it('refuses a non-string just as firmly', () => {
    expect(() => asTransport(7, 'rheplicant_gates')).toThrow(/rheplicant_gates/)
  })
})

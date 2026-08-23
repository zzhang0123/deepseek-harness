import { describe, expect, it } from 'vitest'
import { formatGatesReport } from '@rheplicant/dsh-rheplicant-tool-gates'
import type { CheckCost, GatesReport } from '@rheplicant/dsh-rheplicant'

/** A gates report carrying the given checks and nothing else. */
function report(checks: CheckCost[]): GatesReport {
  return { checks, runs: [], warnings: [] }
}

/** One check, defaulting to the shape a live `gates` answer produces. */
function check(over: Partial<CheckCost> = {}): CheckCost {
  return { check: 'linearity', state: 'warn', ...over } as CheckCost
}

describe('what the model reads', () => {
  it('names each check and the state that governs it', () => {
    expect(formatGatesReport(report([check()]))).toBe('- linearity: warn')
  })

  it('says so when there are no checks at all', () => {
    expect(formatGatesReport(report([]))).toBe('no checks declared')
  })

  it('gives one line per check, in the order the service listed them', () => {
    const text = formatGatesReport(report([
      check({ check: 'identifiability', state: 'off' }),
      check({ check: 'linearity', state: 'refuse' }),
    ]))
    expect(text).toBe('- identifiability: off\n- linearity: refuse')
  })
})

describe('a cost the service has not computed', () => {
  it('is omitted, not printed as the word undefined', () => {
    // `CheckCost.cost` is optional and the service does not compute it — its
    // own type says "the design promises it, the wire does not carry it". So
    // EVERY real gates call rendered "- linearity: warn (undefined)" into the
    // model's context. Worse than silence: it reads as a cost that was
    // measured and came back missing.
    expect(formatGatesReport(report([check()]))).not.toContain('undefined')
  })

  it('is shown when there is one', () => {
    expect(formatGatesReport(report([check({ cost: 'one extra solve' })])))
      .toBe('- linearity: warn (one extra solve)')
  })
})

describe('which of the two mode fields wins', () => {
  it('prefers `state`, the value that actually governs', () => {
    expect(formatGatesReport(report([check({ state: 'skip', mode: 'warn' })])))
      .toBe('- linearity: skip')
  })

  it('falls back to `mode` for an event written before `state` existed', () => {
    // Back-compat, not a workaround: a durable event from before 2026-08-23
    // carries the effective state under `mode`.
    const legacy = { check: 'linearity', mode: 'warn' } as CheckCost
    expect(formatGatesReport(report([legacy]))).toBe('- linearity: warn')
  })

  it('says `unknown` rather than nothing when neither is present', () => {
    const neither = { check: 'linearity' } as CheckCost
    expect(formatGatesReport(report([neither]))).toBe('- linearity: unknown')
  })
})

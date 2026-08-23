import { describe, expect, it } from 'vitest'
import { formatRunOutcome } from '@rheplicant/dsh-rheplicant-tool-run'
import type { RunOutcome } from '@rheplicant/dsh-rheplicant'

const EXECUTION = '20260823T094325Z-1c1f0ed5-tf6djb'

/** An outcome carrying the given runs and nothing else. */
function outcome(runs: unknown[]): RunOutcome {
  return { runs } as unknown as RunOutcome
}

describe('the line that identifies the execution', () => {
  it('leads, because two runs of one document report identical run lines', () => {
    // The seed is fixed, so the same document run twice produces the same
    // text below this line. The id is what tells the model which one it is
    // reading.
    const text = formatRunOutcome(outcome([{ name: 'simulate', kind: 'forward', status: 'ok' }]), EXECUTION)
    expect(text.split('\n')[0]).toBe(`execution ${EXECUTION}`)
  })

  it('is still there when nothing ran', () => {
    expect(formatRunOutcome(outcome([]), EXECUTION)).toBe(`execution ${EXECUTION}`)
  })
})

describe('a run that succeeded', () => {
  it('names it, its kind and its status', () => {
    expect(formatRunOutcome(outcome([{ name: 'simulate', kind: 'forward', status: 'ok' }]), EXECUTION))
      .toContain('- simulate (forward): ok')
  })

  it('carries its diagnostics when it has them', () => {
    const text = formatRunOutcome(
      outcome([{ name: 'fit', kind: 'nuts', status: 'ok', diagnostics: { converged: true } }]),
      EXECUTION,
    )
    expect(text).toContain('diagnostics: {"converged":true}')
  })

  it('says nothing about diagnostics when there are none', () => {
    // An absent diagnostics block is "this kind produces none", not "they
    // came back empty", and printing `| diagnostics: undefined` would say the
    // second.
    expect(formatRunOutcome(outcome([{ name: 'simulate', kind: 'forward', status: 'ok' }]), EXECUTION))
      .not.toContain('diagnostics')
  })
})

describe('a run that failed', () => {
  it('says FAILED and quotes the error', () => {
    const text = formatRunOutcome(
      outcome([{ name: 'fit', kind: 'nuts', status: 'failed', error: { message: 'diverged' } }]),
      EXECUTION,
    )
    expect(text).toContain('- fit (nuts): FAILED — diverged')
  })

  it('still says FAILED when the error carries no message', () => {
    // A failure with no message is still a failure, and reporting it as an
    // ok run would be the worst available answer.
    const text = formatRunOutcome(outcome([{ name: 'fit', kind: 'nuts', status: 'failed' }]), EXECUTION)
    expect(text).toContain('- fit (nuts): FAILED — error')
  })
})

describe('a mixed outcome', () => {
  it('reports every run, in declaration order', () => {
    const text = formatRunOutcome(outcome([
      { name: 'simulate', kind: 'forward', status: 'ok' },
      { name: 'fit', kind: 'nuts', status: 'failed', error: { message: 'no' } },
    ]), EXECUTION)
    expect(text.split('\n').slice(1)).toEqual([
      '- simulate (forward): ok',
      '- fit (nuts): FAILED — no',
    ])
  })
})

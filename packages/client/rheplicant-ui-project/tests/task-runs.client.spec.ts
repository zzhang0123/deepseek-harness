import { describe, expect, it } from 'vitest'
import { exitsInPlay } from '../src/client/task-runs.ts'
import type { DocumentRuns } from '@rheplicant/dsh-rheplicant'

const exit = (kind: string, fitting: boolean, products: string[] = []) =>
  ({ kind, fitting, summary: `what ${kind} does`, products })

function runs(over: Partial<DocumentRuns> = {}): DocumentRuns {
  return {
    exitsTotal: 4,
    catalogue: [
      exit('forward', false, ['arrays']),
      exit('nuts', true, ['draws', 'chains']),
      exit('fisher', true, ['covariance']),
      exit('mmodes', false, ['arrays']),
    ],
    declared: [],
    reserved: [],
    ...over,
  }
}

const declared = (index: number, kind: string, known = true) =>
  ({ index, name: `r${index}`, kind, known, products: [], deferredChecks: [] })

describe('which exits a task uses', () => {
  it('marks the declared ones and leaves the rest', () => {
    const view = exitsInPlay(runs({ declared: [declared(0, 'nuts')] }))
    expect(view.entries.filter(entry => entry.used).map(entry => entry.kind)).toEqual(['nuts'])
    expect(view.usedCount).toBe(1)
  })

  it('counts one exit once however many runs invoke it', () => {
    const view = exitsInPlay(runs({ declared: [declared(0, 'forward'), declared(1, 'forward')] }))
    expect(view.usedCount).toBe(1)
  })

  it('never counts a kind the grammar does not run', () => {
    // A document may name anything. Counting it would make the ratio lie.
    const view = exitsInPlay(runs({ declared: [declared(0, 'made-up', false)] }))
    expect(view.usedCount).toBe(0)
    expect(view.unknown).toEqual(['made-up'])
  })
})

describe('what the task is not reaching for', () => {
  it('counts the unused exits that need a fitted parameter space', () => {
    // The honest form of "not defaulting to forward only". The source
    // defends `fitting`; it does not define a capability, so nothing here
    // claims one.
    const view = exitsInPlay(runs({ declared: [declared(0, 'forward')] }))
    expect(view.unusedFitting).toBe(2)
  })

  it('counts nothing unused when every exit is in play', () => {
    const view = exitsInPlay(runs({
      declared: ['forward', 'nuts', 'fisher', 'mmodes'].map((k, i) => declared(i, k)),
    }))
    expect(view.usedCount).toBe(4)
    expect(view.unusedFitting).toBe(0)
  })
})

describe('the reading order', () => {
  it('puts the exits this task uses first, then the rest as the grammar lists them', () => {
    // What you declared is what you are reading about; the catalogue below
    // it is what you did not reach for.
    const view = exitsInPlay(runs({ declared: [declared(0, 'fisher')] }))
    expect(view.entries.map(entry => entry.kind)).toEqual(['fisher', 'forward', 'nuts', 'mmodes'])
  })
})

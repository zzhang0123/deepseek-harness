import { describe, expect, it } from 'vitest'
import { receipt } from '@rheplicant/dsh-rheplicant-tool-run'
import type { RunOutcome } from '@rheplicant/dsh-rheplicant'

/** One outcome carrying every array the wire can hold. */
function outcome(over: Partial<RunOutcome> = {}): RunOutcome {
  return {
    runs: [{
      name: 'posterior',
      kind: 'nuts',
      status: 'ok',
      diagnostics: { rhat: 1.01, divergences: 0 },
      product: { kind: 'draws', samples: { depth: [1, 2, 3] } },
      chains: { depth: [1, 2, 3] },
      spectrum: [[1, 2], [3, 4]],
    }],
    gates: [],
    tookMs: 12,
    ...over,
  } as RunOutcome
}

describe('a PUBLISHED execution', () => {
  const logged = receipt(outcome({ resultsPath: '/w/results/t/EXEC-1' }))

  it('logs no arrays, because the folder already holds them', () => {
    // The 4096-element payload budget exists precisely because arrays were
    // being stuffed into events (`docs/project-model.md` §5).
    const [run] = logged.runs
    expect('product' in run).toBe(false)
    expect('chains' in run).toBe(false)
    expect('spectrum' in run).toBe(false)
  })

  it('keeps everything the transcript needs to read on its own', () => {
    const [run] = logged.runs
    expect(run.name).toBe('posterior')
    expect(run.kind).toBe('nuts')
    expect(run.status).toBe('ok')
    expect(run.diagnostics).toEqual({ rhat: 1.01, divergences: 0 })
    expect(logged.resultsPath).toBe('/w/results/t/EXEC-1')
    expect(logged.gates).toEqual([])
  })

  it('does not mutate the outcome the caller still holds', () => {
    const original = outcome({ resultsPath: '/w/results/t/EXEC-1' })
    receipt(original)
    expect(original.runs[0]?.chains).toEqual({ depth: [1, 2, 3] })
  })
})

describe('an UNPUBLISHED run', () => {
  it('keeps its arrays, because its event is the only record there is', () => {
    // Inline scratch work has no folder. Stripping here would delete the only
    // copy, which is the opposite of what the receipt exists to do.
    const [run] = receipt(outcome()).runs
    expect(run.chains).toEqual({ depth: [1, 2, 3] })
    expect(run.product).toBeDefined()
    expect(run.spectrum).toBeDefined()
  })
})

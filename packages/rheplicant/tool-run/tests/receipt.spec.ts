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

/**
 * The first run entry, or a failure that names the problem.
 *
 * `noUncheckedIndexedAccess` types every index read as possibly undefined, and
 * the host aggregate compiles this file under it. A guard beats a `!` here:
 * an empty `runs` would otherwise surface as ten "possibly undefined" reads
 * rather than one clear "the receipt dropped every run".
 */
function firstRun(entries: RunOutcome['runs']): RunOutcome['runs'][number] {
  const [run] = entries
  if (run === undefined) throw new Error('the receipt carried no runs at all')
  return run
}

describe('a PUBLISHED execution', () => {
  const logged = receipt(outcome({ resultsPath: '/w/results/t/EXEC-1' }))

  it('logs no arrays, because the folder already holds them', () => {
    // The 4096-element payload budget exists precisely because arrays were
    // being stuffed into events (`docs/project-model.md` §5).
    const run = firstRun(logged.runs)
    expect('product' in run).toBe(false)
    expect('chains' in run).toBe(false)
    expect('spectrum' in run).toBe(false)
  })

  it('keeps everything the transcript needs to read on its own', () => {
    const run = firstRun(logged.runs)
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
    const run = firstRun(receipt(outcome()).runs)
    expect(run.chains).toEqual({ depth: [1, 2, 3] })
    expect(run.product).toBeDefined()
    expect(run.spectrum).toBeDefined()
  })
})

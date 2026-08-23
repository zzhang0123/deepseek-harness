// @vitest-environment jsdom
/**
 * The identifiability panel: rank/nullity and the singular-value spectrum.
 *
 * Retired from the two console e2e files for the reason
 * `SpectrumPanel.client.spec.tsx` records.
 */
import { cleanup, render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { IdentifiabilityPanel } from '../src/client/IdentifiabilityPanel.tsx'

afterEach(() => { cleanup() })

const NO_SESSION = { views: new Map(), chat: { nodes: new Map() }, nodes: [] }
const useSession = <T,>(selector: (snapshot: ConversationSnapshot) => T): T =>
  selector(NO_SESSION as unknown as ConversationSnapshot)

/** The run the retired browser fixture seeded, verbatim. */
const IDENT = {
  name: 'ident',
  kind: 'identifiability',
  status: 'ok' as const,
  diagnostics: { rank: 6, nullity: 0, singular_values: [10, 8, 5, 3, 1], notes: [] },
}

function draw(runs: readonly unknown[] = [IDENT]): void {
  render(<IdentifiabilityPanel {...({ useSession, execution: { executionId: 'E1', runs } } as unknown as ComponentProps<typeof IdentifiabilityPanel>)} />)
}

describe('the identifiability panel', () => {
  it('names itself in the shared panel chrome', () => {
    draw()
    expect(document.querySelector('[data-panel="identifiability"] [data-panel-title]')?.textContent)
      .toBe('Identifiability')
  })

  it('renders the run and one bar per singular value', () => {
    draw()
    expect(document.querySelectorAll('[data-identifiability-run][data-run-name="ident"]').length).toBe(1)
    expect(document.querySelectorAll('[data-bar]').length).toBe(5)
  })

  it('renders no row for a run with no identifiability diagnostics', () => {
    draw([{ name: 'fit', kind: 'nuts', status: 'ok' }])
    expect(document.querySelectorAll('[data-identifiability-run]').length).toBe(0)
  })
})

/**
 * The rank-cutoff case, ported from `rheplicant-console-charts.e2e.ts` for the
 * reason this file's header records: a rank BELOW the number of singular
 * values, so the chart has a cutoff to draw and `weakest_identified` is a real
 * ratio rather than 1.
 */
describe('a rank cutoff inside the singular-value spectrum', () => {
  const RANK_3 = {
    name: 'ident',
    kind: 'identifiability',
    status: 'ok' as const,
    // weakest_identified = singular_values[rank-1] / singular_values[0] = 30/120.
    diagnostics: {
      rank: 3, nullity: 2, singular_values: [120, 80, 30, 4, 0.5], weakest_identified: 0.25, notes: [],
    },
  }

  it('draws one bar per singular value and one cutoff line', () => {
    draw([RANK_3])
    const chart = document.querySelector('[data-singular-values]')!
    expect(chart.querySelectorAll('[data-bar]').length).toBe(5)
    expect(chart.querySelectorAll('[data-cutoff]').length).toBe(1)
  })

  it('reports rank, nullity and the weakest identified direction', () => {
    draw([RANK_3])
    const run = document.querySelector('[data-identifiability-run][data-run-name="ident"]')!
    expect(run.querySelector('[data-stat="rank"] [data-stat-value]')?.textContent).toContain('3')
    expect(run.querySelector('[data-stat="nullity"] [data-stat-value]')?.textContent).toContain('2')
    expect(run.querySelector('[data-stat="weakest_identified"] [data-stat-value]')?.textContent)
      .toContain('0.25')
  })
})

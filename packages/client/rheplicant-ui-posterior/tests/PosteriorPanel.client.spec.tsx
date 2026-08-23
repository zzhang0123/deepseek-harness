// @vitest-environment jsdom
/**
 * The posterior panel's chart rendering — per-latent marginals, the corner
 * plot behind its disclosure, and the diagnostics chips.
 *
 * **These assertions used to live in `rheplicant-ui-console-load.e2e.ts`**,
 * driven through the console's `console.panel` grid off a seeded session log.
 * §20.4 removed that grid, and the workbench that replaced it reads the
 * published TREE rather than a session log — so a seeded, never-published run
 * has no browser surface to be asserted on any more. The coverage moves here
 * instead of disappearing, and it is better placed: what those assertions
 * actually checked was this component's own rendering, driven by the same
 * owner prop the workbench supplies.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { PosteriorPanel } from '../src/client/PosteriorPanel.tsx'

// Auto-cleanup is not registered in this repo (no vitest `globals`), so an
// uncleaned tree leaks into the next test.
afterEach(() => { cleanup() })

/** The workbench has no conversation, so its panels read an empty one. */
const NO_SESSION = { views: new Map(), chat: { nodes: new Map() }, nodes: [] }
const useSession = <T,>(selector: (snapshot: ConversationSnapshot) => T): T =>
  selector(NO_SESSION as unknown as ConversationSnapshot)

/** The same run the retired browser fixture seeded, verbatim. */
const FIT = {
  name: 'fit',
  kind: 'nuts',
  status: 'ok' as const,
  diagnostics: { rhat: 1.002, n_eff: 1327, divergences: 0, notes: [] },
  chains: {
    g: [1.0, 1.1, 1.2, 1.05, 1.08, 1.15],
    amp: [0.5, 0.51, 0.49, 0.52, 0.5, 0.5],
  },
}

function draw(runs: readonly unknown[] = [FIT]): void {
  render(
    <PosteriorPanel
      {...({ useSession, execution: { executionId: 'E1', runs } } as unknown as ComponentProps<typeof PosteriorPanel>)}
    />,
  )
}

describe('the posterior panel, driven by the execution it is given', () => {
  it('names itself in the panel chrome every occupant shares', () => {
    draw()
    expect(document.querySelector('[data-panel="posterior"]')).toBeTruthy()
    expect(document.querySelector('[data-panel="posterior"] [data-panel-title]')?.textContent)
      .toBe('Posterior')
  })

  it('renders one row per run in the execution', () => {
    draw()
    const rows = document.querySelectorAll('[data-posterior-run]')
    expect(rows.length).toBe(1)
    expect(rows[0]?.getAttribute('data-run-name')).toBe('fit')
  })

  it('folds each chain series into a marginal histogram with real bins', () => {
    draw()
    const marginals = document.querySelectorAll('[data-marginal]')
    expect(marginals.length).toBe(2)
    expect(marginals[0]?.querySelectorAll('[data-bin]').length).toBeGreaterThan(0)
  })

  it('keeps the corner plot behind a disclosure, and draws it when opened', () => {
    draw()
    const details = document.querySelector('[data-corner-details]')
    expect(details).toBeTruthy()
    fireEvent.click(details!.querySelector('summary')!)
    const grid = document.querySelector('[data-corner-grid]')
    expect(grid).toBeTruthy()
    // One diagonal per latent, one cell per lower-triangle pair.
    expect(grid!.querySelectorAll('[data-corner-diagonal]').length).toBeGreaterThan(0)
    expect(grid!.querySelectorAll('[data-corner-cell]').length).toBeGreaterThan(0)
  })

  it('folds the run diagnostics into the shared stat chips', () => {
    draw()
    expect(document.querySelector('[data-stat="rhat"] [data-stat-value]')?.textContent)
      .toContain('1.002')
    expect(document.querySelector('[data-stat="n_eff"] [data-stat-value]')?.textContent)
      .toContain('1,327')
  })

  it('draws nothing for a run with no draws, rather than an empty chart', () => {
    draw([{ name: 'fwd', kind: 'forward', status: 'ok' }])
    expect(document.querySelectorAll('[data-posterior-run]').length).toBe(0)
  })
})


describe('a historical event carrying an explicit null', () => {
  /**
   * Real session logs on a developer machine carry `"chains": null` — the
   * shape the service emitted before it stopped sending explicit nulls for an
   * optional field. An `undefined`-only guard lets it through, `Object.entries`
   * throws, and a throw inside a slot renderer takes the whole slot down. A
   * previous session patched this into `node_modules` and the next repack
   * overwrote it; this pins it at the source.
   */
  it('renders its empty state instead of crashing', () => {
    expect(() => { draw([{ name: 'fit', kind: 'nuts', status: 'ok', chains: null }]) }).not.toThrow()
    expect(document.querySelectorAll('[data-posterior-run]').length).toBe(0)
    expect(document.querySelector('[data-panel="posterior"]')).toBeTruthy()
  })
})

// @vitest-environment jsdom
/**
 * The chains and posterior panels over the FULL wire chain grammar: two
 * scalar series, a fanned component pair, a credible-band triplet, and a
 * per-latent `mcmc` diagnostics bag with one latent over the r_hat threshold.
 *
 * **Ported from `rheplicant-console-charts.e2e.ts`.** That scenario drove the
 * console's `console.panel` grid off a seeded session log; §20.4 removed the
 * grid, and the workbench that replaced it reads the published TREE, so a
 * seeded never-published run has no browser surface left to assert on. Every
 * assertion below is the same one, against the same fixture values, driven
 * through the `execution` owner prop the workbench supplies.
 *
 * One assertion did NOT survive the move and is called out rather than
 * quietly dropped: the chart-kit tooltip on hover. It needs real layout —
 * jsdom's `getBoundingClientRect` answers zeroes, so the pointer maths that
 * decides which datum is under the cursor has nothing to work with.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { ChainsPanel } from '../src/client/ChainsPanel.tsx'
import { PosteriorPanel } from '../src/client/PosteriorPanel.tsx'

afterEach(() => { cleanup() })

const NO_SESSION = { views: new Map(), chat: { nodes: new Map() }, nodes: [] }
const useSession = <T,>(selector: (snapshot: ConversationSnapshot) => T): T =>
  selector(NO_SESSION as unknown as ConversationSnapshot)

/** 40 points, a smooth arch — the band fixture's shape, generated not pasted. */
function band(offset: number): number[] {
  return Array.from({ length: 40 }, (_, i) => Number((10 + offset + 2 * Math.sin(i / 6)).toFixed(2)))
}

/** The `fit` run from the retired browser fixture: every chain-group kind at once. */
const FIT = {
  name: 'fit',
  kind: 'nuts',
  status: 'ok' as const,
  time: 1784974100828,
  transport: 'local' as const,
  seq: 3,
  diagnostics: {
    rhat: 1.004,
    n_eff: 980,
    divergences: 0,
    notes: [],
    // `depth` is fine; `centre` is over the warn threshold the loop rail uses.
    mcmc: { depth: { r_hat: 0.9906, n_eff: 82.6 }, centre: { r_hat: 1.42, n_eff: 91.3 } },
  },
  chains: {
    g: [1, 1.1, 1.2, 1.05, 1.08, 1.15],
    amp: [0.5, 0.51, 0.49, 0.52, 0.5, 0.5],
    // A fanned component pair: one 'series' group carrying two series.
    'beam[0]': [2, 2.1, 1.9, 2.05, 2, 1.95],
    'beam[1]': [0.3, 0.32, 0.29, 0.31, 0.3, 0.28],
    // A credible-band triplet: one 'band' group, no marginal.
    'wide.mean': band(0),
    'wide.q05': band(-1),
    'wide.q95': band(1),
  },
}

const EXECUTION = { executionId: 'E1', runs: [FIT] }

function drawChains(): void {
  render(<ChainsPanel {...({ useSession, execution: EXECUTION } as unknown as ComponentProps<typeof ChainsPanel>)} />)
}
function drawPosterior(): void {
  render(<PosteriorPanel {...({ useSession, execution: EXECUTION } as unknown as ComponentProps<typeof PosteriorPanel>)} />)
}

describe('the chains panel over the full chain grammar', () => {
  it('groups a fanned component pair into ONE multi-series trace with a legend', () => {
    drawChains()
    const group = document.querySelector('[data-chain-group="beam"]')
    expect(group).toBeTruthy()
    const trace = group!.querySelector('[data-chart-kind="trace"]')
    expect(trace).toBeTruthy()
    expect(trace!.querySelectorAll('[data-series]').length).toBeGreaterThanOrEqual(2)
    expect(trace!.querySelectorAll('[data-tick]').length).toBeGreaterThan(0)
    // The legend is a SIBLING of the chart surface (TracePlot's own wrapper),
    // not a descendant of the trace svg.
    expect(group!.querySelectorAll('[data-legend-item]').length).toBeGreaterThanOrEqual(1)
  })

  it('groups a mean/q05/q95 triplet into ONE band chart', () => {
    drawChains()
    const group = document.querySelector('[data-chain-group="wide"]')
    expect(group).toBeTruthy()
    expect(group!.querySelectorAll('[data-band]').length).toBeGreaterThan(0)
    expect(group!.querySelectorAll('[data-mean-line]').length).toBeGreaterThan(0)
  })

  it('folds the scalar diagnostics into stat chips', () => {
    drawChains()
    const run = document.querySelector('[data-chains-run][data-run-name="fit"]')!
    // `:scope >` because the per-latent mcmc rows below carry `data-stat="rhat"`
    // too — scoped by their own `[data-mcmc-latent]` wrapper.
    expect(run.querySelector(':scope > [data-stat="rhat"] [data-stat-value]')?.textContent)
      .toContain('1.004')
    expect(run.querySelector('[data-stat="n_eff"] [data-stat-value]')?.textContent).toContain('980')
    expect(run.querySelector('[data-stat="divergences"] [data-stat-value]')?.textContent).toContain('0')
  })

  it('captions the run with its provenance, so two identical outcomes still read apart', () => {
    drawChains()
    const caption = document.querySelector('[data-chains-run] [data-run-provenance]')
    expect(caption?.getAttribute('data-run-seq')).toBe('3')
    expect(caption?.textContent).toContain('local')
    expect(caption?.textContent).toContain('seq 3')
  })

  it('renders one r_hat/n_eff pair per latent, and flags ONLY the bad one', () => {
    drawChains()
    // n_eff is an integer key, so 82.6 renders as 83 and 91.3 as 91.
    const depth = document.querySelector('[data-mcmc-latent="depth"]')!
    expect(depth.querySelector('[data-stat="rhat"] [data-stat-value]')?.textContent).toContain('0.991')
    expect(depth.querySelector('[data-stat="n-eff"] [data-stat-value]')?.textContent).toContain('83')
    expect(depth.querySelectorAll('[data-stat="rhat"] [data-stat-verdict]').length).toBe(0)

    const centre = document.querySelector('[data-mcmc-latent="centre"]')!
    expect(centre.querySelector('[data-stat="rhat"] [data-stat-value]')?.textContent).toContain('1.42')
    expect(centre.querySelector('[data-stat="n-eff"] [data-stat-value]')?.textContent).toContain('91')
    expect(centre.querySelector('[data-stat="rhat"] [data-stat-verdict]')?.getAttribute('data-stat-verdict'))
      .toBe('warn')
    // Only r_hat is ever flagged; a low n_eff carries no verdict of its own.
    expect(centre.querySelectorAll('[data-stat="n-eff"] [data-stat-verdict]').length).toBe(0)
  })
})

describe('the posterior panel over the same run', () => {
  it('draws a marginal per series and none for the band latent', () => {
    drawPosterior()
    const run = document.querySelector('[data-posterior-run][data-run-name="fit"]')!
    expect(run.querySelectorAll('[data-marginal]').length).toBeGreaterThanOrEqual(1)
    expect(run.querySelector('[data-marginal] [data-bin]')).toBeTruthy()
    // A band group's draws are per-draw summaries, so it gets a note instead.
    expect(run.querySelector('[data-band-note="wide"]')).toBeTruthy()
  })

  it('reuses the SAME provenance derivation, not a second implementation', () => {
    drawPosterior()
    const run = document.querySelector('[data-posterior-run][data-run-name="fit"]')!
    expect(run.querySelector('[data-run-provenance]')?.getAttribute('data-run-seq')).toBe('3')
  })

  describe('the convergence summary that replaced the per-latent table (§28.2)', () => {
    // The table is Chains's evidence and was drawn in BOTH panels, identical
    // down to the values. What Posterior owes a reader is whether the
    // distribution below can be believed, so it keeps the worst case.
    it('draws no per-latent rows any more — those live in Chains', () => {
      drawPosterior()
      const run = document.querySelector('[data-posterior-run][data-run-name="fit"]')!
      expect(run.querySelectorAll('[data-mcmc-latent]').length).toBe(0)
    })

    it('carries the WORST r_hat, not the first or the mean', () => {
      // `centre` is 1.42 and `depth` is 0.9906; a mean would read 1.2 and an
      // average is exactly how a single unconverged latent gets hidden.
      drawPosterior()
      expect(document.querySelector('[data-mcmc-worst]')?.textContent)
        .toContain('worst r_hat 1.42')
    })

    it('carries the THINNEST n_eff, over a real latent count', () => {
      drawPosterior()
      const text = document.querySelector('[data-mcmc-worst]')?.textContent ?? ''
      expect(text).toContain('thinnest n_eff 83')
      expect(text).toContain('across 2 latents')
    })

    it('still says a latent is over the threshold — the reason a summary is allowed at all', () => {
      drawPosterior()
      expect(document.querySelector('[data-mcmc-summary]')?.getAttribute('data-mcmc-warn'))
        .toBe('true')
    })

    it('names where the per-latent numbers went', () => {
      // A summary that replaces a table without saying where the table is is
      // how the detail becomes unfindable rather than relocated.
      drawPosterior()
      expect(document.querySelector('[data-mcmc-pointer]')?.textContent).toContain('Chains')
    })

    it('names the latent each extremum belongs to', () => {
      // In this fixture they are DIFFERENT latents — `centre` has the bad
      // r_hat, `depth` the thinner n_eff — so a line without the names reads
      // as one latent's pair.
      drawPosterior()
      const text = document.querySelector('[data-mcmc-worst]')?.textContent ?? ''
      expect(text).toContain('(centre)')
      expect(text).toContain('(depth)')
    })

    it('draws no per-latent n_eff RECORD either — §28.2 missed that copy', () => {
      // `diagnostics.n_eff` can arrive as a per-latent object, and both panels
      // spelled it out. Chains keeps it; this panel folds it into one line.
      render(
        <PosteriorPanel
          {...({
            useSession,
            execution: {
              executionId: 'E9',
              runs: [{
                ...FIT,
                diagnostics: { ...FIT.diagnostics, n_eff: { centre: 91, depth: 83 } },
              }],
            },
          } as unknown as ComponentProps<typeof PosteriorPanel>)}
        />,
      )
      expect(document.querySelectorAll('[data-stat="n_eff-centre"]').length).toBe(0)
      expect(document.body.textContent).not.toContain('n_eff (centre)')
    })

    it('carries divergences, which a healthy r_hat would otherwise hide', () => {
      // The failure mode the summary must not lose: r_hat 1.000, healthy
      // n_eff, and three hundred divergent transitions.
      render(
        <PosteriorPanel
          {...({
            useSession,
            execution: {
              executionId: 'E8',
              runs: [{
                ...FIT,
                diagnostics: {
                  ...FIT.diagnostics,
                  divergences: 300,
                  mcmc: { depth: { r_hat: 1.0, n_eff: 900 } },
                },
              }],
            },
          } as unknown as ComponentProps<typeof PosteriorPanel>)}
        />,
      )
      expect(document.querySelector('[data-mcmc-divergences]')?.textContent)
        .toContain('300 divergences')
      // And it turns the line amber even though every r_hat is fine.
      expect(document.querySelector('[data-mcmc-summary]')?.getAttribute('data-mcmc-warn'))
        .toBe('true')
    })

    it('says nothing about divergences when there are none', () => {
      drawPosterior()
      expect(document.querySelector('[data-mcmc-divergences]')).toBeNull()
    })

    it('drops the pointer when the Chains panel is HIDDEN', () => {
      // Sending a reader to a panel that is not on screen is worse than not
      // sending them. The latent names above are what make this safe.
      render(
        <PosteriorPanel
          {...({
            useSession,
            execution: EXECUTION,
            layout: {
              collapsed: new Set<string>(),
              hidden: new Set(['chains']),
              toggleCollapsed: () => {},
              hide: () => {},
              show: () => {},
            },
          } as unknown as ComponentProps<typeof PosteriorPanel>)}
        />,
      )
      expect(document.querySelector('[data-mcmc-pointer]')).toBeNull()
      // The numbers themselves are still there.
      expect(document.querySelector('[data-mcmc-worst]')).toBeTruthy()
    })
  })

  it('keeps the corner plot closed by default and opens it on the summary', () => {
    drawPosterior()
    const details = document.querySelector('[data-corner-details]') as HTMLDetailsElement
    expect(details.open).toBe(false)
    fireEvent.click(details.querySelector('summary')!)
    expect(details.open).toBe(true)
    const grid = details.querySelector('[data-corner-grid]')!
    expect(grid.querySelectorAll('[data-corner-cell]').length).toBeGreaterThan(0)
    expect(grid.querySelectorAll('[data-corner-diagonal]').length).toBeGreaterThan(0)
  })
})

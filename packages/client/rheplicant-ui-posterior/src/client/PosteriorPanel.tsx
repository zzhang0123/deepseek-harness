/** Posterior panel: per-latent marginal histograms, with the pairwise corner scatter behind a disclosure. */
import { memo } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import {
  type AnalysisRun,
  type ChainGroup,
  type ChainSeries,
  EmptyState,
  Histogram,
  Panel,
  type PanelStatus,
  SERIES,
  StatRow,
  TOKEN,
  formatDiagnostic,
  groupChains,
  selectAnalysisRuns,
} from '@rheplicant/dsh-rheplicant-ui-kit/client'

interface PosteriorPanelProps {
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
}

/** An analysis run that has the chain draws this panel needs to draw marginals + a corner plot. */
type PosteriorRun = AnalysisRun & { readonly chains: Record<string, (number | null)[]> }

const CORNER_BINS = 20
const MARGINAL_BINS = 24
const CELL = 96
const PAD = 8

function hasChains(run: AnalysisRun): run is PosteriorRun {
  return run.chains !== undefined
}

/** Drop the `null` draws — the wire's spelling of a non-finite value. */
function finiteValues(values: readonly (number | null)[]): number[] {
  return values.filter((value): value is number => value !== null)
}

/** Bin a draw sequence into a ~20-bin 1D histogram, for the corner plot's own diagonal/scatter grid. */
function histogram(values: number[]): number[] {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const counts = new Array<number>(CORNER_BINS).fill(0)
  for (const value of values) {
    const bin = Math.min(CORNER_BINS - 1, Math.floor(((value - min) / range) * CORNER_BINS))
    counts[bin] = (counts[bin] ?? 0) + 1
  }
  return counts
}

/**
 * One latent's plot color: the lit accent alone for a single latent, a
 * rotating series color once there's more than one to tell apart. The modulo
 * keeps the index in bounds, but `noUncheckedIndexedAccess` cannot see that,
 * so `?? TOKEN.lit` documents the same "known in bounds" fact array-index
 * lookups elsewhere in this workspace express with an explicit guard.
 */
function latentColor(index: number, count: number): string {
  return count > 1 ? (SERIES[index % SERIES.length] ?? TOKEN.lit) : TOKEN.lit
}

/** Corner plot: diagonal 1D histograms, upper triangle 2D scatter — unchanged, just moved behind a disclosure. */
const Corner = memo(function Corner({ chains }: { chains: Record<string, (number | null)[]> }) {
  const entries = Object.entries(chains)
  const n = entries.length
  const size = PAD + n * CELL

  return (
    <svg width={size} height={size} data-corner role="img" aria-label="Corner plot">
      {entries.map(([latent, values], i) => {
        const counts = histogram(finiteValues(values))
        const maxCount = Math.max(...counts) || 1
        const barWidth = CELL / CORNER_BINS
        const color = latentColor(i, n)
        return (
          <g key={`hist-${latent}`} transform={`translate(${PAD + i * CELL}, ${PAD + i * CELL})`}>
            {counts.map((count, b) => {
              const h = (count / maxCount) * CELL
              return <rect key={b} x={b * barWidth} y={CELL - h} width={Math.max(1, barWidth - 1)} height={h} fill={color} data-corner-hist />
            })}
          </g>
        )
      })}
      {entries.map(([li, xs], i) => entries.map(([lj, ys], j) => {
        if (i >= j) return null
        const xFinite = finiteValues(xs)
        const yFinite = finiteValues(ys)
        const xMin = Math.min(...xFinite)
        const xMax = Math.max(...xFinite)
        const yMin = Math.min(...yFinite)
        const yMax = Math.max(...yFinite)
        const xRange = xMax - xMin || 1
        const yRange = yMax - yMin || 1
        const color = latentColor(i, n)
        return (
          <g key={`scatter-${li}-${lj}`} transform={`translate(${PAD + j * CELL}, ${PAD + i * CELL})`}>
            {xs.map((x, k) => {
              const y = ys[k]
              // A draw with a non-finite value in either coordinate has no
              // point in this pane — skipped, not coerced to an axis edge.
              if (x === null || y === null || y === undefined) return null
              return (
                <circle
                  key={k}
                  cx={((x - xMin) / xRange) * CELL}
                  cy={CELL - ((y - yMin) / yRange) * CELL}
                  r={1.2}
                  fill={color}
                  data-corner-scatter
                />
              )
            })}
          </g>
        )
      }))}
    </svg>
  )
})

/** Every series across a run's 'series'-kind chain groups, flattened in group-then-series order (band groups carry no marginal). */
function marginalSeries(groups: readonly ChainGroup[]): readonly ChainSeries[] {
  const out: ChainSeries[] = []
  for (const group of groups) {
    if (group.kind !== 'series') continue
    out.push(...group.series)
  }
  return out
}

/** A run's band-kind chain groups — their draws are per-draw summaries, so they get a note instead of a marginal. */
function bandLatents(groups: readonly ChainGroup[]): readonly string[] {
  return groups.filter(group => group.kind === 'band').map(group => group.latent)
}

/** One run's marginal histograms (one per series across every 'series' group) plus a one-line note per band-kind latent. */
const RunMarginals = memo(function RunMarginals({ groups }: { groups: readonly ChainGroup[] }) {
  const series = marginalSeries(groups)
  const bands = bandLatents(groups)
  return (
    <div data-marginals>
      {series.map((s, i) => (
        <div key={s.key} data-marginal={s.key}>
          <div>{s.label}</div>
          <Histogram values={s.values} bins={MARGINAL_BINS} color={SERIES[i % SERIES.length] ?? TOKEN.lit} />
        </div>
      ))}
      {bands.map(latent => (
        <p key={latent} data-band-note={latent}>
          {latent}: credible-band summary (mean/q05/q95) — no marginal
        </p>
      ))}
    </div>
  )
})

/** One run's rhat / n_eff diagnostics, folded into StatRow chips. */
const RunDiagnosticStats = memo(function RunDiagnosticStats({ run }: { run: PosteriorRun }) {
  const diagnostics = run.diagnostics
  if (diagnostics === undefined) return null
  const nEff = diagnostics.n_eff
  return (
    <>
      {diagnostics.rhat !== undefined ? (
        <StatRow statKey="rhat" label="rhat" value={formatDiagnostic('rhat', diagnostics.rhat)} />
      ) : null}
      {typeof nEff === 'number' || nEff === null ? (
        // null is the wire's spelling of a non-finite n_eff — rendered `—`,
        // not silently dropped.
        <StatRow statKey="n_eff" label="n_eff" value={formatDiagnostic('n_eff', nEff)} />
      ) : null}
      {typeof nEff === 'object' && nEff !== null
        ? Object.entries(nEff).map(([latent, value]) => (
            <StatRow key={latent} statKey={`n_eff-${latent}`} label={`n_eff (${latent})`} value={formatDiagnostic('n_eff', value)} />
          ))
        : null}
    </>
  )
})

export const PosteriorPanel = memo(function PosteriorPanel({ useSession }: PosteriorPanelProps) {
  const runs = useSession(selectAnalysisRuns).filter(hasChains)
  const status: PanelStatus = runs.length === 0 ? 'idle' : runs.some(run => run.status === 'failed') ? 'error' : 'ok'

  return (
    <Panel id="posterior" title="Posterior" status={status}>
      {runs.length === 0 ? (
        <EmptyState message="No draws yet" hint="Ask the agent for a nuts or plan.sample run" />
      ) : (
        runs.map(run => {
          const groups = groupChains(run.chains)
          return (
            <div key={run.name} data-posterior-run data-run-name={run.name}>
              <div><strong>{run.name}</strong> <span>({run.kind})</span></div>
              <RunDiagnosticStats run={run} />
              <RunMarginals groups={groups} />
              <details data-corner-details>
                <summary>Corner</summary>
                <Corner chains={run.chains} />
              </details>
            </div>
          )
        })
      )}
    </Panel>
  )
})

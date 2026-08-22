/** Posterior panel: per-latent marginal histograms, with the pairwise corner plot behind a disclosure. */
import { memo } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import {
  type AnalysisRun,
  type ChainGroup,
  type ChainSeries,
  type ConsolePanelLayoutView,
  CornerGrid,
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

/** This panel's own `console.panel` id — the key it reads/writes in `layout`. */
const PANEL_ID = 'posterior'

interface PosteriorPanelProps {
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
  /** Console layout state (owner prop — see ui-console's ConsoleView doc comment). Absent when not rendered through the console shell: renders un-collapsed, always visible. */
  layout?: ConsolePanelLayoutView
}

/** An analysis run that has the chain draws this panel needs to draw marginals + a corner plot. */
type PosteriorRun = AnalysisRun & { readonly chains: Record<string, (number | null)[]> }

const MARGINAL_BINS = 24

function hasChains(run: AnalysisRun): run is PosteriorRun {
  return run.chains !== undefined
}

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

export const PosteriorPanel = memo(function PosteriorPanel({ useSession, layout }: PosteriorPanelProps) {
  const runs = useSession(selectAnalysisRuns).filter(hasChains)
  if (layout?.hidden.has(PANEL_ID) === true) return null
  const status: PanelStatus = runs.length === 0 ? 'idle' : runs.some(run => run.status === 'failed') ? 'error' : 'ok'

  return (
    <Panel
      id={PANEL_ID}
      title="Posterior"
      status={status}
      {...(layout === undefined ? {} : {
        collapsed: layout.collapsed.has(PANEL_ID),
        onToggleCollapse: () => { layout.toggleCollapsed(PANEL_ID) },
      })}
    >
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
                <CornerGrid series={marginalSeries(groups)} />
              </details>
            </div>
          )
        })
      )}
    </Panel>
  )
})

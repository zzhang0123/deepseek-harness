/** Posterior panel: per-latent marginal histograms, with the pairwise corner plot behind a disclosure. */
import { memo } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import {
  type AnalysisRun,
  type ChainGroup,
  type ChainSeries,
  type PanelLayoutView,
  CornerGrid,
  EmptyState,
  Histogram,
  Panel,
  type PanelStatus,
  SERIES,
  StatRow,
  TOKEN,
  formatDiagnostic,
  formatRunProvenance,
  groupChains,
  mcmcRows,
  selectAnalysisRuns,
  runsToRender,
  executionEmptyReason,
  type ConsoleExecutionView,
} from '@rheplicant/dsh-rheplicant-ui-kit/client'
import styles from './posterior.module.css'

/** This panel's own `console.panel` id — the key it reads/writes in `layout`. */
const PANEL_ID = 'posterior'

interface PosteriorPanelProps {
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
  /** Panel layout state (owner prop — see ui-project's ProjectHome doc comment). Absent when not rendered through a panel grid: renders un-collapsed, always visible. */
  layout?: PanelLayoutView
  /** The execution the console is showing (owner prop). Absent outside the console shell. */
  execution?: ConsoleExecutionView
}

/** An analysis run that has the chain draws this panel needs to draw marginals + a corner plot. */
type PosteriorRun = AnalysisRun & { readonly chains: Record<string, (number | null)[]> }

const MARGINAL_BINS = 24

/**
 * A run carrying real draws.
 *
 * `!= null` on purpose, and it is load-bearing: the wire field is optional,
 * but events recorded before the service stopped emitting explicit nulls
 * carry `null` — measured in real session logs. `undefined`-only guards let a
 * null through, and the crash it causes takes the whole slot down.
 */
function hasChains(run: AnalysisRun): run is PosteriorRun {
  return run.chains !== undefined && run.chains !== null
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

/** One run's rhat / n_eff diagnostics, folded into StatRow chips, plus one wrapped pair of StatRows per `mcmc` latent (when the sampler reported per-latent diagnostics). */
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
      {mcmcRows(diagnostics.mcmc).map(row => (
        <div key={row.latent} data-mcmc-latent={row.latent}>
          <StatRow
            statKey={row.rhat.stat}
            label={row.rhat.label}
            value={row.rhat.value}
            {...(row.rhat.verdict === undefined ? {} : { verdict: row.rhat.verdict })}
          />
          <StatRow statKey={row.nEff.stat} label={row.nEff.label} value={row.nEff.value} />
        </div>
      ))}
    </>
  )
})

/** One run's provenance caption: a quiet secondary-label line so two runs with an identical outcome (e.g. a rerun with the same seed) still read as distinct cards. */
const RunProvenanceCaption = memo(function RunProvenanceCaption({ run }: { run: PosteriorRun }) {
  const provenance = formatRunProvenance({
    time: run.time,
    transport: run.transport,
    seq: run.seq,
    executionId: run.executionId,
    taskPath: run.taskPath,
  })
  if (provenance === undefined) return null
  // Short id in the caption text, full id in the attribute -- see
  // `AnalysisRunPanel.tsx`'s caption for why the two differ.
  return (
    <p
      className={styles.provenance}
      data-run-provenance={provenance}
      data-run-seq={run.seq}
      data-execution-id={run.executionId}
      data-task-path={run.taskPath}
    >{provenance}</p>
  )
})

/** React key for one run card: `name` alone collides when two DIFFERENT runs (different events) happen to share a name — the common case for a rerun with the same seed, which is exactly the scenario this panel must tell apart, not merely fail to crash on. `seq` is unique per event; fall back to the bare name when it is somehow absent. */
function runCardKey(run: PosteriorRun): string {
  return run.seq === undefined ? run.name : `${run.name}-${run.seq}`
}

export const PosteriorPanel = memo(function PosteriorPanel({ useSession, layout, execution }: PosteriorPanelProps) {
  // Prefer the execution the console selected, read off its published
  // tree; fall back to this session's log when there is none (outside
  // the console shell, or an older harness with no project route).
  const runs = runsToRender(execution, useSession(selectAnalysisRuns)).filter(hasChains)
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
        <EmptyState
          message={executionEmptyReason(execution) ?? 'No draws yet'}
          hint={executionEmptyReason(execution) === undefined ? 'Ask the agent for a nuts or plan.sample run' : undefined}
        />
      ) : (
        runs.map(run => {
          const groups = groupChains(run.chains)
          return (
            <div key={runCardKey(run)} data-posterior-run data-run-name={run.name}>
              <div><strong>{run.name}</strong> <span>({run.kind})</span></div>
              <RunProvenanceCaption run={run} />
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

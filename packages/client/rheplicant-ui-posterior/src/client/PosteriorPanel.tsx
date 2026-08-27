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
  RunHeading,
  type PanelStatus,
  SERIES,
  StatRow,
  TOKEN,
  formatDiagnostic,
  formatRunProvenance,
  groupChains,
  mcmcWorst,
  selectAnalysisRuns,
  runsToRender,
  executionEmptyReason,
  executionEmptyKind,
  type LoopExecutionView,
} from '@rheplicant/dsh-rheplicant-ui-kit/client'
import styles from './posterior.module.css'

/** This panel's own `console.panel` id — the key it reads/writes in `layout`. */
const PANEL_ID = 'posterior'

interface PosteriorPanelProps {
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
  /** Panel layout state (owner prop — see ui-project's ProjectHome doc comment). Absent when not rendered through a panel grid: renders un-collapsed, always visible. */
  layout?: PanelLayoutView
  /** The execution the console is showing (owner prop). Absent outside the console shell. */
  execution?: LoopExecutionView
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

/**
 * One run's convergence summary — the worst case, in one line.
 *
 * **This drew the whole per-latent table until §28.2**, which is what the
 * Chains panel beside it also drew: measured on one screen, both headed their
 * body with the same four rows down to the values. The table answers "did the
 * sampler behave", which is Chains's question; this panel's is "what is the
 * posterior", and what it owes a reader is whether the distribution below can
 * be believed at all. So: the largest r_hat, the thinnest n_eff, and where the
 * detail lives.
 *
 * The run-level `rhat`/`n_eff` chips stay. They are a different reading — the
 * sampler's own scalar for the run, not a fold over latents — and the panel
 * renders them only when the wire carried them.
 */
const RunDiagnosticStats = memo(function RunDiagnosticStats(
  { run, layout }: { run: PosteriorRun; layout?: PanelLayoutView },
) {
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
      {/* The per-latent n_eff RECORD used to be spelled out here as well, and
          §28.2 missed it: it is the same duplication from a second source —
          Chains draws the identical list — and in this panel it sat directly
          above a line reading "thinnest n_eff …" derived from a DIFFERENT bag
          (`diagnostics.mcmc`), so the two could disagree about both the latent
          set and the minimum. One summary, one source. Chains keeps the list.
          Found by review, after §28.2 had already been written. */}
      <McmcSummary mcmc={diagnostics.mcmc} divergences={diagnostics.divergences} layout={layout} />
    </>
  )
})

/**
 * The worst-case convergence line, and the pointer to the table.
 *
 * Renders nothing when the sampler reported no latents at all — which is a
 * different fact from reporting them as non-finite, and a line reading
 * `r_hat — · n_eff —` over zero latents would be a claim nobody made.
 *
 * **Divergences ride here too.** §28.2's first draft dropped them, having
 * itself observed that the two tables were "one `divergences` row apart" — and
 * a NUTS run with `r_hat 1.000`, healthy `n_eff` and three hundred divergences
 * renders marginals that are wrong while every number in this line looks fine.
 * If the argument for a summary is "a trust signal where somebody decides
 * whether to believe a distribution", divergences belong in it more than
 * `n_eff` does.
 *
 * **The pointer is conditional**, because `ChainsPanel` returns `null` when
 * the layout hides it and the Panels menu offers exactly that toggle. Sending
 * a reader to a panel that is not on screen is worse than not sending them.
 * With the latent named beside each extremum the pointer is a convenience
 * rather than a dependency, which is what makes dropping it safe.
 */
const McmcSummary = memo(function McmcSummary(
  { mcmc, divergences, layout }: {
    mcmc: unknown
    divergences?: number | null | undefined
    // `| undefined` explicitly: the dsh program runs with
    // `exactOptionalPropertyTypes`, so `?:` alone refuses a passed-through
    // `PanelLayoutView | undefined`. Both of this repo's own typechecks accept
    // it; only `npm run typecheck` in the dsh checkout does not, which is what
    // that gate is for.
    layout?: PanelLayoutView | undefined
  },
) {
  const worst = mcmcWorst(mcmc)
  const diverged = typeof divergences === 'number' && divergences > 0
  if (worst === undefined && !diverged) return null
  const chainsShown = layout === undefined || !layout.hidden.has('chains')
  return (
    <p
      className={styles.mcmcSummary}
      data-mcmc-summary=""
      data-mcmc-warn={worst?.warn === true || diverged ? 'true' : 'false'}
    >
      {worst !== undefined && (
        <span data-mcmc-worst="">
          worst r_hat {worst.rhat ?? '—'}
          {worst.rhatLatent === undefined ? '' : ` (${worst.rhatLatent})`}
          {' · '}thinnest n_eff {worst.nEff ?? '—'}
          {worst.nEffLatent === undefined ? '' : ` (${worst.nEffLatent})`}
          {' '}across {worst.latents} latent{worst.latents === 1 ? '' : 's'}
        </span>
      )}
      {diverged && (
        <span data-mcmc-divergences="">
          {worst === undefined ? '' : ' · '}
          {divergences} divergence{divergences === 1 ? '' : 's'}
        </span>
      )}
      {chainsShown && (
        <span data-mcmc-pointer="">{' — '}per-latent numbers are in the Chains panel.</span>
      )}
    </p>
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
          kind={executionEmptyKind(execution)}
          message={executionEmptyReason(execution) ?? 'No draws yet'}
          hint={executionEmptyReason(execution) === undefined ? 'Ask the agent for a nuts or plan.sample run' : undefined}
        />
      ) : (
        runs.map(run => {
          const groups = groupChains(run.chains)
          return (
            <div key={runCardKey(run)} data-posterior-run data-run-name={run.name}>
              <RunHeading name={run.name} kind={run.kind} />
              <RunProvenanceCaption run={run} />
              <RunDiagnosticStats run={run} {...(layout === undefined ? {} : { layout })} />
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

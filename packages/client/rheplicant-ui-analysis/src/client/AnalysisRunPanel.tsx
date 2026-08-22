/** Keyed renderer for the `rheplicant-analysis` Chat node: one row per run, each with its diagnostics panel. */
import { memo } from 'react'
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { GateFinding, RunDiagnostics } from '@rheplicant/dsh-rheplicant'
import { Badge, formatDiagnostic, formatRunProvenance, mcmcRows } from '@rheplicant/dsh-rheplicant-ui-kit/client'
import { SignalPath } from './SignalPath.tsx'
import styles from './analysis-run-panel.module.css'

/** Post-flight gate verdicts, one row per finding. */
const Gates = memo(function Gates({ gates }: { gates: readonly GateFinding[] }) {
  return (
    <ul data-gates>
      {gates.map((gate, index) => (
        <li key={index} data-gate data-gate-check={gate.check} data-gate-severity={gate.severity}>
          <strong>{gate.check}</strong> <span>({gate.severity})</span> — {gate.message}
        </li>
      ))}
    </ul>
  )
})

/**
 * Render one run's diagnostics — r_hat, identifiability rank, joint χ², and the
 * package's own notes — as structured data, separate from the model's prose, so
 * the authoritative numbers never hide inside a generated explanation.
 */
/** Format a scalar-or-per-sweep diagnostic (`typeof` narrows where Array.isArray cannot on readonly arrays). */
function formatScalarOrList(key: string, value: number | null | readonly (number | null)[]): string {
  if (typeof value === 'number' || value === null) return formatDiagnostic(key, value)
  return value.map(entry => formatDiagnostic(key, entry)).join(', ')
}

const Diagnostics = memo(function Diagnostics({ diagnostics }: { diagnostics: RunDiagnostics }) {
  const chi2 = diagnostics.chi2 === undefined ? undefined : formatScalarOrList('chi2', diagnostics.chi2)
  return (
    <dl data-run-diagnostics>
      {diagnostics.converged !== undefined ? (
        <>
          <dt>Converged</dt>
          <dd data-diag-converged>{diagnostics.converged ? 'yes' : 'no'}</dd>
        </>
      ) : null}
      {diagnostics.rhat !== undefined ? (
        <>
          <dt>r_hat</dt>
          <dd data-diag-rhat>{formatDiagnostic('rhat', diagnostics.rhat)}</dd>
        </>
      ) : null}
      {diagnostics.rank !== undefined ? (
        <>
          <dt>Rank</dt>
          <dd data-diag-rank>{formatDiagnostic('rank', diagnostics.rank)}</dd>
        </>
      ) : null}
      {diagnostics.nullity !== undefined ? (
        <>
          <dt>Nullity</dt>
          <dd data-diag-nullity>{formatDiagnostic('nullity', diagnostics.nullity)}</dd>
        </>
      ) : null}
      {chi2 !== undefined ? (
        <>
          <dt>χ²</dt>
          <dd data-diag-chi2>{chi2}</dd>
        </>
      ) : null}
      {diagnostics.n_eff !== undefined ? (
        <>
          <dt>n_eff</dt>
          <dd data-diag-n-eff>
            {typeof diagnostics.n_eff === 'number' || diagnostics.n_eff === null
              ? formatDiagnostic('n_eff', diagnostics.n_eff)
              : Object.entries(diagnostics.n_eff).map(([latent, value]) => `${latent}: ${formatDiagnostic('n_eff', value)}`).join(', ')}
          </dd>
        </>
      ) : null}
      {diagnostics.divergences !== undefined ? (
        <>
          <dt>Divergences</dt>
          <dd data-diag-divergences>{formatDiagnostic('divergences', diagnostics.divergences)}</dd>
        </>
      ) : null}
      {diagnostics.kappa !== undefined ? (
        <>
          <dt>κ</dt>
          <dd data-diag-kappa>{formatScalarOrList('kappa', diagnostics.kappa)}</dd>
        </>
      ) : null}
      {diagnostics.delta !== undefined ? (
        <>
          <dt>Δ</dt>
          <dd data-diag-delta>{formatDiagnostic('delta', diagnostics.delta)}</dd>
        </>
      ) : null}
      {diagnostics.iterations !== undefined ? (
        <>
          <dt>Iterations</dt>
          <dd data-diag-iterations>{formatDiagnostic('iterations', diagnostics.iterations)}</dd>
        </>
      ) : null}
      {(diagnostics.notes ?? []).length > 0 ? (
        <>
          <dt>Notes</dt>
          <dd data-diag-notes>{(diagnostics.notes ?? []).join('; ')}</dd>
        </>
      ) : null}
    </dl>
  )
})

/**
 * Per-latent MCMC diagnostics (`RunDiagnostics.mcmc`), one labelled r_hat/n_eff
 * pair per latent — kept separate from the `<dl data-run-diagnostics>` above
 * (which owns the scalar fields) rather than interleaved into it, since a
 * multi-latent NUTS run can report several of these. A bad r_hat (over the
 * same threshold `ui-console`'s loop rail uses) carries a `warn` Badge next
 * to its value — the dl/dt/dd idiom here has no StatRow-style verdict dot,
 * so Badge is this panel's own equivalent of that same convention.
 */
const McmcDiagnostics = memo(function McmcDiagnostics({ mcmc }: { mcmc: unknown }) {
  const rows = mcmcRows(mcmc)
  if (rows.length === 0) return null
  return (
    <dl data-mcmc className={styles.mcmc}>
      {rows.map(row => (
        <div key={row.latent} data-mcmc-latent={row.latent} className={styles.mcmcLatent}>
          <dt>{row.rhat.label}</dt>
          <dd data-stat="rhat">
            {row.rhat.value}
            {row.rhat.verdict === 'warn' ? <Badge state="warn" /> : null}
          </dd>
          <dt>{row.nEff.label}</dt>
          <dd data-stat="n-eff">{row.nEff.value}</dd>
        </div>
      ))}
    </dl>
  )
})

/**
 * One run's provenance caption: a quiet secondary-label line so two runs
 * with an identical outcome (e.g. a rerun with the same seed) still read as
 * distinct cards, not one repeated. Takes the whole run entry (rather than
 * destructured `time`/`transport`/`seq` props) so this component's own prop
 * type is never built fresh from already-optional fields at the JSX call
 * site — see `RunProvenance`'s (ui-kit) doc comment for why that matters
 * under `exactOptionalPropertyTypes`.
 */
const RunProvenanceCaption = memo(function RunProvenanceCaption(
  { run }: { run: { time?: number; transport?: string; seq?: number; executionId?: string; taskPath?: string } },
) {
  const provenance = formatRunProvenance({
    time: run.time,
    transport: run.transport,
    seq: run.seq,
    executionId: run.executionId,
    taskPath: run.taskPath,
  })
  if (provenance === undefined) return null
  // The caption text carries the SHORT execution id (the caption already
  // says the time); the attribute carries the FULL one, because that is the
  // string a results tree on disk is keyed by and what a reader copies.
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

/** Render one analysis run's step list with per-run status and diagnostics. */
export const AnalysisRunPanel = memo(function AnalysisRunPanel({ node }: ChatNodeViewProps<'rheplicant-analysis'>) {
  const { runs, tookMs, graph, gates } = node.data
  return (
    <section data-rheplicant-analysis>
      {graph !== undefined ? <SignalPath graph={graph} /> : null}
      {gates !== undefined && gates.length > 0 ? <Gates gates={gates} /> : null}
      <ul>
        {runs.map(run => (
          <li key={run.name} data-run-name={run.name} data-run-status={run.status}>
            <strong>{run.name}</strong> <span>({run.kind})</span> — {run.status}
            <RunProvenanceCaption run={run} />
            {run.diagnostics !== undefined ? <Diagnostics diagnostics={run.diagnostics} /> : null}
            {run.diagnostics?.mcmc !== undefined ? <McmcDiagnostics mcmc={run.diagnostics.mcmc} /> : null}
          </li>
        ))}
      </ul>
      {tookMs !== undefined ? <footer data-took-ms>{tookMs} ms</footer> : null}
    </section>
  )
})

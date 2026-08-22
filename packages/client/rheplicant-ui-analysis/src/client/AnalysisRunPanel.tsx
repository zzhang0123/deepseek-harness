/** Keyed renderer for the `rheplicant-analysis` Chat node: one row per run, each with its diagnostics panel. */
import { memo } from 'react'
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { GateFinding, RunDiagnostics, SignalPathGraph } from '@rheplicant/dsh-rheplicant'
import { formatDiagnostic } from '@rheplicant/dsh-rheplicant-ui-kit/client'

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
 * The lit/dim signal-path rendering: rheplicant's own `Assembly.to_svg()` — the
 * canonical graph in full, with the declared operators lit, identity-traversed
 * junctions half-lit, and everything else dim. This is the authoritative answer
 * to "what does my model actually contain", rendered separately from prose.
 */
const SignalPath = memo(function SignalPath({ graph }: { graph: SignalPathGraph }) {
  return (
    <figure data-signal-path>
      {graph.svg !== undefined ? (
        <div
          data-signal-path-svg
          style={{ maxHeight: '26rem', overflow: 'auto', background: 'var(--dsw-alias-bg-base)', borderRadius: 8 }}
          dangerouslySetInnerHTML={{ __html: graph.svg }}
        />
      ) : null}
      <figcaption data-signal-path-lit>
        lit: {graph.lit.length > 0 ? graph.lit.join(', ') : '(none)'}
        {' · '}
        identity: {graph.skipped.length > 0 ? graph.skipped.join(', ') : '(none)'}
      </figcaption>
    </figure>
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
            {run.diagnostics !== undefined ? <Diagnostics diagnostics={run.diagnostics} /> : null}
          </li>
        ))}
      </ul>
      {tookMs !== undefined ? <footer data-took-ms>{tookMs} ms</footer> : null}
    </section>
  )
})

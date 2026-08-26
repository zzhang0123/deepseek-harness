/** Keyed renderer for the `rheplicant-analysis` Chat node: one row per run, each with its diagnostics panel. */
import { Fragment, memo, useCallback } from 'react'
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { GateFinding, LatentDeparture, RunDiagnostics } from '@rheplicant/dsh-rheplicant'
import {
  Badge, BandChart, HeatMap, TracePlot, formatDiagnostic, formatNumber, formatRunProvenance,
  groupChains, mcmcRows,
} from '@rheplicant/dsh-rheplicant-ui-kit/client'
import { canOpenInProject, openInProject } from './project-bridge.ts'
import { SignalPath } from './SignalPath.tsx'
import styles from './analysis-run-panel.module.css'

/**
 * C12's departure from linearity: the numbers its message renders, as data.
 *
 * The whole table and not a worst case. The three probe scales span six orders
 * of magnitude precisely so the TREND is readable — "departs at 1× and 10³× but
 * not at 10⁻³×" is a knee or a saturation and names the regime it starts in,
 * while "departs everywhere" is a wrong parameterization. A maximum would
 * render those two identically.
 *
 * `formatNumber` renders a `null` departure as `—`, which is what it means: the
 * measurement was not finite, so the linearization could not be evaluated at
 * that probe. Upstream counts that as a FAILURE (`nan > rtol` is `false`), and
 * it is emphatically not zero — a latent that really is affine measures `0`,
 * and that reads as `0` here.
 */
const Departure = memo(function Departure({ departure }: { departure: readonly LatentDeparture[] }) {
  return (
    <ul data-departure aria-label="relative departure from linearity, by probe scale">
      {departure.map(([latent, probes]) => (
        <li key={latent} data-departure-latent={latent}>
          <strong>{latent}</strong>{' '}
          {probes.map(([scale, error], index) => (
            <Fragment key={scale}>
              {index > 0 ? ', ' : null}
              <span data-departure-probe data-departure-scale={scale}>
                {formatNumber(scale)}× → {formatNumber(error)}
              </span>
            </Fragment>
          ))}
        </li>
      ))}
    </ul>
  )
})

/** Post-flight gate verdicts, one row per finding. */
const Gates = memo(function Gates({ gates }: { gates: readonly GateFinding[] }) {
  return (
    <ul data-gates>
      {gates.map((gate, index) => (
        <li key={index} data-gate data-gate-check={gate.check} data-gate-severity={gate.severity}>
          <strong>{gate.check}</strong> <span>({gate.severity})</span> — {gate.message}
          {/*
            `undefined` is the only absence there is here, and it means NOT
            CARRIED — a published execution reads its gates back from
            `diagnostics.json`, a closed v1 contract with no room for this
            field. Testing the length instead would fold that case together
            with a table that measured nothing, and the wire never sends one:
            the service omits the key rather than sending an empty list.
          */}
          {gate.departure === undefined ? null : <Departure departure={gate.departure} />}
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
 * same threshold `ui-loop`'s loop rail uses) carries a `warn` Badge next
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

/**
 * Just enough of the workspace list to say which project a session is in. The
 * same lookup `useLoopExecution` does, and for the same reason: a session
 * belongs to at most one workspace, so this is a lookup, not a choice.
 */
interface WorkspaceListLike {
  items: readonly { workspaceId: string; sessionIds: readonly string[] }[]
}

/**
 * One run's draws, drawn HERE because nowhere else can draw them.
 *
 * `docs/project-model.md` §20.6. A published execution keeps its arrays in its
 * results folder and the project surface renders them from there — which is
 * why `receipt()` strips them from the durable event when a run publishes. An
 * unpublished run has no folder, so `receipt()` leaves them, and this event is
 * the only copy there is (P4d). The panels in the project surface read the
 * tree and hand their occupants an EMPTY conversation on purpose (§11.5), so
 * they can never show these.
 *
 * **The two cases are disjoint on the wire, and that is what keeps this from
 * being the duplication §20.4 removed.** A node carrying arrays did not
 * publish; a node that published carries none. There is no run whose draws
 * appear in both places.
 *
 * Behind a `<details>` closed by default: this sits in a TRANSCRIPT, where a
 * chart that opened itself would push the conversation off the screen. The
 * same plain-`<details>` idiom `PosteriorPanel`'s corner plot uses.
 */
const ScratchDraws = memo(function ScratchDraws(
  { run }: {
    run: {
      name: string
      // `| null` is not decoration: it is the shape a historical event
      // actually carries, and the reason both fields are guarded below.
      chains?: Record<string, (number | null)[]> | null
      spectrum?: (number | null)[][] | null
    }
  },
) {
  // `groupChains` treats a nullish bag as no draws — the choke point where
  // "null is not an empty object" is enforced, because a historical event
  // really does carry `"chains": null` and a throw here takes the whole chat
  // node slot down. The spectrum has no such choke point, so it is guarded on
  // the same `!= null` semantics right here.
  const groups = groupChains(run.chains)
  const spectrum = run.spectrum === null ? undefined : run.spectrum
  if (groups.length === 0 && spectrum === undefined) return null
  return (
    <details className={styles.draws} data-scratch-draws={run.name}>
      <summary className={styles.drawsSummary}>Draws from this run</summary>
      {/* Why they are here rather than in the project view — said on screen,
          because a reader who knows the panels live there would otherwise
          wonder which copy they are looking at. */}
      <p className={styles.drawsNote}>
        This run published nothing, so its draws are on this turn&apos;s own record
        and nowhere else. A run against a task file writes them to its results
        folder instead, and the project view draws them from there.
      </p>
      {groups.map(group => (
        <div key={group.latent} data-chain-group={group.latent} className={styles.drawsGroup}>
          <div className={styles.drawsLabel}>{group.latent}</div>
          {group.kind === 'series'
            ? <TracePlot series={group.series} />
            : <BandChart mean={group.mean} q05={group.q05} q95={group.q95} />}
        </div>
      ))}
      {spectrum !== undefined && (
        <div data-spectrum-grid className={styles.drawsGroup}>
          <div className={styles.drawsLabel}>m-mode power</div>
          <HeatMap grid={spectrum} />
        </div>
      )}
    </details>
  )
})

/**
 * "Open in the project view" — the one edge out of a result and into the
 * archive (`docs/project-model.md` §20.3).
 *
 * One control per NODE rather than per run: every run in one node came from
 * one `rheplicant/run` event, so they share an execution and a task, and a
 * control per row would be the same action repeated down the card.
 *
 * It renders only when it would actually do something — the execution
 * PUBLISHED, it is named, the session's project is known, and both project
 * services are reachable. A button that quietly did nothing would be worse
 * than no button, because it looks like it worked; and an unpublished
 * execution is exactly that case — the project surface would select an id its
 * tree does not hold and report "the results are in this execution's folder,
 * which could not be read from here", of a run that has no folder at all.
 */
const OpenInProject = memo(function OpenInProject(
  { workspaceId, taskPath, executionId }: {
    workspaceId: string
    taskPath: string | undefined
    executionId: string
  },
) {
  const onClick = useCallback(() => {
    openInProject(workspaceId, { taskPath, executionId })
  }, [workspaceId, taskPath, executionId])
  return (
    <button
      type="button"
      className={styles.openInProject}
      data-open-in-project={executionId}
      data-open-in-project-task={taskPath}
      onClick={onClick}
    >
      Open in the project view
    </button>
  )
})

/** Render one analysis run's step list with per-run status and diagnostics. */
export const AnalysisRunPanel = memo(function AnalysisRunPanel(
  { node, sessionId, useWorkspaces }: ChatNodeViewProps<'rheplicant-analysis'> & {
    useWorkspaces?: <T>(selector: (state: WorkspaceListLike) => T) => T
  },
) {
  const { runs, tookMs, graph, gates } = node.data
  // Every run here shares the event's execution identity (see
  // `AnalysisRunChatData.runs[].executionId`), so the first one that carries it
  // speaks for the node.
  const addressed = runs.find(run => run.executionId !== undefined)
  const here = String(sessionId)
  const workspaceId = useWorkspaces?.(state =>
    state.items.find(row => row.sessionIds.some(id => String(id) === here))?.workspaceId)
  const deepen = node.data.published
    && addressed?.executionId !== undefined
    && workspaceId !== undefined
    && canOpenInProject()
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
            <ScratchDraws run={run} />
          </li>
        ))}
      </ul>
      {tookMs !== undefined ? <footer data-took-ms>{tookMs} ms</footer> : null}
      {deepen && (
        <OpenInProject
          workspaceId={workspaceId}
          taskPath={addressed.taskPath}
          executionId={addressed.executionId}
        />
      )}
    </section>
  )
})

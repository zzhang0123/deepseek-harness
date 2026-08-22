/** Chains panel: per-run raw chain traces, grouped by latent — series traces plus credible bands. */
import { memo } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import {
  type AnalysisRun,
  BandChart,
  type ConsolePanelLayoutView,
  EmptyState,
  Panel,
  type PanelStatus,
  StatRow,
  TracePlot,
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
const PANEL_ID = 'chains'

interface ChainsPanelProps {
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
  /** Console layout state (owner prop — see ui-console's ConsoleView doc comment). Absent when not rendered through the console shell: renders un-collapsed, always visible. */
  layout?: ConsolePanelLayoutView
  /** The execution the console is showing (owner prop). Absent outside the console shell. */
  execution?: ConsoleExecutionView
}

/** An analysis run that has the chain draws this panel needs to draw traces. */
type ChainsRun = AnalysisRun & { readonly chains: Record<string, (number | null)[]> }

function hasChains(run: AnalysisRun): run is ChainsRun {
  return run.chains !== undefined
}

/** One run's rhat / n_eff / divergences diagnostics, folded into StatRow chips, plus one wrapped pair of StatRows per `mcmc` latent (when the sampler reported per-latent diagnostics). */
const RunDiagnosticStats = memo(function RunDiagnosticStats({ run }: { run: ChainsRun }) {
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
      {diagnostics.divergences !== undefined ? (
        <StatRow statKey="divergences" label="divergences" value={formatDiagnostic('divergences', diagnostics.divergences)} />
      ) : null}
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
const RunProvenanceCaption = memo(function RunProvenanceCaption({ run }: { run: ChainsRun }) {
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

/** React key for one run card — see `PosteriorPanel.tsx`'s `runCardKey` doc comment: `name` alone collides across two different runs (different events) that happen to share a name. */
function runCardKey(run: ChainsRun): string {
  return run.seq === undefined ? run.name : `${run.name}-${run.seq}`
}

/** One run's chain groups: a `TracePlot` per 'series' group (multi-series, legend, unit-less draw traces), a `BandChart` per 'band' group. */
const RunChainGroups = memo(function RunChainGroups({ chains }: { chains: Record<string, (number | null)[]> }) {
  const groups = groupChains(chains)
  return (
    <>
      {groups.map(group => (
        <div key={group.latent} data-chain-group={group.latent}>
          <div>{group.latent}</div>
          {group.kind === 'series' ? (
            <TracePlot series={group.series} />
          ) : (
            <BandChart mean={group.mean} q05={group.q05} q95={group.q95} />
          )}
        </div>
      ))}
    </>
  )
})

export const ChainsPanel = memo(function ChainsPanel({ useSession, layout, execution }: ChainsPanelProps) {
  // Prefer the execution the console selected, read off its published
  // tree; fall back to this session's log when there is none (outside
  // the console shell, or an older harness with no project route).
  const runs = runsToRender(execution, useSession(selectAnalysisRuns)).filter(hasChains)
  if (layout?.hidden.has(PANEL_ID) === true) return null
  const status: PanelStatus = runs.length === 0 ? 'idle' : runs.some(run => run.status === 'failed') ? 'error' : 'ok'

  return (
    <Panel
      id={PANEL_ID}
      title="Chains"
      status={status}
      {...(layout === undefined ? {} : {
        collapsed: layout.collapsed.has(PANEL_ID),
        onToggleCollapse: () => { layout.toggleCollapsed(PANEL_ID) },
      })}
    >
      {runs.length === 0 ? (
        <EmptyState
          message={executionEmptyReason(execution) ?? 'No chain draws yet'}
          hint={executionEmptyReason(execution) === undefined ? 'Ask the agent for a nuts or plan.sample run' : undefined}
        />
      ) : (
        runs.map(run => (
          <div key={runCardKey(run)} data-chains-run data-run-name={run.name}>
            <div><strong>{run.name}</strong> <span>({run.kind})</span></div>
            <RunProvenanceCaption run={run} />
            <RunDiagnosticStats run={run} />
            <RunChainGroups chains={run.chains} />
          </div>
        ))
      )}
    </Panel>
  )
})

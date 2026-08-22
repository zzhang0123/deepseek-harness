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
  groupChains,
  selectAnalysisRuns,
} from '@rheplicant/dsh-rheplicant-ui-kit/client'

/** This panel's own `console.panel` id — the key it reads/writes in `layout`. */
const PANEL_ID = 'chains'

interface ChainsPanelProps {
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
  /** Console layout state (owner prop — see ui-console's ConsoleView doc comment). Absent when not rendered through the console shell: renders un-collapsed, always visible. */
  layout?: ConsolePanelLayoutView
}

/** An analysis run that has the chain draws this panel needs to draw traces. */
type ChainsRun = AnalysisRun & { readonly chains: Record<string, (number | null)[]> }

function hasChains(run: AnalysisRun): run is ChainsRun {
  return run.chains !== undefined
}

/** One run's rhat / n_eff / divergences diagnostics, folded into StatRow chips. */
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
    </>
  )
})

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

export const ChainsPanel = memo(function ChainsPanel({ useSession, layout }: ChainsPanelProps) {
  const runs = useSession(selectAnalysisRuns).filter(hasChains)
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
        <EmptyState message="No chain draws yet" hint="Ask the agent for a nuts or plan.sample run" />
      ) : (
        runs.map(run => (
          <div key={run.name} data-chains-run data-run-name={run.name}>
            <div><strong>{run.name}</strong> <span>({run.kind})</span></div>
            <RunDiagnosticStats run={run} />
            <RunChainGroups chains={run.chains} />
          </div>
        ))
      )}
    </Panel>
  )
})

/**
 * Spectrum panel: m-mode power-spectrum magnitude rendered as a
 * theme-driven heatmap. Self-applies the grid layout (owner prop — see
 * ui-console's ConsoleView doc comment), the same way
 * `PosteriorPanel`/`ChainsPanel`/`GatesPanel`/`SignalPathPanel` do.
 */
import { memo } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import {
  type AnalysisRun,
  type PanelLayoutView,
  EmptyState,
  HeatMap,
  Panel,
  type PanelStatus,
  selectAnalysisRuns,
  runsToRender,
  executionEmptyReason,
  type ConsoleExecutionView,
} from '@rheplicant/dsh-rheplicant-ui-kit/client'

/** This panel's own `console.panel` id — the key it reads/writes in `layout`. */
const PANEL_ID = 'spectrum'

interface SpectrumPanelProps {
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
  /** Panel layout state (owner prop — see ui-project's ProjectHome doc comment). Absent when not rendered through a panel grid (e.g. a unit test): renders un-collapsed, always visible. */
  layout?: PanelLayoutView
  /** The execution the console is showing (owner prop). Absent outside the console shell. */
  execution?: ConsoleExecutionView
}

/** An analysis run that has the spectrum grid this panel needs to draw a heatmap. */
type SpectrumRun = AnalysisRun & { readonly spectrum: (number | null)[][] }

/**
 * A run carrying real spectrum grid.
 *
 * `!= null` on purpose, and it is load-bearing: the wire field is optional,
 * but events recorded before the service stopped emitting explicit nulls
 * carry `null` — measured in real session logs. `undefined`-only guards let a
 * null through, and the crash it causes takes the whole slot down.
 */
function hasSpectrum(run: AnalysisRun): run is SpectrumRun {
  return run.spectrum !== undefined && run.spectrum !== null
}

export const SpectrumPanel = memo(function SpectrumPanel({ useSession, layout, execution }: SpectrumPanelProps) {
  // Prefer the execution the console selected, read off its published
  // tree; fall back to this session's log when there is none (outside
  // the console shell, or an older harness with no project route).
  const runs = runsToRender(execution, useSession(selectAnalysisRuns)).filter(hasSpectrum)
  if (layout?.hidden.has(PANEL_ID) === true) return null
  const status: PanelStatus = runs.length === 0 ? 'idle' : runs.some(run => run.status === 'failed') ? 'error' : 'ok'

  return (
    <Panel
      id={PANEL_ID}
      title="Spectrum"
      status={status}
      {...(layout === undefined ? {} : {
        collapsed: layout.collapsed.has(PANEL_ID),
        onToggleCollapse: () => { layout.toggleCollapsed(PANEL_ID) },
      })}
    >
      {runs.length === 0 ? (
        <EmptyState
          message={executionEmptyReason(execution) ?? 'No spectrum runs yet'}
          hint={executionEmptyReason(execution) === undefined ? 'Ask the agent for an mmodes run' : undefined}
        />
      ) : (
        runs.map(run => (
          <div key={run.name} data-spectrum-run data-run-name={run.name}>
            <div><strong>{run.name}</strong> <span>({run.kind})</span></div>
            <HeatMap grid={run.spectrum} />
          </div>
        ))
      )}
    </Panel>
  )
})

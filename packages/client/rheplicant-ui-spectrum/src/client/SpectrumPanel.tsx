/**
 * Spectrum panel: m-mode power-spectrum magnitude rendered as a
 * theme-driven heatmap. Self-applies the console layout (owner prop — see
 * ui-console's ConsoleView doc comment), the same way
 * `PosteriorPanel`/`ChainsPanel`/`GatesPanel`/`SignalPathPanel` do.
 */
import { memo } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import {
  type AnalysisRun,
  type ConsolePanelLayoutView,
  EmptyState,
  HeatMap,
  Panel,
  type PanelStatus,
  selectAnalysisRuns,
} from '@rheplicant/dsh-rheplicant-ui-kit/client'

/** This panel's own `console.panel` id — the key it reads/writes in `layout`. */
const PANEL_ID = 'spectrum'

interface SpectrumPanelProps {
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
  /** Console layout state (owner prop — see ui-console's ConsoleView doc comment). Absent when not rendered through the console shell (e.g. a unit test): renders un-collapsed, always visible. */
  layout?: ConsolePanelLayoutView
}

/** An analysis run that has the spectrum grid this panel needs to draw a heatmap. */
type SpectrumRun = AnalysisRun & { readonly spectrum: (number | null)[][] }

function hasSpectrum(run: AnalysisRun): run is SpectrumRun {
  return run.spectrum !== undefined
}

export const SpectrumPanel = memo(function SpectrumPanel({ useSession, layout }: SpectrumPanelProps) {
  const runs = useSession(selectAnalysisRuns).filter(hasSpectrum)
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
        <EmptyState message="No spectrum runs yet" hint="Ask the agent for an mmodes run" />
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

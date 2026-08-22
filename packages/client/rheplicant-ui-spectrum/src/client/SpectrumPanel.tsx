/** Spectrum panel: m-mode power-spectrum magnitude rendered as a theme-driven heatmap. */
import { memo } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import {
  type AnalysisRun,
  EmptyState,
  HeatMap,
  Panel,
  type PanelStatus,
  selectAnalysisRuns,
} from '@rheplicant/dsh-rheplicant-ui-kit/client'

interface SpectrumPanelProps {
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
}

/** An analysis run that has the spectrum grid this panel needs to draw a heatmap. */
type SpectrumRun = AnalysisRun & { readonly spectrum: (number | null)[][] }

function hasSpectrum(run: AnalysisRun): run is SpectrumRun {
  return run.spectrum !== undefined
}

export const SpectrumPanel = memo(function SpectrumPanel({ useSession }: SpectrumPanelProps) {
  const runs = useSession(selectAnalysisRuns).filter(hasSpectrum)
  const status: PanelStatus = runs.length === 0 ? 'idle' : runs.some(run => run.status === 'failed') ? 'error' : 'ok'

  return (
    <Panel id="spectrum" title="Spectrum" status={status}>
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

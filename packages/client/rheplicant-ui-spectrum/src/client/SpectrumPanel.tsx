/** Spectrum panel: m-mode power-spectrum magnitude rendered as a theme-driven heatmap. */
import { memo } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import {
  type AnalysisRun,
  EmptyState,
  Panel,
  type PanelStatus,
  TOKEN,
  selectAnalysisRuns,
} from '@rheplicant/dsh-rheplicant-ui-kit/client'

interface SpectrumPanelProps {
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
}

/** An analysis run that has the spectrum grid this panel needs to draw a heatmap. */
type SpectrumRun = AnalysisRun & { readonly spectrum: (number | null)[][] }

const CELL = 8

function hasSpectrum(run: AnalysisRun): run is SpectrumRun {
  return run.spectrum !== undefined
}

/** Scale one magnitude onto the lit-accent ramp (sqrt-compressed) via theme-aware `color-mix`. */
function magnitudeColor(value: number, max: number): string {
  const t = max <= 0 ? 0 : Math.sqrt(value / max)
  const percent = Math.round(Math.min(1, Math.max(0, t)) * 100)
  return `color-mix(in srgb, ${TOKEN.lit} ${percent}%, var(--dsw-alias-bg-layer-2))`
}

const SpectrumHeatmap = memo(function SpectrumHeatmap({ spectrum }: { spectrum: (number | null)[][] }) {
  const rows = spectrum.length
  const cols = spectrum[0]?.length ?? 0
  if (rows === 0 || cols === 0) return null
  let max = 0
  for (const row of spectrum) for (const value of row) if (value !== null && value > max) max = value
  return (
    <svg width={cols * CELL} height={rows * CELL} role="img" aria-label="Power spectrum heatmap" data-spectrum-grid>
      {spectrum.map((row, y) => row.map((value, x) => (
        // A null cell (a non-finite magnitude on the wire) draws at zero —
        // the ramp's base color — rather than poisoning the whole grid.
        <rect key={`${x}-${y}`} x={x * CELL} y={y * CELL} width={CELL} height={CELL} fill={magnitudeColor(value ?? 0, max)} data-spectrum-cell />
      )))}
    </svg>
  )
})

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
            <SpectrumHeatmap spectrum={run.spectrum} />
          </div>
        ))
      )}
    </Panel>
  )
})

/** Spectrum panel: m-mode power-spectrum magnitude rendered as an amber heatmap. */
import { memo } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'

interface SpectrumPanelProps {
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
}

/** One m-mode run's power-spectrum magnitude grid. */
interface SpectrumRun {
  readonly name: string
  readonly kind: string
  readonly spectrum?: number[][]
}

const CELL = 8

/** Scale one magnitude onto the amber-on-dark ramp (sqrt-compressed). */
function magnitudeColor(value: number, max: number): string {
  const t = max <= 0 ? 0 : Math.sqrt(value / max)
  const r = Math.round(7 + t * (242 - 7))
  const g = Math.round(19 + t * (169 - 19))
  const b = Math.round(31 + t * (59 - 31))
  return `rgb(${r},${g},${b})`
}

const SpectrumHeatmap = memo(function SpectrumHeatmap({ spectrum }: { spectrum: number[][] }) {
  const rows = spectrum.length
  const cols = spectrum[0]?.length ?? 0
  if (rows === 0 || cols === 0) return null
  let max = 0
  for (const row of spectrum) for (const value of row) if (value > max) max = value
  return (
    <svg width={cols * CELL} height={rows * CELL} role="img" aria-label="Power spectrum heatmap" data-spectrum-grid>
      {spectrum.map((row, y) => row.map((value, x) => (
        <rect key={`${x}-${y}`} x={x * CELL} y={y * CELL} width={CELL} height={CELL} fill={magnitudeColor(value, max)} data-spectrum-cell />
      )))}
    </svg>
  )
})

export const SpectrumPanel = memo(function SpectrumPanel({ useSession }: SpectrumPanelProps) {
  const runs = useSession(snapshot => snapshot.chat.nodes.values()
    .filter(node => node.kind === 'rheplicant-analysis')
    .flatMap(node => (node.data as { runs: readonly SpectrumRun[] }).runs))

  return (
    <section data-spectrum style={{ padding: 12, border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8 }}>
      <h3>Spectrum</h3>
      {runs.map(run => run.spectrum === undefined ? null : (
        <div key={run.name} data-spectrum-run data-run-name={run.name}>
          <div><strong>{run.name}</strong> <span>({run.kind})</span></div>
          <SpectrumHeatmap spectrum={run.spectrum} />
        </div>
      ))}
    </section>
  )
})

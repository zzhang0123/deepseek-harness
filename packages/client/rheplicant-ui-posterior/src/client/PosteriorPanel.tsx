/** Posterior panel: corner plot of the folded analysis run's per-latent chains. */
import { memo } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'

interface PosteriorPanelProps {
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
}

/** One analysis run's posterior material, as projected from the `rheplicant/run` outcome. */
interface PosteriorRun {
  readonly name: string
  readonly kind: string
  readonly chains?: Record<string, number[]>
}

const BINS = 20
const CELL = 96
const PAD = 8
const AMBER = '#F2A93B'

/** Bin a draw sequence into a ~20-bin 1D histogram. */
function histogram(values: number[]): number[] {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const counts = new Array<number>(BINS).fill(0)
  for (const value of values) {
    const bin = Math.min(BINS - 1, Math.floor(((value - min) / range) * BINS))
    counts[bin] = (counts[bin] ?? 0) + 1
  }
  return counts
}

/** Corner plot: diagonal 1D histograms, upper triangle 2D scatter. */
const Corner = memo(function Corner({ chains }: { chains: Record<string, number[]> }) {
  const entries = Object.entries(chains)
  const n = entries.length
  const size = PAD + n * CELL

  return (
    <svg width={size} height={size} data-corner role="img" aria-label="Corner plot">
      {entries.map(([latent, values], i) => {
        const counts = histogram(values)
        const maxCount = Math.max(...counts) || 1
        const barWidth = CELL / BINS
        return (
          <g key={`hist-${latent}`} transform={`translate(${PAD + i * CELL}, ${PAD + i * CELL})`}>
            {counts.map((count, b) => {
              const h = (count / maxCount) * CELL
              return <rect key={b} x={b * barWidth} y={CELL - h} width={Math.max(1, barWidth - 1)} height={h} fill={AMBER} data-corner-hist />
            })}
          </g>
        )
      })}
      {entries.map(([li, xs], i) => entries.map(([lj, ys], j) => {
        if (i >= j) return null
        const xMin = Math.min(...xs)
        const xMax = Math.max(...xs)
        const yMin = Math.min(...ys)
        const yMax = Math.max(...ys)
        const xRange = xMax - xMin || 1
        const yRange = yMax - yMin || 1
        return (
          <g key={`scatter-${li}-${lj}`} transform={`translate(${PAD + j * CELL}, ${PAD + i * CELL})`}>
            {xs.map((x, k) => (
              <circle
                key={k}
                cx={((x - xMin) / xRange) * CELL}
                cy={CELL - (((ys[k] ?? 0) - yMin) / yRange) * CELL}
                r={1.2}
                fill={AMBER}
                data-corner-scatter
              />
            ))}
          </g>
        )
      }))}
    </svg>
  )
})

export const PosteriorPanel = memo(function PosteriorPanel({ useSession }: PosteriorPanelProps) {
  const runs = useSession(snapshot => snapshot.chat.nodes.values()
    .filter(node => node.kind === 'rheplicant-analysis')
    .flatMap(node => (node.data as { runs: readonly PosteriorRun[] }).runs))

  return (
    <section data-rheplicant-posterior style={{ padding: 12, border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8 }}>
      <h3>Posterior</h3>
      {runs.map(run => run.chains === undefined ? null : (
        <div key={run.name} data-posterior-run data-run-name={run.name}>
          <div><strong>{run.name}</strong> <span>({run.kind})</span></div>
          <Corner chains={run.chains} />
        </div>
      ))}
    </section>
  )
})

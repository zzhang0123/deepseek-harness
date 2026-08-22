/**
 * Credible-band trace: a translucent q05–q95 band with the mean drawn as a
 * single amber line over it, x = draw index — the rendering counterpart to
 * `groupChains`'s `kind: 'band'` output (see `chains.ts`) for a wide
 * latent's per-draw summary. Axes and hover follow `TracePlot`'s
 * conventions (shared draw-index x-axis, nearest-index crosshair).
 * @module @rheplicant/dsh-rheplicant-ui-kit/client/chart/BandChart
 */
import { memo, useMemo, useRef } from 'react'
import { formatNumber } from '../format/number.ts'
import { TOKEN } from '../tokens.ts'
import { Axis } from './Axis.tsx'
import { ChartSurface, DEFAULT_HEIGHT, DEFAULT_MARGIN, DEFAULT_WIDTH, plotSizeOf } from './ChartSurface.tsx'
import { nearestIndex } from './hover.ts'
import { extentOf, linearScale, linePathSegments, niceTicks, type Scale } from './scales.ts'
import { ChartTip, useChartPointer } from './Tooltip.tsx'
import styles from './chart.module.css'

export interface BandChartProps {
  readonly mean: readonly (number | null)[]
  readonly q05: readonly (number | null)[]
  readonly q95: readonly (number | null)[]
  readonly unit?: string
}

const X_TICK_COUNT = 4
const Y_TICK_COUNT = 4

/** Closed polygon path per contiguous run where both `q05` and `q95` are finite — a run of 1 can't bound an area, so it's skipped. */
function bandPathSegments(
  q05: readonly (number | null)[],
  q95: readonly (number | null)[],
  xScale: Scale,
  yScale: Scale,
): string[] {
  const n = Math.max(q05.length, q95.length)
  const segments: string[] = []
  let run: number[] = []
  const flush = () => {
    if (run.length >= 2) {
      const top = run.map(i => `${xScale(i).toFixed(2)},${yScale(q95[i] as number).toFixed(2)}`)
      const bottomIndices = [...run].reverse()
      const bottom = bottomIndices.map(i => `${xScale(i).toFixed(2)},${yScale(q05[i] as number).toFixed(2)}`)
      segments.push(`M${top.join('L')}L${bottom.join('L')}Z`)
    }
    run = []
  }
  for (let i = 0; i < n; i++) {
    const lo = q05[i]
    const hi = q95[i]
    const finite = lo !== null && hi !== null && Number.isFinite(lo) && Number.isFinite(hi)
    if (finite) run.push(i)
    else flush()
  }
  flush()
  return segments
}

/** Nice-padded `[min, max]` covering `ticks`, falling back to `[0, 1]` when there are none. */
function tickDomain(ticks: readonly number[]): [number, number] {
  if (ticks.length === 0) return [0, 1]
  const lo = Math.min(...ticks)
  const hi = Math.max(...ticks)
  return lo === hi ? [lo - 1, hi + 1] : [lo, hi]
}

export const BandChart = memo(function BandChart({ mean, q05, q95, unit }: BandChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  const pointer = useChartPointer(ref, { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })
  const { plot } = plotSizeOf(DEFAULT_WIDTH, DEFAULT_HEIGHT)

  const drawCount = Math.max(mean.length, q05.length, q95.length)
  const xDomain = useMemo((): [number, number] => [0, Math.max(1, drawCount - 1)], [drawCount])
  const xTicks = useMemo(() => niceTicks(xDomain[0], xDomain[1], X_TICK_COUNT), [xDomain])

  const yExtent = useMemo(() => extentOf([...mean, ...q05, ...q95]), [mean, q05, q95])
  const yTicks = useMemo(() => (yExtent ? niceTicks(yExtent[0], yExtent[1], Y_TICK_COUNT) : [0, 1]), [yExtent])
  const yDomain = useMemo(() => tickDomain(yTicks), [yTicks])

  const hover = nearestIndex(pointer, DEFAULT_MARGIN, plot.width, xDomain, drawCount)
  const suffix = unit ? ` ${unit}` : ''

  return (
    <div>
      <ChartSurface
        ref={ref}
        width={DEFAULT_WIDTH}
        height={DEFAULT_HEIGHT}
        kind="band"
        overlay={() => {
          if (hover === null) return null
          return (
            <ChartTip x={pointer.clientX ?? 0} y={pointer.clientY ?? 0} visible={pointer.active}>
              <div>draw {formatNumber(hover)}</div>
              <div>
                {formatNumber(mean[hover] ?? null)} [{formatNumber(q05[hover] ?? null)}, {formatNumber(q95[hover] ?? null)}]
                {suffix}
              </div>
            </ChartTip>
          )
        }}
      >
        {({ width: plotWidth, height: plotHeight }) => {
          const xScale = linearScale(xDomain, [0, plotWidth])
          const yScale = linearScale(yDomain, [plotHeight, 0])
          const bandSegments = bandPathSegments(q05, q95, xScale, yScale)
          const meanPoints = mean.map((y, x) => ({ x, y }))
          const meanSegments = linePathSegments(meanPoints, xScale, yScale)
          return (
            <>
              <Axis orientation="left" scale={yScale} ticks={yTicks} plotWidth={plotWidth} plotHeight={plotHeight} unit={unit} grid />
              <Axis orientation="bottom" scale={xScale} ticks={xTicks} plotWidth={plotWidth} plotHeight={plotHeight} />
              {bandSegments.map((d, i) => (
                <path key={i} data-band d={d} fill={TOKEN.chartBand} stroke="none" />
              ))}
              {meanSegments.map((d, i) => (
                <path key={i} data-mean-line d={d} stroke={TOKEN.lit} strokeWidth={1.25} fill="none" />
              ))}
              {hover !== null ? (
                <line
                  data-crosshair
                  className={styles.crosshair}
                  x1={xScale(hover)}
                  x2={xScale(hover)}
                  y1={0}
                  y2={plotHeight}
                />
              ) : null}
            </>
          )
        }}
      </ChartSurface>
    </div>
  )
})

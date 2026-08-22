/**
 * Multi-series chain trace plot: one amber/node-palette line per sampler
 * chain or fanned-out component, sharing one nice-padded y-extent across
 * every series so traces stay visually comparable. Hover shows the nearest
 * draw index as a crosshair plus one tooltip line per series.
 * @module @rheplicant/dsh-rheplicant-ui-kit/client/chart/TracePlot
 */
import { memo, useMemo, useRef } from 'react'
import { formatNumber } from '../format/number.ts'
import { SERIES, TOKEN } from '../tokens.ts'
import { Axis } from './Axis.tsx'
import { ChartSurface, DEFAULT_HEIGHT, DEFAULT_MARGIN, DEFAULT_WIDTH, plotSizeOf } from './ChartSurface.tsx'
import { extentOf, linearScale, linePathSegments, niceTicks } from './scales.ts'
import { ChartTip, useChartPointer } from './Tooltip.tsx'
import { nearestIndex } from './hover.ts'
import styles from './chart.module.css'

export interface TraceSeries {
  readonly key: string
  readonly label: string
  readonly values: readonly (number | null)[]
}

export interface TracePlotProps {
  readonly series: readonly TraceSeries[]
  readonly height?: number
  readonly unit?: string
}

const X_TICK_COUNT = 4
const Y_TICK_COUNT = 4

/** Nice-padded `[min, max]` covering `ticks`, falling back to `[0, 1]` when there are none. */
function tickDomain(ticks: readonly number[]): [number, number] {
  if (ticks.length === 0) return [0, 1]
  const lo = Math.min(...ticks)
  const hi = Math.max(...ticks)
  return lo === hi ? [lo - 1, hi + 1] : [lo, hi]
}

export const TracePlot = memo(function TracePlot({ series, height = DEFAULT_HEIGHT, unit }: TracePlotProps) {
  const ref = useRef<HTMLDivElement>(null)
  const pointer = useChartPointer(ref, { width: DEFAULT_WIDTH, height })
  const { plot } = plotSizeOf(DEFAULT_WIDTH, height)

  const drawCount = useMemo(() => series.reduce((max, s) => Math.max(max, s.values.length), 0), [series])
  const xDomain = useMemo((): [number, number] => [0, Math.max(1, drawCount - 1)], [drawCount])
  const xTicks = useMemo(() => niceTicks(xDomain[0], xDomain[1], X_TICK_COUNT), [xDomain])

  const yExtent = useMemo(() => extentOf(series.flatMap(s => s.values)), [series])
  const yTicks = useMemo(
    () => (yExtent ? niceTicks(yExtent[0], yExtent[1], Y_TICK_COUNT) : [0, 1]),
    [yExtent],
  )
  const yDomain = useMemo(() => tickDomain(yTicks), [yTicks])

  const hover = nearestIndex(pointer, DEFAULT_MARGIN, plot.width, xDomain, drawCount)

  return (
    <div>
      <ChartSurface
        ref={ref}
        width={DEFAULT_WIDTH}
        height={height}
        kind="trace"
        overlay={() => {
          if (hover === null) return null
          return (
            <ChartTip x={pointer.clientX ?? 0} y={pointer.clientY ?? 0} visible={pointer.active}>
              <div>draw {formatNumber(hover)}</div>
              {series.map(s => (
                <div key={s.key}>
                  {s.label}: {formatNumber(s.values[hover] ?? null)}
                </div>
              ))}
            </ChartTip>
          )
        }}
      >
        {({ width: plotWidth, height: plotHeight }) => {
          const xScale = linearScale(xDomain, [0, plotWidth])
          const yScale = linearScale(yDomain, [plotHeight, 0])
          return (
            <>
              <Axis orientation="left" scale={yScale} ticks={yTicks} plotWidth={plotWidth} plotHeight={plotHeight} unit={unit} grid />
              <Axis orientation="bottom" scale={xScale} ticks={xTicks} plotWidth={plotWidth} plotHeight={plotHeight} />
              {series.map((s, i) => {
                const points = s.values.map((y, x) => ({ x, y }))
                const segments = linePathSegments(points, xScale, yScale)
                const color = SERIES[i % SERIES.length] ?? TOKEN.lit
                return (
                  <g key={s.key} data-series={s.key}>
                    {segments.map((d, si) => (
                      <path key={si} d={d} stroke={color} strokeWidth={1.25} fill="none" />
                    ))}
                  </g>
                )
              })}
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
      {series.length > 1 ? (
        <div className={styles.legend} data-chart-legend>
          {series.map((s, i) => (
            <span key={s.key} className={styles.legendItem} data-legend-item={s.key}>
              <span className={styles.legendChip} style={{ background: SERIES[i % SERIES.length] ?? TOKEN.lit }} />
              {s.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
})

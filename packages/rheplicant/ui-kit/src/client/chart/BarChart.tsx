/**
 * Indexed bar chart for a rank-ordered spectrum (e.g. singular values): a
 * linear or log value axis, an optional dashed rank-cutoff rule splitting
 * "kept" from "dimmed" bars, and an optional stroke marking the weakest
 * identified component. Hover shows the bar's index and value.
 * @module @rheplicant/dsh-rheplicant-ui-kit/client/chart/BarChart
 */
import { memo, useMemo, useRef } from 'react'
import { formatNumber } from '../format/number.ts'
import { TOKEN } from '../tokens.ts'
import { Axis } from './Axis.tsx'
import { ChartSurface, DEFAULT_HEIGHT, DEFAULT_MARGIN, DEFAULT_WIDTH, plotSizeOf } from './ChartSurface.tsx'
import { extentOf, linearScale, logScale, logTicks, niceTicks } from './scales.ts'
import { ChartTip, useChartPointer } from './Tooltip.tsx'
import styles from './chart.module.css'

export interface BarChartProps {
  readonly values: readonly (number | null)[]
  readonly logY?: boolean
  readonly cutoffIndex?: number
  readonly highlightIndex?: number
  readonly unit?: string
}

const X_TICK_COUNT = 4
const Y_TICK_COUNT = 4
const DIMMED_OPACITY = 0.55
const LOG_FLOOR = 1e-12

export const BarChart = memo(function BarChart({ values, logY = false, cutoffIndex, highlightIndex, unit }: BarChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  const pointer = useChartPointer(ref, { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })
  const { plot } = plotSizeOf(DEFAULT_WIDTH, DEFAULT_HEIGHT)

  const n = values.length
  const extent = useMemo(() => extentOf(values), [values])

  const yDomain = useMemo((): [number, number] => {
    if (logY) {
      const positives = values.filter((v): v is number => v !== null && Number.isFinite(v) && v > 0)
      const lo = positives.length > 0 ? Math.min(...positives) : LOG_FLOOR
      const hi = extent ? Math.max(extent[1], lo) : lo * 10
      return [lo, hi > lo ? hi : lo * 10]
    }
    if (!extent) return [0, 1]
    const lo = Math.min(0, extent[0])
    const hi = extent[1]
    return [lo, hi > lo ? hi : lo + 1]
  }, [values, logY, extent])

  const yTicks = useMemo(() => (logY ? logTicks(yDomain[0], yDomain[1]) : niceTicks(yDomain[0], yDomain[1], Y_TICK_COUNT)), [logY, yDomain])
  const yTickDomain = useMemo((): [number, number] => {
    if (yTicks.length === 0) return yDomain
    return [Math.min(...yTicks, yDomain[0]), Math.max(...yTicks, yDomain[1])]
  }, [yTicks, yDomain])

  const xExtent = Math.max(1, n - 1)
  const xTicks = useMemo(() => niceTicks(0, xExtent, X_TICK_COUNT), [xExtent])

  const bandwidth = n > 0 ? plot.width / n : 0
  const hoverIdx = useMemo(() => {
    if (!pointer.active || pointer.x === null || n === 0 || bandwidth <= 0) return null
    const px = pointer.x - DEFAULT_MARGIN.left
    if (px < 0 || px > plot.width) return null
    return Math.min(Math.max(Math.floor(px / bandwidth), 0), n - 1)
  }, [pointer.active, pointer.x, n, bandwidth, plot.width])
  const hoverValue = hoverIdx !== null ? (values[hoverIdx] ?? null) : null

  return (
    <div>
      <ChartSurface
        ref={ref}
        width={DEFAULT_WIDTH}
        height={DEFAULT_HEIGHT}
        kind="bar"
        overlay={() => {
          if (hoverIdx === null) return null
          const suffix = unit ? ` ${unit}` : ''
          return (
            <ChartTip x={pointer.clientX ?? 0} y={pointer.clientY ?? 0} visible={pointer.active}>
              <div>#{formatNumber(hoverIdx)}</div>
              <div>
                {formatNumber(hoverValue)}
                {suffix}
              </div>
            </ChartTip>
          )
        }}
      >
        {({ width: plotWidth, height: plotHeight }) => {
          const yScale = logY ? logScale(yTickDomain, [plotHeight, 0]) : linearScale(yTickDomain, [plotHeight, 0])
          const baselineY = logY ? plotHeight : yScale(0)
          const cutoffX = cutoffIndex !== undefined && bandwidth > 0 ? Math.min(Math.max(cutoffIndex, 0), n) * bandwidth : null
          return (
            <>
              <Axis orientation="left" scale={yScale} ticks={yTicks} plotWidth={plotWidth} plotHeight={plotHeight} unit={unit} grid />
              <Axis
                orientation="bottom"
                scale={linearScale([-0.5, xExtent + 0.5], [0, plotWidth])}
                ticks={xTicks}
                plotWidth={plotWidth}
                plotHeight={plotHeight}
              />
              {values.map((v, i) => {
                const value = v !== null && Number.isFinite(v) ? v : yTickDomain[0]
                const y = yScale(value)
                const top = Math.min(y, baselineY)
                const barHeight = Math.max(0, Math.abs(baselineY - y))
                const dimmed = cutoffIndex !== undefined && i >= cutoffIndex
                const isWeakest = highlightIndex === i
                const weakestAttrs = isWeakest ? { 'data-weakest': true } : {}
                return (
                  <rect
                    key={i}
                    data-bar={i}
                    {...weakestAttrs}
                    x={i * bandwidth}
                    y={top}
                    width={Math.max(0, bandwidth - 1)}
                    height={barHeight}
                    fill={dimmed ? TOKEN.nodeProcessing : TOKEN.lit}
                    opacity={dimmed ? DIMMED_OPACITY : 1}
                    stroke={isWeakest ? TOKEN.warn : 'none'}
                    strokeWidth={isWeakest ? 1.5 : 0}
                  />
                )
              })}
              {cutoffX !== null ? (
                <line data-cutoff className={styles.cutoffLine} x1={cutoffX} x2={cutoffX} y1={0} y2={plotHeight} />
              ) : null}
            </>
          )
        }}
      </ChartSurface>
    </div>
  )
})

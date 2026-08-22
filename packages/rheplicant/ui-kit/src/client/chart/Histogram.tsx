/**
 * 1D histogram of a draw sequence: equal-width bins with a 1px gap, a count
 * axis on the left, a value axis on the bottom. Hover shows the bin's
 * `[x0, x1)` range and its count.
 * @module @rheplicant/dsh-rheplicant-ui-kit/client/chart/Histogram
 */
import { memo, useMemo, useRef } from 'react'
import { formatNumber } from '../format/number.ts'
import { TOKEN } from '../tokens.ts'
import { Axis } from './Axis.tsx'
import { ChartSurface, DEFAULT_HEIGHT, DEFAULT_MARGIN, DEFAULT_WIDTH, plotSizeOf } from './ChartSurface.tsx'
import { nearestBinIndex } from './hover.ts'
import { binValues, linearScale, niceTicks } from './scales.ts'
import { ChartTip, useChartPointer } from './Tooltip.tsx'

export interface HistogramProps {
  readonly values: readonly (number | null)[]
  readonly bins?: number
  readonly color?: string
  readonly unit?: string
}

const DEFAULT_BIN_COUNT = 24
const X_TICK_COUNT = 4
const Y_TICK_COUNT = 3
const BAR_GAP = 1

export const Histogram = memo(function Histogram({
  values,
  bins = DEFAULT_BIN_COUNT,
  color = TOKEN.lit,
  unit,
}: HistogramProps) {
  const ref = useRef<HTMLDivElement>(null)
  const pointer = useChartPointer(ref, { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })
  const { plot } = plotSizeOf(DEFAULT_WIDTH, DEFAULT_HEIGHT)

  const histBins = useMemo(() => binValues(values, bins), [values, bins])
  const xDomain = useMemo((): [number, number] => {
    const first = histBins[0]
    const last = histBins[histBins.length - 1]
    if (!first || !last) return [0, 1]
    return first.x0 === last.x1 ? [first.x0, first.x0 + 1] : [first.x0, last.x1]
  }, [histBins])
  const xTicks = useMemo(() => niceTicks(xDomain[0], xDomain[1], X_TICK_COUNT), [xDomain])

  const maxCount = useMemo(() => histBins.reduce((m, b) => Math.max(m, b.count), 0), [histBins])
  const yTicks = useMemo(() => niceTicks(0, Math.max(1, maxCount), Y_TICK_COUNT), [maxCount])
  const yDomain = useMemo((): [number, number] => {
    if (yTicks.length === 0) return [0, 1]
    return [0, Math.max(...yTicks, maxCount)]
  }, [yTicks, maxCount])

  const hoverIdx = nearestBinIndex(pointer, DEFAULT_MARGIN, plot.width, xDomain, histBins)
  const hoverBin = hoverIdx !== null ? histBins[hoverIdx] : undefined

  return (
    <div>
      <ChartSurface
        ref={ref}
        width={DEFAULT_WIDTH}
        height={DEFAULT_HEIGHT}
        kind="histogram"
        overlay={() => {
          if (!hoverBin) return null
          const suffix = unit ? ` ${unit}` : ''
          return (
            <ChartTip x={pointer.clientX ?? 0} y={pointer.clientY ?? 0} visible={pointer.active}>
              <div>
                {formatNumber(hoverBin.x0)}
                {suffix} – {formatNumber(hoverBin.x1)}
                {suffix}
              </div>
              <div>count {formatNumber(hoverBin.count)}</div>
            </ChartTip>
          )
        }}
      >
        {({ width: plotWidth, height: plotHeight }) => {
          const xScale = linearScale(xDomain, [0, plotWidth])
          const yScale = linearScale(yDomain, [plotHeight, 0])
          return (
            <>
              <Axis orientation="left" scale={yScale} ticks={yTicks} plotWidth={plotWidth} plotHeight={plotHeight} grid />
              <Axis orientation="bottom" scale={xScale} ticks={xTicks} plotWidth={plotWidth} plotHeight={plotHeight} unit={unit} />
              {histBins.map((bin, i) => {
                const x0 = xScale(bin.x0)
                const x1 = xScale(bin.x1)
                const width = Math.max(0, x1 - x0 - BAR_GAP)
                const y = yScale(bin.count)
                return (
                  <rect
                    key={i}
                    data-bin={i}
                    x={x0}
                    y={y}
                    width={width}
                    height={Math.max(0, plotHeight - y)}
                    fill={color}
                  />
                )
              })}
            </>
          )
        }}
      </ChartSurface>
    </div>
  )
})

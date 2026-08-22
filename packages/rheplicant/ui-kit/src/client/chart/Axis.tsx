/**
 * One SVG axis (bottom or left): tick marks, tick labels, and a light
 * domain baseline. Pure presentation over a caller-built `Scale` — `Axis`
 * never computes a domain, extent, or tick set itself, so every chart form
 * stays in control of its own scale construction.
 * @module @rheplicant/dsh-rheplicant-ui-kit/client/chart/Axis
 */
import { memo } from 'react'
import { formatNumber } from '../format/number.ts'
import type { Scale } from './scales.ts'
import styles from './chart.module.css'

export type AxisOrientation = 'bottom' | 'left'

export interface AxisProps {
  readonly orientation: AxisOrientation
  readonly scale: Scale
  readonly ticks: readonly number[]
  readonly plotWidth: number
  readonly plotHeight: number
  readonly format?: (v: number) => string
  /**
   * `| undefined` (not just `?`) so a chart form can forward its own
   * optional `unit` prop straight through — `unit={unit}` — without
   * tripping `exactOptionalPropertyTypes` in the real dsh build (this
   * package's real typecheck; the local `tsconfig.check-client.json` proxy
   * doesn't enable that flag, so it wouldn't have caught this here).
   */
  readonly unit?: string | undefined
  /** Faint full-length gridlines through each tick, using the chart-grid token. */
  readonly grid?: boolean
}

const TICK_SIZE = 4
const LEFT_LABEL_X = -4

export const Axis = memo(function Axis({
  orientation,
  scale,
  ticks,
  plotWidth,
  plotHeight,
  format = formatNumber,
  unit,
  grid = false,
}: AxisProps) {
  const isBottom = orientation === 'bottom'
  return (
    <g data-axis={orientation}>
      {isBottom ? (
        <line className={styles.axisLine} x1={0} y1={plotHeight} x2={plotWidth} y2={plotHeight} />
      ) : (
        <line className={styles.axisLine} x1={0} y1={0} x2={0} y2={plotHeight} />
      )}
      {ticks.map((tick, i) => {
        const pos = scale(tick)
        const label = format(tick)
        if (isBottom) {
          return (
            <g key={`${tick}-${i}`} data-tick transform={`translate(${pos},${plotHeight})`}>
              {grid ? <line className={styles.gridLine} x1={0} x2={0} y1={-plotHeight} y2={0} /> : null}
              <line className={styles.axisLine} x1={0} x2={0} y1={0} y2={TICK_SIZE} />
              <text className={styles.tickText} x={0} y={TICK_SIZE + 9} textAnchor="middle">
                {label}
              </text>
            </g>
          )
        }
        return (
          <g key={`${tick}-${i}`} data-tick transform={`translate(0,${pos})`}>
            {grid ? <line className={styles.gridLine} x1={0} x2={plotWidth} y1={0} y2={0} /> : null}
            <line className={styles.axisLine} x1={-TICK_SIZE} x2={0} y1={0} y2={0} />
            <text className={styles.tickText} x={LEFT_LABEL_X} y={3} textAnchor="end">
              {label}
            </text>
          </g>
        )
      })}
      {unit !== undefined ? (
        <text
          data-axis-unit
          className={styles.axisUnit}
          x={isBottom ? plotWidth : 0}
          y={isBottom ? plotHeight + 20 : -8}
          textAnchor={isBottom ? 'end' : 'start'}
        >
          {unit}
        </text>
      ) : null}
    </g>
  )
})

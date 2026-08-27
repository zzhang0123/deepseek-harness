/**
 * 2D magnitude heat map (e.g. an m-mode power spectrum): each cell's fill is
 * the lit amber token mixed toward the layer-2 background in proportion to
 * `|value|` normalized against the grid's largest magnitude — `color-mix`,
 * not a literal color scale, so the whole ramp stays token-driven. A `null`
 * cell (not finite on the wire) renders as plain background with
 * `data-cell-null` rather than being coerced to zero. Integer row/col index
 * axes, a hover tooltip, and a slim ramp legend with min/max labels.
 * @module @rheplicant/dsh-rheplicant-ui-kit/client/chart/HeatMap
 */
import { memo, useMemo, useRef } from 'react'
import { formatNumber } from '../format/number.ts'
import { TOKEN } from '../tokens.ts'
import { Axis } from './Axis.tsx'
import { ChartSurface, DEFAULT_HEIGHT, DEFAULT_WIDTH, plotSizeOf } from './ChartSurface.tsx'
import { linearScale } from './scales.ts'
import { ChartTip, useChartPointer } from './Tooltip.tsx'
import styles from './chart.module.css'

export interface HeatMapProps {
  readonly grid: ReadonlyArray<ReadonlyArray<number | null>>
  /**
   * `| undefined` explicitly, not just `?`. Under `exactOptionalPropertyTypes`
   * (the dsh checkout's program — this package's real typecheck) `xLabel?:
   * string` means "omit the key or pass a string", and a caller forwarding its
   * own optional unit — `xLabel={freq.label}` — is passing `string |
   * undefined`, which is a different thing. Same reason `EmptyState.hint`
   * carries the same widening, and measured the same way: both local tsc
   * programs accepted it and the checkout's did not.
   */
  readonly xLabel?: string | undefined
  readonly yLabel?: string | undefined
  /**
   * Real coordinate values for the column indices, when the caller has them —
   * a frequency axis, a time axis. One entry per COLUMN of `grid`, already
   * sampled by whatever stride the grid was.
   *
   * Absent means the caller does not know them, and the axis then labels by
   * INDEX exactly as before. That is the honest fallback: an index says "the
   * fourth column" and is true; a guessed coordinate says "63.6 MHz" and may
   * not be.
   */
  readonly xValues?: readonly number[] | undefined
  /** Real coordinate values for the row indices. Same rule as `xValues`. */
  readonly yValues?: readonly number[] | undefined
  /**
   * The magnitude the ramp saturates at. Absent means this grid's own largest,
   * which is right for a grid drawn alone and WRONG for two drawn side by side.
   *
   * Load-bearing rather than a convenience: each grid normalising against its
   * own maximum makes a fit that is 30% low look identical to the data it is
   * being compared with. A caller drawing a pair passes ONE shared value —
   * and this doc said "the max of both" for a build, which would hand the
   * quantity under test control of its own reference: a fit that overshoots
   * would raise the scale and shrink its own error. `ReconstructionPanel`
   * anchors to the DATA's peak, and `docs/project-model.md` §30.5 says why.
   */
  readonly scaleMax?: number | undefined
  /**
   * Draw the ramp legend under the plot. Default `true`.
   *
   * `false` is for a caller drawing a PAIR on one `scaleMax`: two identical
   * scale bars under two adjacent figures is the same legend twice, and one
   * bar is what "one scale" actually looks like. A figure drawn alone keeps
   * its own — a plot with no scale is not a reading.
   */
  readonly ramp?: boolean
}

/**
 * Label an index tick with its coordinate, when there is one.
 *
 * Falls back to the index for a tick the value array does not cover, rather
 * than to `undefined` or an empty label: a gap in the array is a caller bug,
 * and a visibly wrong-looking integer among coordinates is easier to notice
 * than a blank.
 */
function tickFormat(values: readonly number[] | undefined): ((index: number) => string) | undefined {
  if (values === undefined || values.length === 0) return undefined
  return (index: number) => formatNumber(values[index] ?? index)
}

const MAX_AXIS_TICKS = 6
// Not in `TOKEN` (tokens.ts only spells the rheplicant-extension + a handful
// of alias tokens this kit already reaches for elsewhere) — named here so
// the two uses below (null-cell fill, color-mix's background stop) stay in
// sync rather than repeating the `var(--dsw-alias-bg-layer-2)` literal.
const BG_LAYER_2 = 'var(--dsw-alias-bg-layer-2)'

/** Evenly spaced integer indices in `[0, count - 1]`, capped at `max`, always including both endpoints. */
function integerTicks(count: number, max = MAX_AXIS_TICKS): number[] {
  if (count <= 0) return [0]
  if (count <= max) return Array.from({ length: count }, (_, i) => i)
  const step = Math.ceil(count / max)
  const ticks: number[] = []
  for (let i = 0; i < count; i += step) ticks.push(i)
  const last = count - 1
  if (ticks[ticks.length - 1] !== last) ticks.push(last)
  return ticks
}

/** Index-to-cell-center scale: index `i` of `count` cells maps to the pixel center of that cell. */
function centerScale(count: number, extent: number) {
  return linearScale([-0.5, Math.max(0, count - 1) + 0.5], [0, extent])
}

export const HeatMap = memo(function HeatMap({ grid, xLabel, yLabel, xValues, yValues, scaleMax, ramp = true }: HeatMapProps) {
  const ref = useRef<HTMLDivElement>(null)
  const pointer = useChartPointer(ref, { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })
  const { plot, margin } = plotSizeOf(DEFAULT_WIDTH, DEFAULT_HEIGHT)

  const rows = grid.length
  const cols = useMemo(() => grid.reduce((m, row) => Math.max(m, row.length), 0), [grid])

  const ownMax = useMemo(() => {
    let m = 0
    for (const row of grid) {
      for (const v of row) {
        if (v !== null && Number.isFinite(v)) m = Math.max(m, Math.abs(v))
      }
    }
    return m
  }, [grid])
  // A shared scale wins, and a zero, negative or non-finite one is refused
  // rather than honoured: each would flatten every cell to the background and
  // read as "no data", which is a different fact. `Infinity` is the one a
  // `> 0` test lets through — `NaN > 0` is already false — and it is reachable
  // from any future caller that maxes over an unfiltered grid.
  const maxAbs = scaleMax !== undefined && Number.isFinite(scaleMax) && scaleMax > 0 ? scaleMax : ownMax

  const rowTicks = useMemo(() => integerTicks(rows), [rows])
  const colTicks = useMemo(() => integerTicks(cols), [cols])
  const formatX = useMemo(() => tickFormat(xValues), [xValues])
  const formatY = useMemo(() => tickFormat(yValues), [yValues])

  const cellWidth = cols > 0 ? plot.width / cols : 0
  const cellHeight = rows > 0 ? plot.height / rows : 0

  const hoverCell = useMemo(() => {
    if (!pointer.active || pointer.x === null || pointer.y === null || rows === 0 || cols === 0) return null
    const px = pointer.x - margin.left
    const py = pointer.y - margin.top
    if (px < 0 || px > plot.width || py < 0 || py > plot.height) return null
    const col = Math.min(Math.max(Math.floor(px / cellWidth), 0), cols - 1)
    const row = Math.min(Math.max(Math.floor(py / cellHeight), 0), rows - 1)
    return { row, col }
  }, [pointer.active, pointer.x, pointer.y, rows, cols, margin, plot.width, plot.height, cellWidth, cellHeight])
  const hoverValue = hoverCell ? (grid[hoverCell.row]?.[hoverCell.col] ?? null) : null

  return (
    <div>
      <ChartSurface
        ref={ref}
        width={DEFAULT_WIDTH}
        height={DEFAULT_HEIGHT}
        kind="heatmap"
        overlay={() => {
          if (!hoverCell) return null
          return (
            <ChartTip x={pointer.clientX ?? 0} y={pointer.clientY ?? 0} visible={pointer.active}>
              <div>
                ({formatNumber(yValues?.[hoverCell.row] ?? hoverCell.row)},{' '}
                {formatNumber(xValues?.[hoverCell.col] ?? hoverCell.col)})
              </div>
              <div>{formatNumber(hoverValue)}</div>
            </ChartTip>
          )
        }}
      >
        {({ width: plotWidth, height: plotHeight }) => {
          const colScale = centerScale(cols, plotWidth)
          const rowScale = centerScale(rows, plotHeight)
          return (
            <>
              <Axis orientation="left" scale={rowScale} ticks={rowTicks} plotWidth={plotWidth} plotHeight={plotHeight} unit={yLabel} {...(formatY === undefined ? {} : { format: formatY })} />
              <Axis orientation="bottom" scale={colScale} ticks={colTicks} plotWidth={plotWidth} plotHeight={plotHeight} unit={xLabel} {...(formatX === undefined ? {} : { format: formatX })} />
              {grid.map((row, r) =>
                row.map((v, c) => {
                  const isNull = v === null || !Number.isFinite(v)
                  const percent = isNull || maxAbs === 0 ? 0 : Math.min(100, (Math.abs(v) / maxAbs) * 100)
                  const fill = isNull
                    ? BG_LAYER_2
                    : `color-mix(in srgb, ${TOKEN.lit} ${percent.toFixed(1)}%, ${BG_LAYER_2})`
                  const nullAttrs = isNull ? { 'data-cell-null': true } : {}
                  return (
                    <rect
                      key={`${r}-${c}`}
                      data-cell
                      data-x={c}
                      data-y={r}
                      {...nullAttrs}
                      x={c * cellWidth}
                      y={r * cellHeight}
                      width={cellWidth}
                      height={cellHeight}
                      fill={fill}
                    />
                  )
                }),
              )}
            </>
          )
        }}
      </ChartSurface>
      {ramp ? (
        <div className={styles.ramp} data-ramp>
          <span>{formatNumber(0)}</span>
          <span className={styles.rampBar} />
          <span>{formatNumber(maxAbs)}</span>
        </div>
      ) : null}
    </div>
  )
})

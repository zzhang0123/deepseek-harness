/**
 * Pairwise corner plot over a small set of latents: lower-triangle 2D density
 * cells (`binCount x binCount`, colored by `color-mix` the same way HeatMap
 * colors its cells) below a diagonal of 1D marginal histograms (reusing
 * `binValues` — the same binning helper Histogram itself is built on, so the
 * marginal bars agree with what a standalone `<Histogram>` of the same series
 * would show). The upper triangle stays empty, the standard corner-plot
 * shape. One `<svg>`, not a `ChartSurface` per cell: the grid's axes are
 * SHARED per column/row (one bottom axis per column, one left axis per row),
 * which only works as one coordinate system spanning every cell — the
 * per-instance-margin `ChartSurface` abstraction is built for exactly one
 * plot and does not fit that.
 * @module @rheplicant/dsh-rheplicant-ui-kit/client/chart/CornerGrid
 */
import { memo, useMemo } from 'react'
import { TOKEN } from '../tokens.ts'
import { Axis } from './Axis.tsx'
import type { ChainSeries } from './chains.ts'
import { binValues, extentOf, linearScale, niceTicks, type Scale } from './scales.ts'
import styles from './chart.module.css'

export interface CornerGridProps {
  readonly series: readonly ChainSeries[]
  /** Latents actually rendered; the rest are dropped with a named, visible note (never silent). Default 4. */
  readonly maxLatents?: number
  /** Bins per axis for both the 2D density cells and the diagonal marginals. Default 20. */
  readonly binCount?: number
}

const DEFAULT_MAX_LATENTS = 4
const DEFAULT_BIN_COUNT = 20
const CELL = 96
const GAP = 2
const AXIS_LEFT = 34
const AXIS_BOTTOM = 20
const AXIS_TICK_COUNT = 3
// Not in `TOKEN` (see HeatMap.tsx's own copy of this constant) — named here so
// the null/background fill and the color-mix background stop stay in sync
// rather than repeating the `var(--dsw-alias-bg-layer-2)` literal.
const BG_LAYER_2 = 'var(--dsw-alias-bg-layer-2)'

/** A series' own domain, used both as its column's x-domain and its row's y-domain. Empty/non-finite data falls back to `[0, 1]`, same as every other scale in this kit. */
function seriesDomain(series: ChainSeries): [number, number] {
  return extentOf(series.values) ?? [0, 1]
}

/**
 * 2D histogram of one `(x, y)` pane: `binCount x binCount` counts over
 * `xDomain x yDomain`. Mirrors `binValues`' tolerance — non-finite or `null`
 * coordinates (in either axis) are dropped, never coerced into an edge bin.
 * Index `[0]` of each axis is the LOW end of its domain (data order, not
 * pixel order); callers invert for pixel placement the same way every other
 * y-scale in this kit does (`linearScale(domain, [plotHeight, 0])`).
 */
function bin2D(
  xValues: readonly (number | null)[],
  yValues: readonly (number | null)[],
  xDomain: readonly [number, number],
  yDomain: readonly [number, number],
  binCount: number,
): number[][] {
  const n = Math.max(1, Math.floor(Number.isFinite(binCount) ? binCount : 1))
  const counts: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  const [x0, x1] = xDomain
  const [y0, y1] = yDomain
  const xSpan = x1 - x0 || 1
  const ySpan = y1 - y0 || 1
  const len = Math.min(xValues.length, yValues.length)
  for (let k = 0; k < len; k++) {
    const x = xValues[k]
    const y = yValues[k]
    // `noUncheckedIndexedAccess` widens both to `number | null | undefined`;
    // `Number.isFinite` is not a type predicate, so it narrows nothing on its
    // own — the explicit `undefined` checks are what let TS narrow `x`/`y` to
    // `number` below (matching `row === undefined` a few lines down).
    if (x === null || x === undefined || y === null || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) continue
    const xi = Math.min(n - 1, Math.max(0, Math.floor(((x - x0) / xSpan) * n)))
    const yi = Math.min(n - 1, Math.max(0, Math.floor(((y - y0) / ySpan) * n)))
    const row = counts[yi]
    if (row === undefined) continue
    row[xi] = (row[xi] ?? 0) + 1
  }
  return counts
}

/** One lower-triangle 2D density pane: `binCount x binCount` rects, colored by local (per-pane) max density. */
const DensityCell = memo(function DensityCell({ row, col, xValues, yValues, xDomain, yDomain, binCount }: {
  row: number
  col: number
  xValues: readonly (number | null)[]
  yValues: readonly (number | null)[]
  xDomain: readonly [number, number]
  yDomain: readonly [number, number]
  binCount: number
}) {
  const counts = useMemo(
    () => bin2D(xValues, yValues, xDomain, yDomain, binCount),
    [xValues, yValues, xDomain, yDomain, binCount],
  )
  const n = counts.length
  const maxCount = useMemo(() => counts.reduce((m, r) => r.reduce((mm, c) => Math.max(mm, c), m), 0), [counts])
  const sub = CELL / n
  return (
    <g data-corner-cell={`${row},${col}`}>
      {counts.map((rowCounts, yi) =>
        rowCounts.map((count, xi) => {
          const percent = maxCount === 0 ? 0 : Math.min(100, (count / maxCount) * 100)
          const fill = percent === 0
            ? BG_LAYER_2
            : `color-mix(in srgb, ${TOKEN.lit} ${percent.toFixed(1)}%, ${BG_LAYER_2})`
          // yi=0 is the domain's LOW end (data order); pixel rows grow
          // downward while the domain's low end sits at the pane's bottom
          // (see the module doc), so the pixel row is the mirrored index.
          const py = (n - 1 - yi) * sub
          return <rect key={`${yi}-${xi}`} x={xi * sub} y={py} width={sub} height={sub} fill={fill} />
        }),
      )}
    </g>
  )
})

/** One diagonal marginal: `binValues`' own bins, drawn as bottom-anchored bars sized to the shared cell. */
const MarginalCell = memo(function MarginalCell({ index, values, domain, binCount }: {
  index: number
  values: readonly (number | null)[]
  domain: readonly [number, number]
  binCount: number
}) {
  const bins = useMemo(() => binValues(values, binCount), [values, binCount])
  const maxCount = useMemo(() => bins.reduce((m, b) => Math.max(m, b.count), 0), [bins])
  const xScale = useMemo((): Scale => linearScale(domain, [0, CELL]), [domain])
  const barGap = 0.5
  return (
    <g data-corner-diagonal={index}>
      {bins.map((bin, i) => {
        const x0 = xScale(bin.x0)
        const x1 = xScale(bin.x1)
        const width = Math.max(0, x1 - x0 - barGap)
        const height = maxCount === 0 ? 0 : (bin.count / maxCount) * CELL
        return <rect key={i} x={x0} y={CELL - height} width={width} height={height} fill={TOKEN.lit} />
      })}
    </g>
  )
})

export const CornerGrid = memo(function CornerGrid({
  series,
  maxLatents = DEFAULT_MAX_LATENTS,
  binCount = DEFAULT_BIN_COUNT,
}: CornerGridProps) {
  const cap = Math.max(1, Math.floor(Number.isFinite(maxLatents) ? maxLatents : DEFAULT_MAX_LATENTS))
  const shown = series.slice(0, cap)
  const dropped = series.length - shown.length
  const n = shown.length

  const domains = useMemo(() => shown.map(seriesDomain), [shown])
  const ticksOf = useMemo(() => domains.map(d => niceTicks(d[0], d[1], AXIS_TICK_COUNT)), [domains])

  const width = AXIS_LEFT + n * CELL + Math.max(0, n - 1) * GAP
  const height = n * CELL + Math.max(0, n - 1) * GAP + AXIS_BOTTOM

  return (
    <div>
      {n > 0 ? (
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" data-corner-grid role="img" aria-label="Corner plot">
          {shown.map((rowSeries, row) => shown.map((colSeries, col) => {
            if (col > row) return null
            const cellX = AXIS_LEFT + col * (CELL + GAP)
            const cellY = row * (CELL + GAP)
            return (
              <g key={`${row}-${col}`} transform={`translate(${cellX},${cellY})`}>
                {col === row ? (
                  <MarginalCell index={row} values={rowSeries.values} domain={domains[row] ?? [0, 1]} binCount={binCount} />
                ) : (
                  <DensityCell
                    row={row}
                    col={col}
                    xValues={colSeries.values}
                    yValues={rowSeries.values}
                    xDomain={domains[col] ?? [0, 1]}
                    yDomain={domains[row] ?? [0, 1]}
                    binCount={binCount}
                  />
                )}
              </g>
            )
          }))}
          {/* Bottom axis: one per column, shared by every pane in it — drawn once along the last row's bottom edge. */}
          {shown.map((colSeries, col) => {
            const domain = domains[col] ?? [0, 1]
            const ticks = ticksOf[col] ?? [0, 1]
            const cellX = AXIS_LEFT + col * (CELL + GAP)
            const bottomY = n * (CELL + GAP) - GAP
            return (
              <g key={`bottom-${col}`} transform={`translate(${cellX},${bottomY})`}>
                <Axis
                  orientation="bottom"
                  scale={linearScale(domain, [0, CELL])}
                  ticks={ticks}
                  plotWidth={CELL}
                  plotHeight={0}
                  unit={colSeries.label}
                />
              </g>
            )
          })}
          {/* Left axis: one per row, shared by every 2D pane in it. Row 0 has no
              2D pane (only its own diagonal, whose y-axis is bin count, not a
              shared data domain), so it gets no left axis. */}
          {shown.map((rowSeries, row) => {
            if (row === 0) return null
            const domain = domains[row] ?? [0, 1]
            const ticks = ticksOf[row] ?? [0, 1]
            const rowY = row * (CELL + GAP)
            return (
              <g key={`left-${row}`} transform={`translate(${AXIS_LEFT},${rowY})`}>
                <Axis
                  orientation="left"
                  scale={linearScale(domain, [CELL, 0])}
                  ticks={ticks}
                  plotWidth={0}
                  plotHeight={CELL}
                  unit={rowSeries.label}
                />
              </g>
            )
          })}
        </svg>
      ) : null}
      {dropped > 0 ? (
        <p className={styles.legendItem} data-corner-truncated>
          {dropped} of {series.length} latent{series.length === 1 ? '' : 's'} not shown (showing the first {cap})
        </p>
      ) : null}
    </div>
  )
})

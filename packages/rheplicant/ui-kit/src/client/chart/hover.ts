/**
 * Internal hover-math helpers shared by the chart forms: invert a pointer's
 * viewBox-space x back to plot-local pixels, then to the nearest draw index
 * or histogram bin. Not part of the public chart API — not re-exported from
 * `index.ts` — since it's plumbing for `TracePlot`/`BandChart`/`Histogram`,
 * not something a consumer builds a chart from directly.
 * @module @rheplicant/dsh-rheplicant-ui-kit/client/chart/hover
 */
import type { ChartMargin } from './ChartSurface.tsx'
import type { HistogramBin } from './scales.ts'

export interface HoverPointer {
  readonly x: number | null
  readonly active: boolean
}

/** Pointer x in plot-local pixels (surface x minus the left margin), or `null` when outside the plot. */
function plotX(pointer: HoverPointer, margin: ChartMargin, plotWidth: number): number | null {
  if (!pointer.active || pointer.x === null) return null
  const px = pointer.x - margin.left
  if (px < 0 || px > plotWidth) return null
  return px
}

/** Nearest integer index in `[0, count - 1]` for a pointer over a linear `[d0, d1]` domain spanning `plotWidth`. */
export function nearestIndex(
  pointer: HoverPointer,
  margin: ChartMargin,
  plotWidth: number,
  domain: readonly [number, number],
  count: number,
): number | null {
  const px = plotX(pointer, margin, plotWidth)
  if (px === null || count === 0) return null
  const t = plotWidth > 0 ? px / plotWidth : 0
  const raw = domain[0] + t * (domain[1] - domain[0])
  return Math.min(Math.max(Math.round(raw), 0), count - 1)
}

/** Nearest bin (`[x0, x1)`, last bin inclusive of `x1`) for a pointer over a linear domain spanning `plotWidth`. */
export function nearestBinIndex(
  pointer: HoverPointer,
  margin: ChartMargin,
  plotWidth: number,
  domain: readonly [number, number],
  bins: readonly HistogramBin[],
): number | null {
  const px = plotX(pointer, margin, plotWidth)
  if (px === null || bins.length === 0) return null
  const t = plotWidth > 0 ? px / plotWidth : 0
  const value = domain[0] + t * (domain[1] - domain[0])
  for (let i = 0; i < bins.length; i++) {
    const bin = bins[i]
    if (bin && value >= bin.x0 && (value < bin.x1 || i === bins.length - 1)) return i
  }
  const first = bins[0]
  return first && value < first.x0 ? 0 : bins.length - 1
}

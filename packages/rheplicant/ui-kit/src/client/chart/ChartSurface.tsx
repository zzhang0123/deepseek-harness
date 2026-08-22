/**
 * Shared SVG frame for every chart form: a fixed `viewBox`, margins, and a
 * relative-positioned wrapper div so {@link ChartTip} (see `Tooltip.tsx`)
 * can layer an absolutely positioned HTML tip over the plot without a
 * `foreignObject`. `children` is a render prop over the inner plot size (in
 * viewBox units) so a consumer builds its scales from the same numbers this
 * component lays out with — no DOM measurement round-trip. The optional
 * `overlay` render prop renders as a sibling of the `<svg>`, inside the same
 * wrap div, which is the only place plain HTML (the tooltip) can live next
 * to the chart. The wrap div's ref is forwarded so a consumer can attach
 * pointer listeners to exactly the element `overlay` is positioned against
 * (see `useChartPointer` in `Tooltip.tsx`).
 * @module @rheplicant/dsh-rheplicant-ui-kit/client/chart/ChartSurface
 */
import { forwardRef, memo, type ReactNode } from 'react'
import styles from './chart.module.css'

export interface ChartMargin {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

export interface PlotSize {
  readonly width: number
  readonly height: number
}

export const DEFAULT_MARGIN: ChartMargin = { top: 6, right: 8, bottom: 22, left: 40 }
export const DEFAULT_WIDTH = 360
export const DEFAULT_HEIGHT = 150

/** The inner plot size (surface size minus margins), floored at zero. */
export function plotSizeOf(width: number, height: number, margin?: Partial<ChartMargin>): { readonly plot: PlotSize; readonly margin: ChartMargin } {
  const m: ChartMargin = { ...DEFAULT_MARGIN, ...margin }
  return {
    plot: { width: Math.max(0, width - m.left - m.right), height: Math.max(0, height - m.top - m.bottom) },
    margin: m,
  }
}

export interface ChartSurfaceProps {
  readonly width?: number
  readonly height?: number
  readonly margin?: Partial<ChartMargin>
  /** Chart form identifier, rendered as `data-chart-kind` (e.g. `"trace"`, `"histogram"`). */
  readonly kind: string
  readonly children: (plot: PlotSize) => ReactNode
  /** Rendered as an HTML sibling of the `<svg>`, inside the same positioned wrap div — for `ChartTip`. */
  readonly overlay?: (plot: PlotSize) => ReactNode
}

export const ChartSurface = memo(
  forwardRef<HTMLDivElement, ChartSurfaceProps>(function ChartSurface(
    { width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, margin, kind, children, overlay },
    ref,
  ) {
    const { plot, margin: m } = plotSizeOf(width, height, margin)
    return (
      <div ref={ref} className={styles.wrap} data-chart data-chart-kind={kind}>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img">
          <g transform={`translate(${m.left},${m.top})`}>{children(plot)}</g>
        </svg>
        {overlay ? overlay(plot) : null}
      </div>
    )
  }),
)

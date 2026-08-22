/**
 * Shared panel chrome, chart kit, formatting, and run selectors for the
 * rheplicant console plugins. A pure library: no `apply()`, no slot
 * registration, no cordis import — every consumer inlines this into its own
 * client bundle rather than loading it as a module-table row.
 * @module @rheplicant/dsh-rheplicant-ui-kit/client
 */

export { TOKEN, SERIES } from './tokens.ts'

export { Panel } from './panel/Panel.tsx'
export type { PanelProps, PanelStatus } from './panel/Panel.tsx'

export { StatRow } from './panel/StatRow.tsx'
export type { StatRowProps, StatVerdict } from './panel/StatRow.tsx'

export { Badge } from './panel/Badge.tsx'
export type { BadgeProps, BadgeState } from './panel/Badge.tsx'

export { EmptyState } from './panel/EmptyState.tsx'
export type { EmptyStateProps } from './panel/EmptyState.tsx'

export { formatNumber, formatDiagnostic, formatMs } from './format/number.ts'

export { selectAnalysisRuns } from './run/run-selectors.ts'
export type { AnalysisRun, AnalysisRunDiagnostics, AnalysisRunProduct } from './run/run-selectors.ts'

export {
  binValues,
  extentOf,
  linePathSegments,
  linearScale,
  logScale,
  logTicks,
  niceTicks,
} from './chart/scales.ts'
export type { HistogramBin, LinePoint, Scale } from './chart/scales.ts'

export { groupChains } from './chart/chains.ts'
export type { ChainGroup, ChainSeries } from './chart/chains.ts'

export { ChartSurface, DEFAULT_HEIGHT, DEFAULT_MARGIN, DEFAULT_WIDTH, plotSizeOf } from './chart/ChartSurface.tsx'
export type { ChartMargin, ChartSurfaceProps, PlotSize } from './chart/ChartSurface.tsx'

export { Axis } from './chart/Axis.tsx'
export type { AxisOrientation, AxisProps } from './chart/Axis.tsx'

export { ChartTip, useChartPointer } from './chart/Tooltip.tsx'
export type { ChartPointer, ChartTipProps } from './chart/Tooltip.tsx'

export { TracePlot } from './chart/TracePlot.tsx'
export type { TracePlotProps, TraceSeries } from './chart/TracePlot.tsx'

export { Histogram } from './chart/Histogram.tsx'
export type { HistogramProps } from './chart/Histogram.tsx'

export { BarChart } from './chart/BarChart.tsx'
export type { BarChartProps } from './chart/BarChart.tsx'

export { HeatMap } from './chart/HeatMap.tsx'
export type { HeatMapProps } from './chart/HeatMap.tsx'

export { BandChart } from './chart/BandChart.tsx'
export type { BandChartProps } from './chart/BandChart.tsx'

export { CornerGrid } from './chart/CornerGrid.tsx'
export type { CornerGridProps } from './chart/CornerGrid.tsx'

export type { ConsolePanelLayoutView } from './panel/layout.ts'

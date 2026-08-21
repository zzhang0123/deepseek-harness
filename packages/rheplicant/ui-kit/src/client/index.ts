/**
 * Shared panel chrome, chart tokens, formatting, and run selectors for the
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

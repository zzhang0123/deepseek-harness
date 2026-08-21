/**
 * One place that spells the CSS custom properties this kit reads: the
 * `--dsw-rh-*` extension tokens `ui-theme` defines (stale state, graph
 * node-kind palette, chart scaffolding), plus a handful of the standard dsh
 * `--dsw-alias-*` set. No hex literals — reach color through `TOKEN` for
 * JS-side values (SVG `fill`) or the same `var(--dsw-…)` names in CSS.
 * @module @rheplicant/dsh-rheplicant-ui-kit/client/tokens
 */
export const TOKEN = {
  // rheplicant extension tokens (ui-theme)
  lit: 'var(--dsw-rh-lit)',
  staleBg: 'var(--dsw-rh-stale-bg)',
  staleText: 'var(--dsw-rh-stale-text)',
  nodeSource: 'var(--dsw-rh-node-source)',
  nodeTransform: 'var(--dsw-rh-node-transform)',
  nodeProcessing: 'var(--dsw-rh-node-processing)',
  wire: 'var(--dsw-rh-node-wire)',
  chartGrid: 'var(--dsw-rh-chart-grid)',
  chartBand: 'var(--dsw-rh-chart-band)',
  // standard dsh alias tokens
  labelPrimary: 'var(--dsw-alias-label-primary)',
  labelSecondary: 'var(--dsw-alias-label-secondary)',
  borderL1: 'var(--dsw-alias-border-l1)',
  success: 'var(--dsw-alias-state-success-primary)',
  warn: 'var(--dsw-alias-state-warn-primary)',
  error: 'var(--dsw-alias-state-error-primary)',
} as const

/** Multi-chain chart series order: chain 0 amber, then the node palette. */
export const SERIES: readonly string[] = [TOKEN.lit, TOKEN.nodeSource, TOKEN.nodeTransform, TOKEN.nodeProcessing]

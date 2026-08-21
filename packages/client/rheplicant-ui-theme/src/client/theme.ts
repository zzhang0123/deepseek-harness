/**
 * rheplicant "radio telescope observatory" palette: deep-space navy base,
 * steel-blue structure, amber "signal" accent — derived from the project logo
 * (steel/navy blue) and the signal-path diagram (amber = lit signal path).
 */
import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'

const PALETTE: Record<string, string> = {
  '--dsw-alias-bg-base': '#07131f',
  '--dsw-alias-bg-layer-1': '#0c1f2f',
  '--dsw-alias-bg-layer-2': '#12293d',
  '--dsw-alias-bg-overlay': '#162f45',
  '--dsw-alias-border-l1': '#1f3a52',
  '--dsw-alias-border-l2': '#2c4d6b',
  '--dsw-alias-brand-primary': '#F2A93B',
  '--dsw-alias-label-primary': '#e8eef3',
  '--dsw-alias-label-secondary': '#9fb3c4',
  '--dsw-alias-state-success-primary': '#7fd1a8',
  '--dsw-alias-state-warn-primary': '#F2A93B',
  '--dsw-alias-state-error-primary': '#e0675a',
  '--dsw-specific-sidebar-fill': '#07131f',
}

/** Scheme-invariant override: the same value for light and dark base palettes. */
export const rheplicantOverrides: ThemeTokenOverrides = Object.fromEntries(
  Object.entries(PALETTE).map(([name, value]) => [name, { light: value, dark: value }]),
)

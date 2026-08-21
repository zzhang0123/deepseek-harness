/**
 * rheplicant "radio telescope observatory" palette, applied as a token
 * OVERRIDE layer over the active base theme (the brand-shading pattern).
 *
 * Scheme-aware (decided 2026-08-21, dark-first):
 * - dark: the deep-space navy console signature (base #07131f family).
 * - light: upstream rheplicant GUI workbench values (e-RHINO
 *   src/rheplicant/gui/react/tokens.css) — present so light "does not
 *   break", not a designed-first surface.
 * - the lit amber matches upstream `core/render.py _THEMES` exactly
 *   (#E3B341 dark / #BA7517 light): the host-rendered signal-path SVG
 *   uses those literals, and the chrome must not clash with it.
 *
 * `--dsw-rh-*` are rheplicant EXTENSION tokens (not dsh aliases): the
 * stale state, the graph node-kind palette, and chart scaffolding.
 * Chart series reuse the node palette — the chart palette IS the graph
 * palette, one identity (chain 0 amber, then source/transform/processing).
 */
import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'

interface SchemePair {
  readonly light: string
  readonly dark: string
}

const TOKENS: Record<string, SchemePair> = {
  // -- dsh alias overrides -------------------------------------------------
  '--dsw-alias-bg-base': { light: '#f4f6f8', dark: '#07131f' },
  '--dsw-alias-bg-layer-1': { light: '#ffffff', dark: '#0c1f2f' },
  '--dsw-alias-bg-layer-2': { light: '#f8fafc', dark: '#12293d' },
  '--dsw-alias-bg-overlay': { light: '#ffffff', dark: '#162f45' },
  '--dsw-alias-border-l1': { light: '#c5ced8', dark: '#1f3a52' },
  '--dsw-alias-border-l2': { light: '#a8b6c4', dark: '#2c4d6b' },
  '--dsw-alias-brand-primary': { light: '#BA7517', dark: '#E3B341' },
  '--dsw-alias-label-primary': { light: '#17212b', dark: '#e8eef3' },
  '--dsw-alias-label-secondary': { light: '#52616f', dark: '#9fb3c4' },
  '--dsw-alias-state-success-primary': { light: '#176b38', dark: '#7fd1a8' },
  '--dsw-alias-state-warn-primary': { light: '#6b4d00', dark: '#E3B341' },
  '--dsw-alias-state-error-primary': { light: '#8f1d24', dark: '#e0675a' },
  '--dsw-specific-sidebar-fill': { light: '#eef1f4', dark: '#07131f' },

  // -- rheplicant extension tokens ----------------------------------------
  // the signal path / accent (mirrors brand-primary for chart code)
  '--dsw-rh-lit': { light: '#BA7517', dark: '#E3B341' },
  // stale: a first-class state upstream (result bound to a superseded
  // revision), also the `skip`-mode gate color
  '--dsw-rh-stale-bg': { light: '#ece7f6', dark: '#352a4a' },
  '--dsw-rh-stale-text': { light: '#5b3c88', dark: '#d5c1f2' },
  // state backgrounds: dsh aliases stop at -primary/-secondary/-tertiary
  // (no -bg family), so chips define their own washes here — light values
  // from upstream tokens.css status pairs, dark as washes over the navy
  '--dsw-rh-state-ok-bg': { light: '#e7f6ed', dark: 'rgba(127, 209, 168, 0.14)' },
  '--dsw-rh-state-warn-bg': { light: '#fff3cd', dark: 'rgba(227, 179, 65, 0.14)' },
  '--dsw-rh-state-error-bg': { light: '#fdebec', dark: 'rgba(224, 103, 90, 0.14)' },
  // graph node kinds (strokes from core/render.py _THEMES)
  '--dsw-rh-node-source': { light: '#534AB7', dark: '#A371F7' },
  '--dsw-rh-node-source-bg': { light: '#EEEDFE', dark: '#241E3D' },
  '--dsw-rh-node-transform': { light: '#185FA5', dark: '#58A6FF' },
  '--dsw-rh-node-transform-bg': { light: '#E6F1FB', dark: '#0D2137' },
  '--dsw-rh-node-processing': { light: '#5F5E5A', dark: '#8B949E' },
  '--dsw-rh-node-processing-bg': { light: '#F1EFE8', dark: '#1C1F24' },
  '--dsw-rh-node-wire': { light: '#8C8A82', dark: '#6E7681' },
  // chart scaffolding (low-emphasis grid, translucent credible band)
  '--dsw-rh-chart-grid': { light: '#d7dde4', dark: '#1a3349' },
  '--dsw-rh-chart-band': { light: 'rgba(186, 117, 23, 0.16)', dark: 'rgba(227, 179, 65, 0.16)' },
}

export const rheplicantOverrides: ThemeTokenOverrides = Object.fromEntries(
  Object.entries(TOKENS).map(([name, pair]) => [name, { light: pair.light, dark: pair.dark }]),
)

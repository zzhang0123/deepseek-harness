/**
 * Browser plugin for the posterior + chains panels. Injects into the
 * `console.panel` slot declared by ui-console — the separate-viz-plugin
 * contract: this package reads nothing but the log, and does not re-run
 * compute. Two registrations, one plugin: posterior first (per-latent
 * marginals + the corner plot), chains second (raw per-latent trace/band
 * charts) — the second `inject` call runs after the first, so chains renders
 * after posterior in the `console.panel` list.
 * @module @rheplicant/dsh-rheplicant-ui-posterior/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-rheplicant-ui-console/client'
import { ChainsPanel } from './ChainsPanel.tsx'
import { PosteriorPanel } from './PosteriorPanel.tsx'

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('console.panel', () => ctx.slots.register({
    name: 'console.panel',
    id: 'posterior',
    label: () => 'Posterior',
  }, PosteriorPanel))
  ctx.slots.inject('console.panel', () => ctx.slots.register({
    name: 'console.panel',
    id: 'chains',
    label: () => 'Chains',
  }, ChainsPanel))
}

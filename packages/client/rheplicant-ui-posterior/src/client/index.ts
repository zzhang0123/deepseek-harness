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
// Type-only: loads the SlotMap entry for `task.panel`, the workbench's grid.
import type {} from '@deepseek-ai/dsh-client-rheplicant-ui-project/client'

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
  // The SAME occupants, in the workbench's own grid. Two registrations rather
  // than one because a child key may be declared exactly once and only its
  // declarer can render it (`docs/project-model.md` §11.3), so the two seats
  // are two slots. The component is identical: a panel is driven by owner
  // props, so it cannot tell which seat it is in.
  ctx.slots.inject('task.panel', () => ctx.slots.register({
    name: 'task.panel',
    id: 'posterior',
    label: () => 'Posterior',
  }, PosteriorPanel))
  ctx.slots.inject('task.panel', () => ctx.slots.register({
    name: 'task.panel',
    id: 'chains',
    label: () => 'Chains',
  }, ChainsPanel))
}

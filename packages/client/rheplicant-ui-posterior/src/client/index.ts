/**
 * Browser plugin for the posterior + chains panels. Injects into the
 * `task.panel` slot declared by ui-project — the separate-viz-plugin
 * contract: this package reads nothing but the project's own selection, and
 * does not re-run compute. Two registrations, one plugin: posterior first
 * (per-latent marginals + the corner plot), chains second (raw per-latent
 * trace/band charts) — the second `inject` call runs after the first, so
 * chains renders after posterior in the grid.
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
  // The workbench's grid is the ONLY seat now (`docs/project-model.md` §20.4).
  // There used to be a second registration into ui-console's `console.panel`,
  // and the pair was the duplication §20 set out to end: two seats meant every
  // future panel needed two registrations, and Model, Exits and the document
  // diff already existed on one side only.
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

/**
 * Browser plugin for the posterior + chains panels. Injects into the
 * `task.panel` slot declared by ui-project — the separate-viz-plugin
 * contract: this package reads nothing but the project's own selection, and
 * does not re-run compute. Three registrations, one plugin: posterior
 * (per-latent marginals + the corner plot), chains (raw per-latent trace/band
 * charts), reconstruction (the quantity the posterior implies, as a
 * waterfall). Each has its OWN `inject` call and they render in that order.
 * @module @rheplicant/dsh-rheplicant-ui-posterior/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-rheplicant-ui-loop/client'
import { ChainsPanel } from './ChainsPanel.tsx'
import { PosteriorPanel } from './PosteriorPanel.tsx'
import { ReconstructionPanel } from './ReconstructionPanel.tsx'
// Type-only: loads the SlotMap entry for `task.panel`, the workbench's grid.
import type {} from '@deepseek-ai/dsh-client-rheplicant-ui-project/client'

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  // The workbench's grid is the ONLY seat now (`docs/project-model.md` §20.4).
  // There used to be a second registration into ui-loop's `console.panel`,
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
  // A THIRD registration, in its OWN `inject` call rather than nested inside
  // either of the two above — `ctx.slots.inject` WAITS for its key, so a chain
  // is only as available as its least available link, and nesting is what took
  // all four brand registrations down at once. `ui-brand/tests/
  // brand-chain.client.spec.tsx` holds the rule.
  ctx.slots.inject('task.panel', () => ctx.slots.register({
    name: 'task.panel',
    id: 'reconstruction',
    label: () => 'Reconstruction',
  }, ReconstructionPanel))
}

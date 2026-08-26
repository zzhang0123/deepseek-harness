/**
 * Browser plugin for the identifiability panel. Injects into the `task.panel`
 * slot declared by ui-project — the separate-viz-plugin contract: this package
 * reads nothing but the project's own selection, and does not re-run compute.
 * @module @rheplicant/dsh-rheplicant-ui-identifiability/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-rheplicant-ui-loop/client'
import { IdentifiabilityPanel } from './IdentifiabilityPanel.tsx'
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
    id: 'identifiability',
    label: () => 'Identifiability',
  }, IdentifiabilityPanel))
}

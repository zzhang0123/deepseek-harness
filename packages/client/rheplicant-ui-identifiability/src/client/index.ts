/**
 * Browser plugin for the identifiability panel. Injects into the `console.panel`
 * slot declared by ui-console — the separate-viz-plugin contract: this package
 * reads nothing but the log, and does not re-run compute.
 * @module @rheplicant/dsh-rheplicant-ui-identifiability/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-rheplicant-ui-console/client'
import { IdentifiabilityPanel } from './IdentifiabilityPanel.tsx'
// Type-only: loads the SlotMap entry for `task.panel`, the workbench's grid.
import type {} from '@deepseek-ai/dsh-client-rheplicant-ui-project/client'

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('console.panel', () => ctx.slots.register({
    name: 'console.panel',
    id: 'identifiability',
    label: () => 'Identifiability',
  }, IdentifiabilityPanel))
  // The SAME occupants, in the workbench's own grid. Two registrations rather
  // than one because a child key may be declared exactly once and only its
  // declarer can render it (`docs/project-model.md` §11.3), so the two seats
  // are two slots. The component is identical: a panel is driven by owner
  // props, so it cannot tell which seat it is in.
  ctx.slots.inject('task.panel', () => ctx.slots.register({
    name: 'task.panel',
    id: 'identifiability',
    label: () => 'Identifiability',
  }, IdentifiabilityPanel))
}

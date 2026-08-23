/**
 * Browser plugin for the durable rheplicant analysis-run Conversation Node.
 * Registers the Definition, its keyed `conversation.chat.node` renderer, and
 * a second occupant of ui-project's `task.panel` grid — `signal-path` —
 * mirroring ui-posterior's two-registrations-one-plugin pattern.
 * @module @rheplicant/dsh-rheplicant-ui-analysis/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: loads the SlotMap entry for `task.panel`, the workbench's grid.
import type {} from '@deepseek-ai/dsh-client-rheplicant-ui-project/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-rheplicant-ui-console/client'
import { AnalysisRunPanel } from './AnalysisRunPanel.tsx'
import { analysisRunDefinition } from './analysis-definition.ts'
import { setProjectSurface } from './project-bridge.ts'
import { SignalPathPanel } from './SignalPathPanel.tsx'

export {
  canOpenInProject, openInProject, setProjectSurface,
} from './project-bridge.ts'
export type {
  ProjectSurface, ResultAddress, SelectionPatch, SelectionSource, WorkbenchSource,
} from './project-bridge.ts'

/** Required services for the Definition, the keyed renderer, and the task.panel registration. */
export const inject = ['conversationEvents', 'slots']

/** Register the rheplicant-analysis Definition, its keyed renderer, and the signal-path workbench panel. */
export function apply(ctx: ClientContext): void {
  // The one edge from a result to the project surface (§20.3). A thunk, not a
  // value: `ctx.get` here would answer undefined whenever ui-project mounts
  // later in the composition, and mount order is a profile's business.
  setProjectSurface(() => ({
    selection: ctx.get('rheplicantSelection'),
    workbench: ctx.get('rheplicantWorkbench'),
  }))
  ctx.conversationEvents.register(analysisRunDefinition)
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'rheplicant-analysis',
    locale: 'conversation',
  }, AnalysisRunPanel))
  // The SAME occupants, in the workbench's own grid. Two registrations rather
  // than one because a child key may be declared exactly once and only its
  // declarer can render it (`docs/project-model.md` §11.3), so the two seats
  // are two slots. The component is identical: a panel is driven by owner
  // props, so it cannot tell which seat it is in.
  ctx.slots.inject('task.panel', () => ctx.slots.register({
    name: 'task.panel',
    id: 'signal-path',
    label: () => 'Signal path',
  }, SignalPathPanel))
}

/**
 * Browser plugin for the durable rheplicant analysis-run Conversation Node.
 * Registers the Definition and its keyed `conversation.chat.node` renderer.
 *
 * **It used to register a `task.panel` occupant too — `signal-path` — and
 * `docs/project-model.md` §28.1 removed it.** The workbench's Model section
 * already drew the same canonical graph, so one page carried two copies of one
 * diagram, in two different fixed themes, with neither saying which it was.
 * The comparison the panel was accidentally providing is now stated there, as
 * a declared/as-run switch over one renderer. The SEAT is gone rather than
 * merely unrendered (§20.4's precedent); `SignalPath.tsx` stays, because the
 * chat result node still draws this conversation's own run — which is a
 * different scope, not a second copy.
 * @module @rheplicant/dsh-rheplicant-ui-analysis/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-rheplicant-ui-loop/client'
import { AnalysisRunPanel } from './AnalysisRunPanel.tsx'
import { analysisRunDefinition } from './analysis-definition.ts'
import { setProjectSurface } from './project-bridge.ts'

export {
  canOpenInProject, openInProject, setProjectSurface,
} from './project-bridge.ts'
export type {
  ProjectSurface, ResultAddress, SelectionPatch, SelectionSource, WorkbenchSource,
} from './project-bridge.ts'

/** Required services for the Definition and its keyed renderer. */
export const inject = ['conversationEvents', 'slots']

/** Register the rheplicant-analysis Definition and its keyed chat-node renderer. */
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
}

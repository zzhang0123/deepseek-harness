/**
 * Browser plugin for this conversation's own view of the project: a
 * session-header control holding the project header and the activity rail,
 * plus the `rheplicant-loop` conversation-view target both read, plus the
 * `gates` occupant of the workbench's grid.
 *
 * **This package has now lost both of the seats it was named for.** It used to
 * DECLARE `console.panel`, a child grid every viz plugin injected into, and
 * §20.4 removed it: the same occupants were registered twice — here and in
 * ui-project's `task.panel` — and the panels belong to the project, not to
 * whichever conversation happens to be open. Then §23 removed the "Console"
 * `conversation.view` tab itself, because what §20.4 left behind was a whole
 * tab holding a header and one rail, and you had to leave the conversation to
 * read what the conversation had done. Both declarations are gone rather than
 * left in place and unrendered, so a new panel has one seat to choose and no
 * way to end up in the wrong one.
 *
 * The package NAME still says console, and the word is retiring
 * (`docs/surface-model.md` §9.5). Renaming it moves a bundle id, a module-table
 * row and every mirror — the same trade the Workbench rename declined for
 * identifiers — so it waits for a commit that is about that and nothing else.
 * @module @rheplicant/dsh-rheplicant-ui-console/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: loads the SlotMap entry for `task.panel`, the workbench's grid.
import type {} from '@deepseek-ai/dsh-client-rheplicant-ui-project/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { SessionActivity } from './SessionActivity.tsx'
import { GatesPanel } from './GatesPanel.tsx'
import { setSelectionSource } from './selection-bridge.ts'
import { registerLoopDefinitions } from './loop-definitions.ts'
import { registerLoopConversationView } from './loop-snapshot-builder.ts'

// Re-exported so the `rheplicant-loop` ConversationViewSnapshotMap
// augmentation (declared in `loop-contract.ts`) is reachable from a
// consumer's `.d.ts` import graph through this package's PUBLIC type
// surface. A cross-package reader (ui-analysis's SignalPathPanel) that only
// imports this package's compiled declarations would otherwise never pull in
// the file that declares the merge — `registerLoop*`'s own signatures carry
// no Loop types, so without this export the augmentation is invisible
// outside this package under project-reference (`tsc -b`) builds, even
// though our own flat generated check programs (which path-map every
// workspace source file into one program) do not catch the gap.
export type {
  LoopContribution, LoopConversationViewNode, LoopGatesEntry, LoopRunEntry, LoopSnapshot, LoopValidateEntry,
} from './loop-contract.ts'
export { loopViewDefinition } from './loop-snapshot-builder.ts'
// The sole-task rule, so a panel outside this package applies the same one:
// a log fallback is valid only when the log is unambiguous.
export { soleTask, type LoopTask } from './loop-tasks.ts'
export {
  chooseExecution, proposeExecution, resetLocalSelection, setSelectionSource, useProjectSelection,
} from './selection-bridge.ts'
export type { ProjectSelection, SelectionPatch, SelectionSource } from './selection-bridge.ts'

export const inject = ['slots', 'conversationEvents', 'conversationViews']

export function apply(ctx: ClientContext): void {
  // Where the PROJECT's selection lives (`docs/project-model.md` §11.2). A
  // thunk, not a value: `ctx.get` here would answer undefined whenever
  // ui-project mounts later in the composition, and mount order is a profile's
  // business. Resolved on first use instead; absent, the console keeps a local
  // selection of its own.
  setSelectionSource(() => ctx.get('rheplicantSelection'))
  registerLoopDefinitions(ctx)
  registerLoopConversationView(ctx)
  // A session-header action, not a view tab (§23). `scope: 'session'` is the
  // requirement, not the preference: every piece below reads the conversation
  // snapshot, and the frame-wide `shell.overlay` the design first sketched is
  // root-scoped and never receives `useSession`. `kind: 'list'` means this is
  // added beside dsh's own header actions rather than shadowing any of them.
  // Ordered after ui-jobs' (20) so a rheplicant control never displaces a
  // shipped one.
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'rheplicant-session-activity',
    order: 30,
    label: () => 'In this conversation',
  }, SessionActivity))
  // Gates renders in the WORKBENCH's grid, the only seat there is.
  ctx.slots.inject('task.panel', () => ctx.slots.register({
    name: 'task.panel',
    id: 'gates',
    label: () => 'Gates',
  }, GatesPanel))
}

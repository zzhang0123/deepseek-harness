/**
 * Browser plugin for the rheplicant console. Registers a "Console"
 * conversation.view tab and DECLARES a child slot `console.panel` (a list grid)
 * that other plugins — posterior, spectrum, … — inject into. This is the
 * self-extensible slot mechanism: no DSH change, the slot is claimed here.
 * Also registers the `rheplicant-loop` conversation-view target (the loop
 * projection LoopRail and GatesPanel read) and its own `gates` console.panel
 * occupant — registered here, ahead of every dependent viz package's own
 * `apply()`, so Gates renders first in the panel list without needing an
 * explicit `order`.
 * @module @rheplicant/dsh-rheplicant-ui-console/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ConsoleView } from './ConsoleView.tsx'
import { ConsoleNavigation } from './navigation-service.ts'
import { GatesPanel } from './GatesPanel.tsx'
import { createConsoleLayoutStore } from './layout-store.ts'
import { registerLoopDefinitions } from './loop-definitions.ts'
import { registerLoopConversationView } from './loop-snapshot-builder.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'console.panel': { kind: 'list'; scope: 'session' }
  }
}

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
export { ConsoleNavigation } from './navigation-service.ts'

export const inject = ['slots', 'conversationEvents', 'conversationViews']

export function apply(ctx: ClientContext): void {
  // The console's cross-plugin face: "show THIS execution in THAT session".
  // Registered first so a chooser that mounts alongside can already reach it.
  ctx.plugin(ConsoleNavigation)
  registerLoopDefinitions(ctx)
  registerLoopConversationView(ctx)
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'console',
    order: 5,
    label: () => 'Console',
    store: createConsoleLayoutStore,
    children: {
      'console.panel': { kind: 'list', scope: 'session' },
    },
  }, ConsoleView))
  ctx.slots.inject('console.panel', () => ctx.slots.register({
    name: 'console.panel',
    id: 'gates',
    label: () => 'Gates',
  }, GatesPanel))
}

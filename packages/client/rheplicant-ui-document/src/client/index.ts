/**
 * Browser plugin for the config-document views: the `conversation.view`
 * Document tab (exact document + generated grammar reference) and a
 * `console.panel` occupant (exact document only — the grammar reference
 * stays tab-only). Also registers this package's own `rheplicant-document`
 * conversation-view projection: a private fold of the three durable
 * rheplicant events down to whichever most recently carried a document (§5
 * of docs/architecture.md: a panel reads the durable session log, it never
 * calls compute) — independent of any other package's own projection of the
 * same events, so this package's read path stays self-contained.
 * @module @rheplicant/dsh-rheplicant-ui-document/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-rheplicant-ui-console/client'
import { registerDocumentDefinitions } from './document-definitions.ts'
import { registerDocumentConversationView } from './document-snapshot-builder.ts'
import { DocumentPanel } from './DocumentPanel.tsx'
import { DocumentView } from './DocumentView.tsx'
// Type-only: loads the SlotMap entry for `task.panel`, the workbench's grid.
import type {} from '@deepseek-ai/dsh-client-rheplicant-ui-project/client'

export const inject = ['slots', 'conversationEvents', 'conversationViews']

export function apply(ctx: ClientContext): void {
  // Deliberately NOT registered into `task.panel`. This panel folds the
  // SESSION's durable events down to the last document that appeared in the
  // conversation — a genuinely session-facing fact, and its empty state says
  // so ("no document in this session yet"). The workbench shows the task file
  // itself, read from the project, which is a different and better answer
  // there. §11.4 records that this view's data source is P7c's business.
  registerDocumentDefinitions(ctx)
  registerDocumentConversationView(ctx)
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'document',
    order: 20,
    label: () => 'Document',
  }, DocumentView))
  // High order (40): another agent is adding gates/signal-path console
  // panels; Document sits after them rather than racing an explicit order.
  ctx.slots.inject('console.panel', () => ctx.slots.register({
    name: 'console.panel',
    id: 'document',
    order: 40,
    label: () => 'Document',
  }, DocumentPanel))
}

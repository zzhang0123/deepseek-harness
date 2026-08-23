/**
 * Browser plugin for the config-document view: the `conversation.view`
 * Document tab (exact document + generated grammar reference). Also
 * registers this package's own `rheplicant-document`
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
import { DocumentView } from './DocumentView.tsx'

export const inject = ['slots', 'conversationEvents', 'conversationViews']

export function apply(ctx: ClientContext): void {
  // This package had a `console.panel` occupant and no `task.panel` twin: its
  // panel folded the SESSION's durable events down to the last document that
  // appeared in the conversation, which is a genuinely session-facing fact and
  // has no workbench counterpart (the workbench shows the task FILE, read from
  // the project). §20.4 removed the console's grid, so the panel went with it
  // — and nothing was lost, because the tab below is that same fold with the
  // grammar reference beside it.
  registerDocumentDefinitions(ctx)
  registerDocumentConversationView(ctx)
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'document',
    order: 20,
    label: () => 'Document',
  }, DocumentView))
}

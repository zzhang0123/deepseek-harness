/**
 * Business Definitions folding the three durable rheplicant events into the
 * `rheplicant-document` conversation-view target. One Definition per event
 * type, each a one-shot fact (matches ui-console's own
 * `loop-definitions.ts` shape for the identical three events: `id =
 * String(event.seq)`, always `role: 'start'`, `update` a no-op) — every
 * occurrence is its own Context, never merged with an earlier one. Reusing
 * a constant id per event type (the way `rheplicant-analysis` folds
 * `rheplicant/run` into a single 'chat' node) is NOT safe here: the
 * assembler throws if a Context already holding a start Match receives a
 * second one, so a session's second validate/gates/run call would crash a
 * Definition that tried to keep re-starting the same id. The one-shot-id
 * shape sidesteps that — the fold to "the single latest fact" happens in
 * the separate builder (`document-snapshot-builder.ts`).
 * @module @rheplicant/dsh-rheplicant-ui-document/client/document-definitions
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ConversationNodeContext, ConversationNodeDefinition } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type { DocumentConversationViewNode, DocumentFact } from './document-contract.ts'

function factNode(context: ConversationNodeContext<DocumentFact>, data: DocumentFact): DocumentConversationViewNode {
  return {
    key: context.key,
    kind: context.kind,
    id: context.id,
    target: 'rheplicant-document',
    anchorSeq: data.seq,
    location: context.start?.location ?? { kind: 'unresolved' },
    data,
  }
}

const documentValidateDefinition: ConversationNodeDefinition<DocumentFact> = {
  kind: 'rheplicant-document-validate',
  target: 'rheplicant-document',
  match: (event: SessionEvent) => event.type === 'rheplicant/validate' ? { id: String(event.seq), role: 'start' } : null,
  start: (_context, match) => {
    if (match.event.type !== 'rheplicant/validate') {
      throw new Error('rheplicant-document-validate start requires rheplicant/validate')
    }
    const { document, transport } = match.event.data
    return { kind: 'validate', seq: match.event.seq, document, transport }
  },
  update: context => context.state,
  buildViewNode: context => context.state === undefined ? null : factNode(context, context.state),
}

const documentGatesDefinition: ConversationNodeDefinition<DocumentFact> = {
  kind: 'rheplicant-document-gates',
  target: 'rheplicant-document',
  match: (event: SessionEvent) => event.type === 'rheplicant/gates' ? { id: String(event.seq), role: 'start' } : null,
  start: (_context, match) => {
    if (match.event.type !== 'rheplicant/gates') {
      throw new Error('rheplicant-document-gates start requires rheplicant/gates')
    }
    const { document, transport } = match.event.data
    return { kind: 'gates', seq: match.event.seq, document, transport }
  },
  update: context => context.state,
  buildViewNode: context => context.state === undefined ? null : factNode(context, context.state),
}

const documentRunDefinition: ConversationNodeDefinition<DocumentFact> = {
  kind: 'rheplicant-document-run',
  target: 'rheplicant-document',
  match: (event: SessionEvent) => event.type === 'rheplicant/run' ? { id: String(event.seq), role: 'start' } : null,
  start: (_context, match) => {
    if (match.event.type !== 'rheplicant/run') {
      throw new Error('rheplicant-document-run start requires rheplicant/run')
    }
    const { document, transport } = match.event.data
    return { kind: 'run', seq: match.event.seq, document, transport }
  },
  update: context => context.state,
  buildViewNode: context => context.state === undefined ? null : factNode(context, context.state),
}

/**
 * Register the three document-fact Definitions.
 * @param ctx - Plugin context receiving the Definitions.
 */
export function registerDocumentDefinitions(ctx: Context): void {
  ctx.conversationEvents.register(documentValidateDefinition)
  ctx.conversationEvents.register(documentGatesDefinition)
  ctx.conversationEvents.register(documentRunDefinition)
}

/**
 * Per-session incremental builder for the `rheplicant-document`
 * conversation-view target. Simpler than ui-console's own
 * `loop-snapshot-builder.ts` (the reference for this pattern): that builder
 * keeps the latest fact of each of three kinds side by side (the loop rail
 * needs all three at once); this one only ever needs the single most recent
 * fact across all three kinds, so it tracks one running maximum by
 * `anchorSeq` instead of a sorted contribution ledger.
 * @module @rheplicant/dsh-rheplicant-ui-document/client/document-snapshot-builder
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ConversationViewBuilder, ConversationViewDefinition } from '@deepseek-ai/dsh-client-runtime/client'
import type { DocumentConversationViewNode, DocumentSnapshot } from './document-contract.ts'

/** Stable empty target used until a Session has recorded any document fact. */
export const EMPTY_DOCUMENT_SNAPSHOT: DocumentSnapshot = {}

/** Per-Session incremental builder keeping only the single most recent document fact. */
export class DocumentSnapshotBuilder implements ConversationViewBuilder<DocumentConversationViewNode, DocumentSnapshot> {
  private readonly nodes = new Map<string, DocumentConversationViewNode>()
  private latest: DocumentConversationViewNode | undefined
  readonly empty = EMPTY_DOCUMENT_SNAPSHOT

  replace(input: { readonly nodes: readonly DocumentConversationViewNode[] }): DocumentSnapshot {
    this.nodes.clear()
    this.latest = undefined
    for (const node of input.nodes) this.upsert(node)
    return this.snapshot()
  }

  apply(input: { readonly upserts: readonly DocumentConversationViewNode[] }): DocumentSnapshot {
    for (const node of input.upserts) this.upsert(node)
    return this.snapshot()
  }

  private upsert(node: DocumentConversationViewNode): void {
    this.nodes.set(node.key, node)
    if (this.latest === undefined || node.anchorSeq > this.latest.anchorSeq) this.latest = node
  }

  private snapshot(): DocumentSnapshot {
    return this.latest === undefined ? this.empty : { latest: this.latest.data }
  }
}

/** The document target factory: one fresh builder per Session. */
export const documentViewDefinition: ConversationViewDefinition<DocumentConversationViewNode, DocumentSnapshot> = {
  target: 'rheplicant-document',
  create: () => new DocumentSnapshotBuilder(),
}

/**
 * Register the `rheplicant-document` conversation-view target builder.
 * @param ctx - Plugin context receiving the view Definition.
 */
export function registerDocumentConversationView(ctx: Context): void {
  ctx.conversationViews.register(documentViewDefinition)
}

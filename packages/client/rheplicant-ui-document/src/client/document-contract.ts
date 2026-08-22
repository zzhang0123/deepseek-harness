/**
 * Wire contract for the `rheplicant-document` conversation-view target: a
 * private per-session projection that folds the three durable rheplicant
 * events (`rheplicant/validate`, `rheplicant/gates`, `rheplicant/run` — see
 * `packages/rheplicant/rheplicant/src/types.ts`, all three payloads carry a
 * `document`) down to whichever most recently carried a config document.
 * Independent of the chat transcript, and independent of any other
 * package's own projection of the same events (§5 of docs/architecture.md:
 * a panel reads the durable session log and renders, it never calls
 * compute) — this package owns its read path end to end so it stays
 * decoupled from ui-console's own `rheplicant-loop` projection, which folds
 * the identical three events for a different purpose (the LoopRail/Gates
 * five-stage read) and is owned by a package under separate, concurrent
 * revision.
 * @module @rheplicant/dsh-rheplicant-ui-document/client/document-contract
 */
import type { ConversationLocation, ConversationViewNode } from '@deepseek-ai/dsh-client-runtime/client'
import type { ComputeDocument, Transport } from '@rheplicant/dsh-rheplicant'

/** Which durable event most recently carried the document. */
export type DocumentSourceKind = 'validate' | 'gates' | 'run'

/** One matched validate/gates/run event, reduced to what the Document views need. */
export interface DocumentFact {
  readonly kind: DocumentSourceKind
  readonly seq: number
  readonly document: ComputeDocument
  readonly transport: Transport
}

/** Target envelope consumed by the document snapshot builder. */
export interface DocumentConversationViewNode extends ConversationViewNode {
  readonly target: 'rheplicant-document'
  readonly anchorSeq: number
  readonly location: ConversationLocation
  readonly data: DocumentFact
}

/** The session's single most recent document fact; absent when none has landed yet. */
export interface DocumentSnapshot {
  readonly latest?: DocumentFact
}

declare module '@deepseek-ai/dsh-client-runtime/client' {
  interface ConversationViewSnapshotMap {
    /** Latest config-document fact: whichever of validate/gates/run most recently carried one. */
    'rheplicant-document': DocumentSnapshot
  }
}

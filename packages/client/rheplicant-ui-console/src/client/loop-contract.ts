/**
 * Wire contract for the `rheplicant-loop` conversation-view target: the
 * per-session projection that folds the three durable rheplicant events
 * (`rheplicant/validate`, `rheplicant/gates`, `rheplicant/run`) into one loop
 * state, independent of the chat transcript. Mirrors ui-trajectory's own
 * `trajectory-contract.ts` shape (the only reference for this pattern):
 * a `LoopContribution` per matched event, wrapped in the Engine-owned
 * `LoopConversationViewNode` envelope, folded by the builder into the final
 * `LoopSnapshot` the LoopRail and GatesPanel read.
 * @module @rheplicant/dsh-rheplicant-ui-console/client/loop-contract
 */

import type { ConversationLocation, ConversationViewNode } from '@deepseek-ai/dsh-client-runtime/client'
import type { ComputeDocument, GatesReport, RunOutcome, Transport, ValidationReport } from '@rheplicant/dsh-rheplicant'

/** One matched `rheplicant/validate` event, independently assembled. */
export interface LoopValidateContribution {
  readonly kind: 'validate'
  readonly seq: number
  readonly document: ComputeDocument
  readonly transport: Transport
  readonly report: ValidationReport
}

/** One matched `rheplicant/gates` event, independently assembled. */
export interface LoopGatesContribution {
  readonly kind: 'gates'
  readonly seq: number
  readonly document: ComputeDocument
  readonly transport: Transport
  readonly report: GatesReport
}

/** One matched `rheplicant/run` event, independently assembled. */
export interface LoopRunContribution {
  readonly kind: 'run'
  readonly seq: number
  readonly document: ComputeDocument
  readonly transport: Transport
  readonly outcome: RunOutcome
}

/** One independently assembled contribution to the loop projection. */
export type LoopContribution = LoopValidateContribution | LoopGatesContribution | LoopRunContribution

/** Target envelope consumed by the loop snapshot builder. */
export interface LoopConversationViewNode extends ConversationViewNode {
  readonly target: 'rheplicant-loop'
  readonly anchorSeq: number
  readonly location: ConversationLocation
  readonly data: LoopContribution
}

/** The latest `rheplicant/validate` fact folded into the loop snapshot. */
export interface LoopValidateEntry {
  readonly report: ValidationReport
  readonly document: ComputeDocument
  readonly transport: Transport
  readonly seq: number
}

/** The latest `rheplicant/gates` fact folded into the loop snapshot. */
export interface LoopGatesEntry {
  readonly report: GatesReport
  readonly document: ComputeDocument
  readonly transport: Transport
  readonly seq: number
}

/** The latest `rheplicant/run` fact folded into the loop snapshot. */
export interface LoopRunEntry {
  readonly outcome: RunOutcome
  readonly document: ComputeDocument
  readonly transport: Transport
  readonly seq: number
}

/**
 * One session's workflow-loop state: the latest fact of each of the three
 * kinds. Later events of a type replace earlier ones — the loop iterates —
 * so this is never a list, only ever "what's current".
 */
export interface LoopSnapshot {
  readonly validate?: LoopValidateEntry
  readonly gates?: LoopGatesEntry
  readonly run?: LoopRunEntry
  /** The greatest `seq` across every fact folded in, or -1 when none has landed yet. */
  readonly latestSeq: number
}

declare module '@deepseek-ai/dsh-client-runtime/client' {
  interface ConversationViewSnapshotMap {
    /** The workflow-loop projection: latest validate/gates/run facts, independent of chat. */
    'rheplicant-loop': LoopSnapshot
  }
}

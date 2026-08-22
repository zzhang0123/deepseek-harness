/**
 * Per-session incremental builder for the `rheplicant-loop` conversation-view
 * target. Structure copied from ui-trajectory's `trajectory-snapshot-builder.ts`
 * (the only reference for this pattern): a `Map<key, Node>` ledger, a sorted
 * `contributions` cache rebuilt only on structural change (a new key, or an
 * existing key's `anchorSeq` moving), and a `snapshot()` fold that walks the
 * sorted contributions once. Unlike Trajectory's ledger (which keeps every
 * contribution as a list entry), the loop fold keeps only the LATEST fact of
 * each kind — later events of a type replace earlier ones, because the loop
 * iterates on one document rather than accumulating a transcript.
 * @module @rheplicant/dsh-rheplicant-ui-console/client/loop-snapshot-builder
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ConversationViewBuilder, ConversationViewDefinition } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  LoopConversationViewNode, LoopExecutionRef, LoopGatesEntry, LoopRunContribution, LoopRunEntry,
  LoopSnapshot, LoopValidateEntry,
} from './loop-contract.ts'

/**
 * One run contribution projected to what the header and picker need: scalars
 * already on the event, and nothing else.
 */
function executionRef(data: LoopRunContribution): LoopExecutionRef {
  return {
    executionId: data.executionId as string,
    ...(data.outcome.resultsPath === undefined ? {} : { resultsPath: data.outcome.resultsPath }),
    ...(data.taskPath === undefined ? {} : { taskPath: data.taskPath }),
    transport: data.transport,
    // One failed run makes the execution failed: a card that says "ok" while a
    // run inside it errored is the exact wrongness this console exists to kill.
    status: data.outcome.runs.some(entry => entry.status === 'failed') ? 'failed' : 'ok',
    seq: data.seq,
  }
}

/** Stable empty target used until a Session has assembled any loop records. */
export const EMPTY_LOOP_SNAPSHOT: LoopSnapshot = { executions: [], latestSeq: -1 }

/** Per-Session incremental builder folding validate/gates/run contributions into one loop state. */
export class LoopSnapshotBuilder implements ConversationViewBuilder<LoopConversationViewNode, LoopSnapshot> {
  private readonly nodes = new Map<string, LoopConversationViewNode>()
  private readonly positions = new Map<string, number>()
  private contributions: LoopConversationViewNode[] = []
  readonly empty = EMPTY_LOOP_SNAPSHOT

  replace(input: { readonly nodes: readonly LoopConversationViewNode[] }): LoopSnapshot {
    this.nodes.clear()
    for (const node of input.nodes) this.nodes.set(node.key, node)
    this.rebuildContributions()
    return this.snapshot()
  }

  apply(input: { readonly upserts: readonly LoopConversationViewNode[] }): LoopSnapshot {
    let structural = false
    for (const node of input.upserts) {
      const previous = this.nodes.get(node.key)
      this.nodes.set(node.key, node)
      if (previous === undefined || previous.anchorSeq !== node.anchorSeq) {
        structural = true
        continue
      }
      const position = this.positions.get(node.key)
      if (position === undefined) structural = true
      else this.contributions[position] = node
    }
    if (structural) this.rebuildContributions()
    return this.snapshot()
  }

  /**
   * Fold the sorted contributions into the final loop state: later facts of
   * one kind overwrite earlier ones as the walk proceeds in ascending
   * `anchorSeq` order, so the result always holds the latest of each kind.
   */
  private snapshot(): LoopSnapshot {
    let validate: LoopValidateEntry | undefined
    let gates: LoopGatesEntry | undefined
    let run: LoopRunEntry | undefined
    const executions: LoopExecutionRef[] = []
    let latestSeq = -1
    for (const contribution of this.contributions) {
      const data = contribution.data
      latestSeq = data.seq
      if (data.kind === 'validate') {
        validate = { report: data.report, document: data.document, transport: data.transport, seq: data.seq }
      } else if (data.kind === 'gates') {
        gates = { report: data.report, document: data.document, transport: data.transport, seq: data.seq }
      } else {
        run = { outcome: data.outcome, document: data.document, transport: data.transport, seq: data.seq }
        // The walk is ascending, so pushing here yields oldest-first with no
        // second sort. An event without an id predates execution identity and
        // has nothing to select BY, so it contributes to `run` but not here.
        if (data.executionId !== undefined) executions.push(executionRef(data))
      }
    }
    if (validate === undefined && gates === undefined && run === undefined) return this.empty
    return {
      ...(validate === undefined ? {} : { validate }),
      ...(gates === undefined ? {} : { gates }),
      ...(run === undefined ? {} : { run }),
      executions,
      latestSeq,
    }
  }

  private rebuildContributions(): void {
    this.contributions = [...this.nodes.values()]
      .sort((left, right) => left.anchorSeq - right.anchorSeq || left.key.localeCompare(right.key))
    this.positions.clear()
    for (const [index, contribution] of this.contributions.entries()) {
      this.positions.set(contribution.key, index)
    }
  }
}

/** The loop target factory: one fresh builder per Session. */
export const loopViewDefinition: ConversationViewDefinition<LoopConversationViewNode, LoopSnapshot> = {
  target: 'rheplicant-loop',
  create: () => new LoopSnapshotBuilder(),
}

/**
 * Register the `rheplicant-loop` conversation-view target builder.
 * @param ctx - Plugin context receiving the view Definition.
 */
export function registerLoopConversationView(ctx: Context): void {
  ctx.conversationViews.register(loopViewDefinition)
}

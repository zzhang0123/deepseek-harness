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
 * @module @rheplicant/dsh-rheplicant-ui-loop/client/loop-snapshot-builder
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ConversationViewBuilder, ConversationViewDefinition } from '@deepseek-ai/dsh-client-runtime/client'
import { groupByTask } from './loop-tasks.ts'
import type { LoopConversationViewNode, LoopSnapshot } from './loop-contract.ts'

/**
 * One run contribution projected to what the header and picker need: scalars
 * already on the event, and nothing else.
 */

/** Stable empty target used until a Session has assembled any loop records. */
export const EMPTY_LOOP_SNAPSHOT: LoopSnapshot = { tasks: [], executions: [], latestSeq: -1 }

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
   * Group the sorted contributions BY TASK.
   *
   * This used to fold to "the latest of each kind" across the whole
   * conversation, which fabricated one loop out of unrelated tasks — see
   * `loop-tasks.ts`. The grouping lives there so it can be tested without a
   * builder, and so this class keeps its one job: incremental caching.
   */
  private snapshot(): LoopSnapshot {
    const tasks = groupByTask(this.contributions.map(node => node.data))
    if (tasks.length === 0) return this.empty
    return {
      tasks,
      // Flattened across tasks, oldest first: the execution picker offers
      // everything this conversation produced, and each row already carries
      // its own `taskPath`.
      executions: tasks.flatMap(task => task.executions)
        .sort((left, right) => left.seq - right.seq),
      latestSeq: Math.max(...tasks.map(task => task.latestSeq)),
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

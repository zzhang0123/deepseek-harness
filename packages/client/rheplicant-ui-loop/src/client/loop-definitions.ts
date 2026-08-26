/**
 * Business Definitions folding the three durable rheplicant events into the
 * `rheplicant-loop` conversation-view target. One Definition per event type,
 * each a one-shot fact (matches `trajectory-message-definitions.ts`'s
 * `trajectoryInboxDefinition`/`trajectoryMessageDefinition` shape: `id =
 * String(event.seq)`, always `role: 'start'`, `update` a no-op) — every
 * occurrence is its own Context, never merged with an earlier one. The
 * builder (`loop-snapshot-builder.ts`) is what folds many one-shot facts down
 * to "the latest of each kind".
 * @module @rheplicant/dsh-rheplicant-ui-loop/client/loop-definitions
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ConversationNodeContext, ConversationNodeDefinition } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type {
  LoopContribution, LoopConversationViewNode, LoopGatesContribution, LoopRunContribution, LoopValidateContribution,
} from './loop-contract.ts'

/** Wrap one contribution in the Engine-owned target envelope (mirrors ui-trajectory's `trajectoryNode`). */
function loopNode(context: ConversationNodeContext<LoopContribution>, data: LoopContribution): LoopConversationViewNode {
  return {
    key: context.key,
    kind: context.kind,
    id: context.id,
    target: 'rheplicant-loop',
    anchorSeq: data.seq,
    location: context.start?.location ?? { kind: 'unresolved' },
    data,
  }
}

const loopValidateDefinition: ConversationNodeDefinition<LoopValidateContribution> = {
  kind: 'rheplicant-loop-validate',
  target: 'rheplicant-loop',
  match: (event: SessionEvent) => event.type === 'rheplicant/validate' ? { id: String(event.seq), role: 'start' } : null,
  start: (_context, match) => {
    if (match.event.type !== 'rheplicant/validate') {
      throw new Error('rheplicant-loop-validate start requires rheplicant/validate')
    }
    const { document, transport, report, taskPath } = match.event.data
    return {
      kind: 'validate',
      seq: match.event.seq,
      document,
      transport,
      report,
      // A loop belongs to a task (§19). `tool-validate` has emitted this since
      // P1; dropping it here filed every validate under "inline work", so one
      // conversation validating and then running ONE task drew TWO rails —
      // the same fabrication §19 removed, wearing the opposite costume.
      ...(typeof taskPath === 'string' ? { taskPath } : {}),
    }
  },
  update: context => context.state,
  buildViewNode: context => context.state === undefined ? null : loopNode(context, context.state),
}

const loopGatesDefinition: ConversationNodeDefinition<LoopGatesContribution> = {
  kind: 'rheplicant-loop-gates',
  target: 'rheplicant-loop',
  match: (event: SessionEvent) => event.type === 'rheplicant/gates' ? { id: String(event.seq), role: 'start' } : null,
  start: (_context, match) => {
    if (match.event.type !== 'rheplicant/gates') {
      throw new Error('rheplicant-loop-gates start requires rheplicant/gates')
    }
    const { document, transport, report, taskPath } = match.event.data
    return {
      kind: 'gates',
      seq: match.event.seq,
      document,
      transport,
      report,
      // See `loopValidateDefinition`: the same field, dropped the same way.
      ...(typeof taskPath === 'string' ? { taskPath } : {}),
    }
  },
  update: context => context.state,
  buildViewNode: context => context.state === undefined ? null : loopNode(context, context.state),
}

const loopRunDefinition: ConversationNodeDefinition<LoopRunContribution> = {
  kind: 'rheplicant-loop-run',
  target: 'rheplicant-loop',
  match: (event: SessionEvent) => event.type === 'rheplicant/run' ? { id: String(event.seq), role: 'start' } : null,
  start: (_context, match) => {
    if (match.event.type !== 'rheplicant/run') {
      throw new Error('rheplicant-loop-run start requires rheplicant/run')
    }
    const { document, transport, outcome, executionId, taskPath } = match.event.data
    return {
      kind: 'run',
      seq: match.event.seq,
      document,
      transport,
      outcome,
      // Optional on the wire: events written before execution identity landed
      // carry neither, and a run of an inline document never carries a path.
      ...(typeof executionId === 'string' ? { executionId } : {}),
      ...(typeof taskPath === 'string' ? { taskPath } : {}),
    }
  },
  update: context => context.state,
  buildViewNode: context => context.state === undefined ? null : loopNode(context, context.state),
}

/**
 * Register the three loop-fact Definitions.
 * @param ctx - Plugin context receiving the Definitions.
 */
export function registerLoopDefinitions(ctx: Context): void {
  ctx.conversationEvents.register(loopValidateDefinition)
  ctx.conversationEvents.register(loopGatesDefinition)
  ctx.conversationEvents.register(loopRunDefinition)
}

/**
 * The `rheplicant-analysis` Conversation Node: folds one durable `rheplicant/run`
 * event into a keyed Chat node carrying the run list, its statuses, and each
 * run's diagnostics (r_hat, identifiability rank, joint χ²) — projected here so
 * the renderer can surface them separately from the model's prose. The
 * definition owns identity, matching, and the durable state fold.
 * @module @rheplicant/dsh-rheplicant-ui-analysis/client
 */

import type {
  ChatConversationViewNode,
  ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type { GateFinding, RunDiagnostics, RunOutcome, SignalPathGraph } from '@rheplicant/dsh-rheplicant'

/** Final keyed Chat payload for one analysis run. */
export interface AnalysisRunChatData {
  readonly runs: readonly {
    readonly name: string
    readonly kind: string
    readonly status: 'ok' | 'failed'
    readonly diagnostics?: RunDiagnostics
    /** Passed through verbatim from the wire `RunEntry.chains` (see its key grammar; nulls = non-finite). */
    readonly chains?: Record<string, (number | null)[]>
    readonly spectrum?: (number | null)[][]
  }[]
  readonly tookMs?: number
  readonly graph?: SignalPathGraph
  readonly gates?: readonly GateFinding[]
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap {
    'rheplicant-analysis': AnalysisRunChatData
  }
}

interface AnalysisState {
  readonly outcome?: RunOutcome
}

/** Fold one durable `rheplicant/run` event into a keyed Chat node. */
export const analysisRunDefinition: ConversationNodeDefinition<AnalysisState> = {
  kind: 'rheplicant-analysis',
  target: 'chat',
  match: (event: SessionEvent): { id: string; role: 'start' | 'update' } | null => {
    if (event.type === 'rheplicant/run') return { id: 'run', role: 'start' }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'rheplicant/run') {
      throw new Error('rheplicant-analysis start requires rheplicant/run')
    }
    return { outcome: match.event.data.outcome }
  },
  update: (context, _match) => context.state,
  buildViewNode: (context): ChatConversationViewNode | null => {
    if (context.start === undefined || context.state === undefined) return null
    const outcome = context.state.outcome
    if (outcome === undefined) return null
    const data: AnalysisRunChatData = {
      runs: outcome.runs.map((run) => ({
        name: run.name,
        kind: run.kind,
        status: run.status,
        ...(run.diagnostics === undefined ? {} : { diagnostics: run.diagnostics }),
        ...(run.chains === undefined ? {} : { chains: run.chains }),
        ...(run.spectrum === undefined ? {} : { spectrum: run.spectrum }),
      })),
      ...(outcome.tookMs !== undefined ? { tookMs: outcome.tookMs } : {}),
      ...(outcome.graph === undefined ? {} : { graph: outcome.graph }),
      ...(outcome.gates === undefined ? {} : { gates: outcome.gates }),
    }
    return {
      key: context.key,
      kind: 'rheplicant-analysis',
      id: context.id,
      target: 'chat',
      anchorSeq: context.start.event.seq,
      location: context.start.location,
      visibility: 'visible',
      data,
    }
  },
}

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
import type { GateFinding, RunDiagnostics, RunOutcome, SignalPathGraph, Transport } from '@rheplicant/dsh-rheplicant'

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
    /**
     * Provenance, folded in from the owning `rheplicant/run` event rather
     * than the wire `RunEntry` (which carries none of this) — every run in
     * one event's `outcome.runs` shares the same `time`/`transport`/`seq`,
     * which is exactly the point: it is how two runs from DIFFERENT events
     * (e.g. a rerun with an identical seed producing a byte-identical
     * outcome) still read as distinct cards instead of one repeated. Kept
     * optional/additive so nothing that predates this field breaks.
     */
    readonly time?: number
    readonly transport?: Transport
    readonly seq?: number
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
  readonly transport?: Transport
}

/** Fold one durable `rheplicant/run` event into a keyed Chat node. */
export const analysisRunDefinition: ConversationNodeDefinition<AnalysisState> = {
  kind: 'rheplicant-analysis',
  target: 'chat',
  match: (event: SessionEvent): { id: string; role: 'start' | 'update' } | null => {
    // One node per run event, keyed by its sequence number. A constant id would
    // start the same Context twice and the assembler throws
    // ("received more than one start Match") the moment a session runs a second
    // analysis — which is the normal case, not an edge case.
    if (event.type === 'rheplicant/run') return { id: `run-${event.seq}`, role: 'start' }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'rheplicant/run') {
      throw new Error('rheplicant-analysis start requires rheplicant/run')
    }
    return { outcome: match.event.data.outcome, transport: match.event.data.transport }
  },
  update: (context, _match) => context.state,
  buildViewNode: (context): ChatConversationViewNode | null => {
    if (context.start === undefined || context.state === undefined) return null
    const outcome = context.state.outcome
    if (outcome === undefined) return null
    // Provenance for every run this node carries: all of them came from this
    // ONE `rheplicant/run` event, so they all share its time/transport/seq —
    // see `AnalysisRunChatData.runs[].time`'s doc comment for why that's the
    // point, not a limitation.
    const time = context.start.event.time
    const seq = context.start.event.seq
    const transport = context.state.transport
    const data: AnalysisRunChatData = {
      runs: outcome.runs.map((run) => ({
        name: run.name,
        kind: run.kind,
        status: run.status,
        ...(run.diagnostics === undefined ? {} : { diagnostics: run.diagnostics }),
        ...(run.chains === undefined ? {} : { chains: run.chains }),
        ...(run.spectrum === undefined ? {} : { spectrum: run.spectrum }),
        time,
        ...(transport === undefined ? {} : { transport }),
        seq,
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

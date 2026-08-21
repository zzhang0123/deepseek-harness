/**
 * The `rheplicant-analysis` Conversation Node: folds one durable `rheplicant/run`
 * event into a keyed Chat node carrying the run list, its statuses, and each
 * run's diagnostics. The local types below mirror the JSON projection of
 * `@rheplicant/dsh-rheplicant`'s RunOutcome (that package lives in a separate
 * repository); the wire is the same.
 * @module @deepseek-ai/dsh-client-rheplicant-ui-analysis/client
 */

import type {
  ChatConversationViewNode,
  ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'

/** Quality signals the agent must read; mirrored from the wire contract's RunDiagnostics. */
export interface RunDiagnostics {
  readonly converged?: boolean
  readonly rhat?: number
  readonly rank?: number
  readonly nullity?: number
  readonly chi2?: number | readonly number[]
  readonly n_eff?: number | Record<string, number>
  readonly divergences?: number
  readonly kappa?: number | readonly number[]
  readonly delta?: number
  readonly iterations?: number
  readonly weakest_identified?: unknown
  readonly singular_values?: number | readonly number[]
  readonly mcmc?: Record<string, unknown>
  readonly notes: readonly string[]
}

/** The lit/dim signal-path rendering for a document's `model:` section. */
export interface SignalPathGraph {
  readonly graph: string
  readonly lit: readonly string[]
  readonly skipped: readonly string[]
  readonly svg?: string
  readonly mermaid?: string
}

/** One post-flight gate verdict (linearity / identifiability / prior_sensitivity / …). */
export interface GateFinding {
  readonly check: string
  readonly severity: 'refuse' | 'warn' | 'report' | 'skip'
  readonly where: string
  readonly message: string
}

interface RunOutcome {
  readonly runs: readonly {
    readonly name: string
    readonly kind: string
    readonly status: 'ok' | 'failed'
    readonly diagnostics?: RunDiagnostics
    readonly chains?: Record<string, number[]>
    readonly spectrum?: number[][]
  }[]
  readonly tookMs?: number
  readonly graph?: SignalPathGraph
  readonly gates?: readonly GateFinding[]
}

interface RheplicantRunEventData {
  readonly document: Record<string, unknown>
  readonly outcome: RunOutcome
  readonly transport: string
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Records one executed analysis: the document, its transport, and its outcome.
     * @param data - the document, transport, and run outcome.
     */
    'rheplicant/run': RheplicantRunEventData
  }
}

export interface AnalysisRunChatData {
  readonly runs: readonly {
    readonly name: string
    readonly kind: string
    readonly status: 'ok' | 'failed'
    readonly diagnostics?: RunDiagnostics
    readonly chains?: Record<string, number[]>
    readonly spectrum?: number[][]
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
      runs: outcome.runs.map(run => ({
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

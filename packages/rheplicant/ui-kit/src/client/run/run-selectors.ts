/**
 * The shared fold from a conversation snapshot to `rheplicant-analysis` run
 * entries, replacing the copy-pasted `useSession(snapshot => …)` selector that
 * used to live in every panel. Takes `unknown` and validates structurally at
 * the boundary, rather than importing `ConversationSnapshot` or the wire
 * types from `@rheplicant/dsh-rheplicant` — this kit stays dependency-free.
 * `AnalysisRun` below is a permissive structural mirror of the wire
 * `RunEntry`, not a re-export of it.
 * @module @rheplicant/dsh-rheplicant-ui-kit/client/run/run-selectors
 */

const ANALYSIS_NODE_KIND = 'rheplicant-analysis'

/** Structural mirror of the wire `RunDiagnostics` — permissive, not authoritative. */
export interface AnalysisRunDiagnostics {
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
  readonly notes?: readonly string[]
  readonly [key: string]: unknown
}

/** Structural mirror of the wire `RunProduct` — permissive, not authoritative. */
export interface AnalysisRunProduct {
  readonly kind: string
  readonly [key: string]: unknown
}

/** One `rheplicant-analysis` run, as folded onto the Chat node's `data.runs`. */
export interface AnalysisRun {
  readonly name: string
  readonly kind: string
  readonly status?: 'ok' | 'failed'
  readonly diagnostics?: AnalysisRunDiagnostics
  /** Viz-ready per-latent downsampled draws (sampler kinds). */
  readonly chains?: Record<string, number[]>
  /** Viz-ready m-mode power spectrum (magnitude), for `mmodes` runs. */
  readonly spectrum?: number[][]
  readonly product?: AnalysisRunProduct
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isAnalysisRun(value: unknown): value is AnalysisRun {
  return isRecord(value) && typeof value.name === 'string' && typeof value.kind === 'string'
}

/** Pull the `runs` array out of one Chat node's `data`, dropping anything malformed. */
function runsFromNodeData(data: unknown): readonly AnalysisRun[] {
  if (!isRecord(data) || !Array.isArray(data.runs)) return []
  return data.runs.filter(isAnalysisRun)
}

/** List every Chat node's `.values()` iterator, or `[]` if the shape doesn't match. */
function chatNodeValues(snapshot: unknown): readonly unknown[] {
  if (!isRecord(snapshot) || !isRecord(snapshot.chat)) return []
  const nodes: unknown = snapshot.chat.nodes
  if (!isRecord(nodes) || typeof nodes.values !== 'function') return []
  return Array.from((nodes as { values(): Iterable<unknown> }).values())
}

/**
 * Fold a conversation snapshot down to every run reported by its
 * `rheplicant-analysis` Chat nodes, in node then run declaration order.
 * Malformed nodes or runs are skipped rather than thrown on — this is a
 * read-side projection over durable event data, not a validator.
 */
export function selectAnalysisRuns(snapshot: unknown): readonly AnalysisRun[] {
  return chatNodeValues(snapshot)
    .filter((node): node is Record<string, unknown> => isRecord(node) && node.kind === ANALYSIS_NODE_KIND)
    .flatMap(node => runsFromNodeData(node.data))
}

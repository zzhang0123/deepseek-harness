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

/**
 * Structural mirror of the wire `RunDiagnostics` — permissive, not
 * authoritative. Float-valued fields may be `null`: the wire spells a
 * non-finite value (NaN/±Inf) as JSON null.
 */
export interface AnalysisRunDiagnostics {
  readonly converged?: boolean
  readonly rhat?: number | null
  readonly rank?: number
  readonly nullity?: number
  readonly chi2?: number | null | readonly (number | null)[]
  readonly n_eff?: number | null | Record<string, number | null>
  readonly divergences?: number
  readonly kappa?: number | null | readonly (number | null)[]
  readonly delta?: number | null
  readonly iterations?: number
  readonly notes?: readonly string[]
  /** Per-latent r_hat/n_eff when the sampler reports more than one latent. */
  readonly mcmc?: Record<string, unknown>
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
  /**
   * Viz-ready downsampled draw traces (sampler kinds). One series per key; a
   * non-scalar latent fans out into component keys (`g[2]`, `g[0,3]`) or,
   * for map-scale latents, summary keys (`g.mean`, `g.q05`, `g.q95`) — the
   * grammar is owned by the wire `RunEntry.chains` contract. A `null`
   * element is a draw whose value was not finite.
   */
  readonly chains?: Record<string, (number | null)[]>
  /** Viz-ready m-mode power spectrum (magnitude), for `mmodes` runs; a `null` cell was not finite. */
  readonly spectrum?: (number | null)[][]
  readonly product?: AnalysisRunProduct
  /** Unix epoch ms the run's `rheplicant/run` event was appended — provenance distinguishing two otherwise-identical-looking runs (e.g. a rerun with the same seed producing a byte-identical outcome). */
  readonly time?: number
  /** The transport (`local`/`ssh`/`http`) that executed the run. */
  readonly transport?: 'local' | 'ssh' | 'http'
  /** The event's own session sequence number — the one field guaranteed to differ between two runs, even two reruns inside the same wall-clock second. */
  readonly seq?: number
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

/**
 * Vocabulary for the rheplicant compute seam (`ctx.rheplicant`). The four
 * methods carry a rheplicant config document and return its results; the
 * document's grammar is owned by rheplicant's schema and exposed by `schema`,
 * never restated here. This module is the TypeScript projection of the wire
 * contract in the rheplicant repository's `docs/agentic-ui-design.md`.
 * @module @rheplicant/dsh-rheplicant/types
 */

import { HarnessError } from '@deepseek-ai/dsh-llm'

/** A transport channel to a Python compute service. */
export type Transport = 'local' | 'ssh' | 'http'

/** The JSON form of a rheplicant config document. */
export type ComputeDocument = Record<string, unknown>

/** One refusal or warning about one place in the document. */
export interface ValidationError {
  /** JSON path into the document, e.g. `inference.parameters.g`. */
  readonly path: string
  /** Stable refusal code. */
  readonly code: string
  /** rheplicant's own refusal text, verbatim. */
  readonly message: string
  /** Owning check id when one applies. */
  readonly check?: string
}

export interface ValidationReport {
  readonly valid: boolean
  readonly errors: readonly ValidationError[]
  readonly warnings?: readonly ValidationError[]
}

/** One check the document will run, and what it costs. */
export interface CheckCost {
  readonly check: 'linearity' | 'identifiability' | 'prior_sensitivity'
  readonly mode: 'refuse' | 'warn' | 'report' | 'skip'
  readonly cost: string
}

/**
 * One run the document declares. Dependency between runs is never a `needs:`
 * list here — a run's inputs are expressed by its own `reuse:` key (which can
 * only look backward, into an earlier run's product) plus `runs:`'s
 * declaration order, which is the schedule (philosophy doc §7.1).
 */
export interface RunCost {
  readonly name: string
  readonly kind: string
}

export interface GatesReport {
  readonly checks: readonly CheckCost[]
  readonly runs: readonly RunCost[]
  readonly warnings: readonly string[]
}

/**
 * The kind-specific result of one run, discriminated by product shape.
 *
 * `values`/`samples`/`fields` entries are ordinarily the full projected
 * value, but the compute service enforces a per-array element budget on the
 * durable `rheplicant/run` session event (`_BUDGET_MAX_ELEMENTS` in
 * `server.py`): any one entry whose underlying array exceeds that budget is
 * replaced by a summary of shape `{ truncated: true, nElements, shape, mean?,
 * std?, q05?, q50?, q95? }` (the four quantile/moment fields are only present
 * for a numeric dtype). A consumer reading `values`/`samples`/`fields` must
 * check for `truncated` before treating an entry as the raw array.
 */
export type RunProduct =
  | { readonly kind: 'estimate'; readonly values: Record<string, unknown> }
  | {
      readonly kind: 'draws'
      readonly samples: Record<string, unknown>
      readonly nDraw?: number
      readonly mean?: Record<string, unknown>
      readonly std?: Record<string, unknown>
    }
  | { readonly kind: 'report'; readonly fields: Record<string, unknown> }

/** Quality signals the agent must read, not only the numbers. */
export interface RunDiagnostics {
  readonly converged?: boolean
  readonly rhat?: number
  readonly rank?: number
  readonly nullity?: number
  readonly chi2?: number | readonly number[]
  /** Effective sample size (NUTS). Scalar, or per-latent when folded flat. */
  readonly n_eff?: number | Record<string, number>
  /** Number of divergent transitions (NUTS). */
  readonly divergences?: number
  /** Conditioning number κ (the `condition` exit). */
  readonly kappa?: number | readonly number[]
  readonly delta?: number
  readonly iterations?: number
  readonly weakest_identified?: unknown
  readonly singular_values?: number | readonly number[]
  /** Per-latent r_hat/n_eff when the sampler reports more than one latent. */
  readonly mcmc?: Record<string, unknown>
  readonly notes?: readonly string[]
}

export interface RunEntry {
  readonly name: string
  readonly kind: string
  readonly status: 'ok' | 'failed'
  readonly product?: RunProduct
  readonly diagnostics?: RunDiagnostics
  /** Viz-ready chain summary: per-latent downsampled draws (sampler kinds). */
  readonly chains?: Record<string, number[]>
  /** Viz-ready m-mode power spectrum (magnitude), for `mmodes` runs. */
  readonly spectrum?: number[][]
  readonly error?: ComputeError
}

/** The lit/dim signal-path rendering for a document's `model:` section. */
export interface SignalPathGraph {
  /** Canonical graph template name, e.g. `single-antenna`. */
  readonly graph: string
  /** Node ids the document's operators light up. */
  readonly lit: readonly string[]
  /** Junction/selector nodes traversed as identity. */
  readonly skipped: readonly string[]
  /** Self-contained `<svg>` (dark theme), for direct embedding. */
  readonly svg?: string
  /** Mermaid source, for a client-side renderer. */
  readonly mermaid?: string
}

/** One post-flight gate verdict (linearity / identifiability / prior_sensitivity / …). */
export interface GateFinding {
  /** Schema check id, e.g. `C12` (linearity), `C13` (identifiability). */
  readonly check: string
  readonly severity: 'refuse' | 'warn' | 'report' | 'skip'
  /** JSON path into the document the finding names. */
  readonly where: string
  readonly message: string
}

export interface RunOutcome {
  readonly runs: readonly RunEntry[]
  readonly tookMs?: number
  /** Present when the document declares a `model:`; the lit/dim graph. */
  readonly graph?: SignalPathGraph
  /** Post-flight gate verdicts, read off rheplicant's own report ledger. */
  readonly gates?: readonly GateFinding[]
}

/** The config grammar as one object: schema plus the exit/operator/transform catalogs. */
export interface SchemaDocument {
  readonly schemaVersion: string
  readonly jsonSchema: Record<string, unknown>
  readonly exits: readonly unknown[]
  readonly operators: readonly unknown[]
  readonly transforms: readonly unknown[]
}

export interface ComputeOpts {
  readonly transport: Transport
  readonly signal?: AbortSignal
}

export interface RunOpts extends ComputeOpts {
  /** Optional subset of run names, in declaration order. */
  readonly runs?: readonly string[]
}

/** One compute backend, registered under one or more transport names. */
export interface ComputeProvider {
  validate(document: ComputeDocument, opts: ComputeOpts): Promise<ValidationReport>
  gates(document: ComputeDocument, opts: ComputeOpts): Promise<GatesReport>
  run(document: ComputeDocument, opts: RunOpts): Promise<RunOutcome>
  schema(opts: ComputeOpts): Promise<SchemaDocument>
  /** The lit/dim signal-path rendering for a document's `model:` section. */
  graph(document: ComputeDocument, opts: ComputeOpts): Promise<SignalPathGraph | null>
}

/**
 * Typed compute error with a machine-routable, open-string `code`. Seam-level
 * codes cover transport registration and routing; the wire methods surface the
 * Python service's own codes (`INVALID_DOCUMENT`, `RUN_FAILED`, `TIMEOUT`,
 * `INTERNAL`) unchanged.
 */
export class ComputeError extends HarnessError {}

/** The durable record one executed analysis leaves in the session log. */
export interface RheplicantRunEventData {
  /** The document that was executed. */
  readonly document: ComputeDocument
  /** Its outcome: one entry per run, in declaration order. */
  readonly outcome: RunOutcome
  /** The transport that executed it. */
  readonly transport: Transport
}

/**
 * Endpoint configuration for the network transports, editable at runtime through
 * the `ui-compute` settings card (the seam's settings channel).
 */
export interface ComputeEndpoints {
  readonly ssh?: { readonly host?: string; readonly command?: string }
  readonly http?: { readonly baseUrl?: string }
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

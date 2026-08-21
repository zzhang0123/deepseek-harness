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

/** One run the document declares, and what it needs. */
export interface RunCost {
  readonly name: string
  readonly kind: string
  readonly needs?: readonly string[]
}

export interface GatesReport {
  readonly checks: readonly CheckCost[]
  readonly runs: readonly RunCost[]
  readonly warnings: readonly string[]
}

/** The kind-specific result of one run, discriminated by product shape. */
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
  readonly notes: readonly string[]
}

export interface RunEntry {
  readonly name: string
  readonly kind: string
  readonly status: 'ok' | 'failed'
  readonly product?: RunProduct
  readonly diagnostics?: RunDiagnostics
  readonly error?: ComputeError
}

export interface RunOutcome {
  readonly runs: readonly RunEntry[]
  readonly tookMs?: number
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

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Records one executed analysis: the document, its transport, and its outcome.
     * @param data - the document, transport, and run outcome.
     */
    'rheplicant/run': RheplicantRunEventData
  }
}

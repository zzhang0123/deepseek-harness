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
/**
 * Every transport name a provider may be registered under.
 *
 * The runtime companion to {@link Transport}, so the union has exactly one
 * definition. A second list written out by hand is a second list to forget.
 */
export const TRANSPORTS = ['local', 'ssh', 'http'] as const

export type Transport = (typeof TRANSPORTS)[number]

/** Whether one unknown value is a transport name. */
export function isTransport(value: unknown): value is Transport {
  return typeof value === 'string' && (TRANSPORTS as readonly string[]).includes(value)
}

/**
 * One caller-supplied transport name, validated at the boundary.
 *
 * Replaces four `as Transport` casts on values that come from OUTSIDE this
 * layer — three model-supplied tool arguments and a browser query parameter.
 * A cast let a typo through to {@link ComputeRuntime}, which answered "no
 * rheplicant compute provider is registered for transport 'locl'": true, and
 * misleading, because it reads as a composition problem — you forgot to mount
 * something — rather than as the misspelling it is. Whoever reads that goes
 * looking for the wrong fix.
 *
 * Throws rather than falling back to `local`. A caller that names a transport
 * has an intention, and quietly running somewhere else is the worst available
 * answer: the run succeeds, on the wrong machine, and says nothing.
 *
 * @param value - the caller-supplied name.
 * @param where - what to name in the refusal (a tool name, a route).
 * @returns the validated transport.
 * @throws ComputeError `INVALID_TRANSPORT` when it is not one.
 */
export function asTransport(value: unknown, where: string): Transport {
  if (isTransport(value)) return value
  throw new ComputeError(
    `${where}: ${JSON.stringify(value)} is not a rheplicant transport; `
    + `the registered names are ${TRANSPORTS.join(', ')}.`,
    'INVALID_TRANSPORT',
  )
}

/** The JSON form of a rheplicant config document. */
export type ComputeDocument = Record<string, unknown>

/**
 * The ONE document a compute call carries, in exactly one of two forms.
 *
 * `document` is an already-parsed mapping — the inline form, for scratch
 * work. `documentText` is a task file's EXACT bytes, decoded as UTF-8 and
 * never parsed on this side of the wire: the config grammar has exactly one
 * owner (rheplicant's own bounded YAML loader), and `taskDigest` is the
 * digest of those exact bytes, so the bytes must reach the service unparsed
 * or the digest would describe something that never ran.
 *
 * Exactly one must be present. The refusal is the compute service's, in its
 * own vocabulary (`INVALID_DOCUMENT`), so one rule lives in one place rather
 * than being restated by every provider.
 *
 * Both fields spell their optionality as `T | undefined` rather than a bare
 * `T`, so a caller can build the object straight off another optional value
 * without a conditional spread under `exactOptionalPropertyTypes` — the same
 * reasoning `RunProvenance` (ui-kit) records for its own fields.
 */
export interface ComputeInput {
  /** An already-parsed config document (the inline form). */
  readonly document?: ComputeDocument | undefined
  /** A task file's exact bytes as UTF-8 text, parsed only by the service. */
  readonly documentText?: string | undefined
  /**
   * The task file's absolute, canonical path — the one `readTaskFile` cleared.
   *
   * Publication needs it for two things the bytes cannot supply: the document's
   * `base_dir`, which its own `resources:` file references resolve against, and
   * the source path recorded in `provenance.json`. Absent for the inline form,
   * which has no file, and therefore cannot publish (`docs/project-model.md`
   * §4.3).
   */
  readonly taskPath?: string | undefined
}

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
  /**
   * The document the service parsed, echoed back — present ONLY when the
   * call sent `documentText`. The caller has bytes, not a mapping, in that
   * case, and the session log's `document` field (and every console panel
   * folded off it) needs the parsed form; re-parsing YAML on this side would
   * put a second owner on the grammar. See {@link ComputeInput}.
   */
  readonly document?: ComputeDocument
}

/** One check the document will run, and what it costs. */
export interface CheckCost {
  readonly check: 'linearity' | 'identifiability' | 'prior_sensitivity'
  /**
   * What the document literally WROTE for this check — absent when it wrote
   * nothing.
   *
   * Four values against {@link state}'s six, because `off` and `auto_skip` are
   * effective states no document can contain. A check the document never
   * mentions therefore has no honest `mode`, and the field is OMITTED rather
   * than filled with a default — which is what makes "did a human CHOOSE
   * this?" answerable, and that is exactly what §7's third criterion asks
   * about a `skip`.
   *
   * **Old durable events carry the EFFECTIVE state here.** Until 2026-08-23
   * the service filled this field from `state`, so anything folded out of a
   * session log written before then reads its effective state under this
   * name. `state ?? mode` is the correct read for a logged event, and the
   * WRONG read for a live `gates` answer, where the two now mean different
   * things.
   */
  readonly mode?: 'refuse' | 'warn' | 'report' | 'skip'
  /**
   * The resource this check spends, in the package's own words. Optional
   * because the service does not compute it yet — the design promises it
   * (`docs/agentic-ui-design.md`), the wire does not carry it.
   */
  readonly cost?: string
  /** Schema §6 check id: linearity is `C12`, identifiability `C13`, prior_sensitivity `C19`. */
  readonly id?: 'C12' | 'C13' | 'C19'
  /**
   * What actually governs this check, defaults applied. Six states rather than
   * `mode`'s four: `off` (nobody asked for this check) and `auto_skip` (asked
   * for, but undefined on this document) are never written into a document —
   * only `refuse`/`warn`/`report`/`skip` can be.
   */
  readonly state?: 'refuse' | 'warn' | 'report' | 'skip' | 'off' | 'auto_skip'
  /** The document's `report:` — whether this check's numbers are recorded when it passes. */
  readonly record?: boolean
  /**
   * A skip needs a reason because somebody chose it; an off does not. Set for
   * a written `skip` (verbatim) or a generated `auto_skip`; `null` for every
   * other state, `off` included.
   */
  readonly reason?: string | null
  /** The document path the user edits to change this gate, e.g. `inference.checks.linearity`. */
  readonly where?: string
  /** Relative tolerance, carried by `identifiability` only; `null` for the other two. */
  readonly rtol?: number | null
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
  /** The parsed document, echoed back when the call sent `documentText`. See {@link ValidationReport.document}. */
  readonly document?: ComputeDocument
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
 *
 * Non-finite floats never reach the wire: the service maps NaN/±Infinity to
 * JSON `null` at its one serialization boundary (`_wire_safe` in
 * `server.py`), RFC 8259 having no tokens for them. So any number anywhere
 * in a payload — an array element, a `mean` in a truncated summary, an
 * `rhat` — may arrive as `null`, meaning "this value was not finite".
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

/**
 * Quality signals the agent must read, not only the numbers.
 *
 * Every float-valued signal may be `null`: a non-finite value (an rhat of a
 * zero-variance chain is NaN, a delta can be ±Inf) is mapped to JSON `null`
 * at the wire boundary. The integer counts (`rank`, `nullity`,
 * `divergences`, `iterations`) cannot be non-finite and stay plain numbers.
 */
export interface RunDiagnostics {
  readonly converged?: boolean
  readonly rhat?: number | null
  readonly rank?: number
  readonly nullity?: number
  readonly chi2?: number | null | readonly (number | null)[]
  /** Effective sample size (NUTS). Scalar, or per-latent when folded flat. */
  readonly n_eff?: number | null | Record<string, number | null>
  /** Number of divergent transitions (NUTS). */
  readonly divergences?: number
  /** Conditioning number κ (the `condition` exit). */
  readonly kappa?: number | null | readonly (number | null)[]
  readonly delta?: number | null
  readonly iterations?: number
  readonly weakest_identified?: unknown
  readonly singular_values?: number | null | readonly (number | null)[]
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
  /**
   * Viz-ready chain summary: downsampled draw traces (sampler kinds), one
   * flat `{key: number[]}` map. A scalar latent is keyed by its bare name
   * (`g`); a non-scalar latent fans out into several keys under a fixed
   * grammar the compute service owns (`_chain_traces` in `server.py`):
   * per-component traces keyed by the latent's own index (`g[2]`, `g[0,3]`)
   * when the latent has at most `_CHAIN_MAX_COMPONENTS` (8) elements, and
   * three per-draw summary traces across components (`g.mean`, `g.q05`,
   * `g.q95`) when it is wider. Every key renders as one series; a consumer
   * grouping by latent should split on the first `[` or `.`. On the
   * (pathological) collision of a generated key with another latent's key,
   * the later writer is disambiguated with a `#2`, `#3`, … suffix — no
   * trace is ever silently dropped. A `null` element is a draw whose value
   * was not finite.
   */
  readonly chains?: Record<string, (number | null)[]>
  /** Viz-ready m-mode power spectrum (magnitude), for `mmodes` runs; a `null` cell was not finite. */
  readonly spectrum?: (number | null)[][]
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
  /**
   * Where the execution's tree actually landed. Present only for a published
   * run, and NOT necessarily the `outputsDir` that was asked for: a refused or
   * errored execution is published under a sibling directory carrying a
   * `.refused-`/`.error-` suffix, and this is the one that exists.
   */
  readonly resultsPath?: string
  /** The parsed document, echoed back when the call sent `documentText`. See {@link ValidationReport.document}. */
  readonly document?: ComputeDocument
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
  /**
   * The absolute directory THIS execution publishes into — one per execution,
   * so two runs of one task can coexist (`docs/project-model.md` §4.4).
   *
   * It is an invocation parameter all the way down: the service passes it to
   * rheplicant's `outputs_dir=`, and the task document is never patched, so
   * `config.input.yaml` and `taskDigest` still describe exactly the bytes the
   * user wrote. Omit it and the run stays in memory, which is what an inline
   * scratch document does.
   */
  readonly outputsDir?: string
}

/**
 * One `file:` reference a document declares, and whether it resolves.
 *
 * `docs/project-model.md` §12.1. §7 words its first criterion as "every
 * `file:` reference exists under `inputs/`", which is stricter than the
 * package: `config/files.py` applies no containment on purpose, and names
 * three real spellings the rule would break. So the question answered here is
 * whether a reference RESOLVES.
 */
export interface DocumentInputReference {
  /** Where in the document it sits, dotted — e.g. `model.gain.gain`. */
  readonly where: string
  /** The path AS DECLARED, verbatim. The user's own text out of their document. */
  readonly path: string
  /** The document's own `format:`, never inferred from the extension. */
  readonly format: string | null
  readonly resolves: boolean
  /**
   * Absolute, and HOST-SIDE ONLY — the route strips it before answering a
   * browser (`project-api.ts`), which is the layer that knows where the
   * project is and therefore the only one that can say "inside" or "outside".
   */
  readonly resolvedPath: string | null
  /**
   * True when the reference is malformed — a non-string path, say.
   *
   * A grammar fault, which {@link DefinitionReport.validation} reports in its
   * own vocabulary. Flagged rather than called "does not resolve", because
   * stating one fault twice under two names sends someone looking for a
   * missing file that was never named.
   */
  readonly malformed?: boolean
}

/**
 * Everything §7 calls "completely defined", about one document, at once.
 *
 * One call rather than three, for the reason `/overview` is one route: three
 * answers fetched separately can describe three different versions of a
 * document that changed between them.
 */
export interface DefinitionReport {
  readonly inputs: readonly DocumentInputReference[]
  readonly validation: ValidationReport
  readonly gates: GatesReport
  /** The required fields still undecided; null when the gui extra is absent. */
  readonly fields: UndecidedFields | null
  readonly fieldsUnavailable?: 'gui-extra-absent'
  /** The parsed document, echoed ONCE. See {@link ValidationReport.document}. */
  readonly document?: ComputeDocument
}

/** One parameter of a declared operator, described by the grammar itself. */
export interface ModelField {
  readonly name: string
  readonly label: string
  /**
   * The operator class's own `Attributes:` docstring, lifted upstream.
   *
   * Never prose written in this layer: a second description of what a
   * parameter means is a second thing to drift from the physics.
   */
  readonly help: string | null
  readonly unit: string | null
  readonly required: boolean | null
  readonly value: unknown
}

/** One operator this document DECLARES. */
export interface ModelNode {
  readonly nodeId: string
  readonly label: string
  /** `source` / `transform` / `processing` / … — the canonical graph's own kind. */
  readonly kind: string
  readonly segment: string
  readonly description: string | null
  readonly selectedType: string | null
  readonly fields: readonly ModelField[]
}

/**
 * The physics one document declares, and how much it did not.
 *
 * Only the LIT nodes: the canonical graph has 33 and an ordinary document
 * lights three. The dimmed remainder is what the DIAGRAM shows, which is a
 * different mechanism's job. {@link totalNodes} is reported anyway, because
 * "3 of 33" tells a reader there is more physics available than they used.
 */
export interface DocumentModel {
  readonly totalNodes: number
  readonly nodes: readonly ModelNode[]
}

/** One exit the grammar can run. */
export interface ExitEntry {
  readonly kind: string
  /**
   * Whether this exit needs a fitted parameter space.
   *
   * The only exit partition rheplicant's source defends
   * (`preflight/model.py::_A30_NOT_FITTING`). There is deliberately no
   * `capability` field: capabilities are prose in the README, with no enum,
   * no registry and no per-exit marker, and a hand-kept mapping here would
   * be the one thing in this repo that must track the grammar by hand.
   */
  readonly fitting: boolean
  /** The exit's own docstring first line; null for the two that carry none. */
  readonly summary: string | null
  /** What it writes, from `RUN_KIND_SELECTORS`. This is what makes a name choosable. */
  readonly products: readonly string[]
}

/** One run this document declares. */
export interface DeclaredRun {
  readonly index: number
  readonly name: string | null
  readonly kind: string | null
  /** False for a kind the grammar does not run — never counted as an exit used. */
  readonly known: boolean
  readonly products: readonly string[]
  /** Prerequisites this exit cannot check until an earlier run finishes. */
  readonly deferredChecks: readonly string[]
}

/**
 * A document key reserved for a capability that does not ship.
 *
 * `preflight/document.py::_CAPABILITY_KEYS` is the ONE place rheplicant names
 * a capability in code. Capability 4 has no exit at all — six keys, every one
 * refused — which a four-row capability table would have hidden behind an
 * empty row.
 */
export interface ReservedKey {
  readonly key: string
  /** The capability reserving it, in the source's own words. */
  readonly capability: string
  /** The schema section that reserves it. */
  readonly section: string
}

/** The exits, and what this document does with them. */
export interface DocumentRuns {
  readonly exitsTotal: number
  readonly catalogue: readonly ExitEntry[]
  readonly declared: readonly DeclaredRun[]
  readonly reserved: readonly ReservedKey[]
}

/**
 * One document projected for display: the signal path, and what it declares.
 *
 * `docs/project-model.md` §17. What makes this worth a route is that it needs
 * NO execution — a task that has never run can show its diagram and its
 * operators, where before both appeared only after a first run. The
 * philosophy doc asks for "a canonical graph ALWAYS present on screen".
 */
export interface DocumentProjection {
  readonly svg: string
  readonly walkOrder: readonly string[]
  readonly model: DocumentModel
  readonly runs: DocumentRuns
}

/** One compute backend, registered under one or more transport names. */
export interface ComputeProvider {
  validate(input: ComputeInput, opts: ComputeOpts): Promise<ValidationReport>
  gates(input: ComputeInput, opts: ComputeOpts): Promise<GatesReport>
  run(input: ComputeInput, opts: RunOpts): Promise<RunOutcome>
  /**
   * Project one PUBLISHED execution tree, without running anything.
   *
   * The read half of the seam: what lets a panel render an execution some
   * other session produced, and what lets the durable event stop carrying
   * arrays. The caller confines `resultsPath` to a project's own `results/`
   * tree before asking (`executions.ts`).
   */
  readExecution(resultsPath: string, opts: RunOpts): Promise<RunOutcome>
  /**
   * How far one document is from being a defined task (§7, §12).
   *
   * Takes `taskPath` off the input for the document's `base_dir`, exactly as
   * {@link ComputeInput.taskPath} already documents — relative `file:` paths
   * then resolve the way they would in a run, which is the only resolution
   * worth reporting.
   */
  definition(input: ComputeInput, opts: ComputeOpts): Promise<DefinitionReport>
  /**
   * Project one document for display — the diagram and the declared physics.
   *
   * Asks the service for a SLICE (`svg`, `walkOrder`, `model`): the full
   * projection is ~68 KB of which most is a dimmed catalogue no surface
   * renders, and the slice is ~21 KB.
   */
  projectDocument(documentText: string, opts: ComputeOpts): Promise<DocumentProjection>
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

/**
 * Which task a logged call was about (`docs/project-model.md` §3, §4.2).
 *
 * Both fields are OPTIONAL because events written before this existed carry
 * neither — a reader must treat their absence as "an older call", never as
 * an error — and because an inline (scratch) call has no task file.
 */
export interface TaskIdentity {
  /**
   * sha256 (hex) of the document the user AUTHORED — the task file's exact
   * bytes, or the inline document's stable JSON when there is no file. Never
   * the digest of what ran: with a per-execution output directory injected
   * (§4.4) the executed bytes contain the id, so deriving the id from them
   * would be circular. This is the digest staleness is measured against.
   */
  readonly taskDigest?: string
  /** The task file's path as the caller spelled it; absent for an inline (scratch) call. */
  readonly taskPath?: string
}

/**
 * Execution identity, carried on the durable `rheplicant/run` event
 * (`docs/project-model.md` §4.1). An Execution is one run of one task at one
 * time: two runs of one document with one seed are byte-identical, so
 * nothing in the outcome distinguishes them — the id does.
 */
export interface ExecutionIdentity extends TaskIdentity {
  /**
   * `<UTC compact>-<first 8 of taskDigest>-<6 random>`, e.g.
   * `20260822T134501Z-3f9ac2b1-k7m2xq`. Minted host-side, once per call.
   * Only a RUN is an execution: validate and gates carry the task identity
   * without one.
   */
  readonly executionId?: string
}

/** The durable record one executed analysis leaves in the session log. */
export interface RheplicantRunEventData extends ExecutionIdentity {
  /** The document that was executed. */
  readonly document: ComputeDocument
  /** Its outcome: one entry per run, in declaration order. */
  readonly outcome: RunOutcome
  /** The transport that executed it. */
  readonly transport: Transport
}

/** The durable record one `rheplicant_validate` call leaves in the session log. */
export interface RheplicantValidateEventData extends TaskIdentity {
  /** The document that was validated. */
  readonly document: ComputeDocument
  /** The transport that validated it. */
  readonly transport: Transport
  /** Its outcome: every refusal and warning, with the JSON path to fix. */
  readonly report: ValidationReport
}

/** The durable record one `rheplicant_gates` call leaves in the session log. */
export interface RheplicantGatesEventData extends TaskIdentity {
  /** The document whose checks were priced. */
  readonly document: ComputeDocument
  /** The transport that priced them. */
  readonly transport: Transport
  /** Its outcome: which checks run in which mode, and what they cost. */
  readonly report: GatesReport
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
    /**
     * Records one validate call: the document, its transport, and its validation report.
     * @param data - the document, transport, and validation report.
     */
    'rheplicant/validate': RheplicantValidateEventData
    /**
     * Records one gates call: the document, its transport, and its gates report.
     * @param data - the document, transport, and gates report.
     */
    'rheplicant/gates': RheplicantGatesEventData
  }
}

/**
 * One execution as the browser sees it: no absolute path, no identity triple.
 *
 * The wire shape of `GET /rheplicant/project/executions`. It lives here, in
 * the seam's contract module, rather than beside the route handler, because
 * the handler imports `node:http` and the console must be able to name this
 * type without dragging node types into the browser graph.
 */
export interface ProjectExecutionRow {
  readonly executionId: string
  readonly task: string
  /** How the execution ended, read off its published directory name. */
  readonly status: 'ok' | 'refused' | 'error'
  /** Project-relative, e.g. `results/tasks/fit/<id>/` — what the header shows. */
  readonly path: string
  /** The session that produced it, when our sidecar recorded one. */
  readonly sessionId?: string
  readonly transport?: string
  readonly startedAt?: string
  readonly finishedAt?: string
  /**
   * sha256 of the task bytes this execution RAN, when our sidecar recorded it.
   *
   * On the wire because staleness is a digest comparison and nothing else
   * (§4.2: "Content digest, not revision number"). Without it a surface that
   * wanted to say "these results are for an older version of this document"
   * could only compare modification times, which is a weaker claim wearing the
   * same word.
   */
  readonly taskDigest?: string
}

/** The listing response body. */
export interface ProjectExecutionsBody {
  /**
   * The project's own name — the workspace directory's basename.
   *
   * Sent once on the body rather than repeated per row, because it is a
   * property of the project and not of any execution in it. A NAME, never the
   * path: the browser has no use for the host's directory layout.
   */
  readonly project: string
  readonly executions: readonly ProjectExecutionRow[]
}

/**
 * One task document as the browser sees it.
 *
 * The `path` is workspace-relative and is the SAME string `rheplicant_run`
 * takes as its `task:` parameter, so the project home can offer a task without
 * inventing a second addressing scheme for one.
 */
export interface ProjectTaskRow {
  /** Workspace-relative, POSIX separators, e.g. `tasks/fit.yaml`. */
  readonly path: string
  readonly bytes: number
  /** ISO-8601 modification instant. */
  readonly modifiedAt: string
  /** How many executions of this task the project holds. */
  readonly executionCount: number
  /** The newest execution's id, absent when the task has never run. */
  readonly newestExecutionId?: string
}

/**
 * One candidate input file as the browser sees it.
 *
 * `extension`, deliberately not `format`. rheplicant refuses to infer a format
 * from an extension (`config/files.py`), so a row that claimed one would be
 * asserting something the engine will not — the document's `format:` key is
 * the only thing that decides how bytes are read.
 */
export interface ProjectInputRow {
  readonly path: string
  readonly bytes: number
  readonly modifiedAt: string
  readonly extension: string
}

/**
 * The project home's whole answer: what the project holds and what it has run.
 *
 * One body rather than three routes, because the three lists are read off ONE
 * walk of the tree and a home assembled from three round trips could show a
 * task whose executions had already been pruned between calls.
 */
export interface ProjectOverviewBody {
  /** The project's own name — the workspace directory's basename. */
  readonly project: string
  readonly tasks: readonly ProjectTaskRow[]
  readonly inputs: readonly ProjectInputRow[]
  readonly executions: readonly ProjectExecutionRow[]
  /**
   * True when a scan cap stopped the walk, so `tasks`/`inputs` are incomplete.
   * Rendered on screen: a listing that quietly dropped half a project would
   * read as a complete listing of a smaller project.
   */
  readonly truncated: boolean
}

/**
 * One task document as the browser receives it.
 *
 * The bytes the operator authored, not the bytes an execution ran — see
 * `ProjectRuntime.readTask`. The `path` is echoed back so a client holding
 * several documents can tell which answer belongs to which request.
 */
export interface ProjectTaskDocumentBody {
  readonly path: string
  readonly text: string
  readonly bytes: number
  readonly modifiedAt: string
}

/**
 * One `file:` reference, as a BROWSER may see it.
 *
 * {@link DocumentInputReference} with the host path removed and replaced by
 * the only two facts about it a browser has any business knowing: whether it
 * landed inside this project, and if so where, project-relative. §12.5.
 */
export interface ProjectInputReference {
  readonly where: string
  /** The path as the document declared it — the user's own text. */
  readonly path: string
  readonly format: string | null
  readonly resolves: boolean
  /** False for a reference that resolved elsewhere, and for one that did not resolve. */
  readonly inProject: boolean
  /** Workspace-relative, present only when {@link inProject}. */
  readonly projectPath?: string
  readonly malformed?: boolean
}

/**
 * One required field this document has not decided yet.
 *
 * `docs/project-model.md` §17. Upstream's own `must_decide` flag — visible,
 * enabled, required, absent, and carrying no default — evaluated against this
 * document. Naming them is what turns §7's second criterion from a verdict
 * ("the document does not validate") into a to-do list.
 */
export interface UndecidedField {
  /** Concrete dotted path, wildcards bound — e.g. `runs[0].num_samples`. */
  readonly path: string
  /** The grammar's own label for it. */
  readonly label: string
  /** Which of the 12 form sections it belongs to. */
  readonly section: string
  /** The widget kind the grammar declares; a display hint, never a format claim. */
  readonly widget: string
  /** The accepted values, when this field is a closed choice. */
  readonly choices: readonly string[]
  /** Every spelling the alphabet accepts for this field's dimension, canonical first. */
  readonly units: readonly string[]
}

/**
 * How far one task is from §7's "completely defined".
 *
 * {@link digest} is the sha256 of the bytes that were CHECKED. The document
 * pane and this check are two separate fetches, so without it a file edited
 * between them would show one document under the other's verdict (§12.6).
 */
/** {@link DocumentProjection} as a browser sees it, with its document's digest. */
export interface ProjectDocumentProjectionBody extends DocumentProjection {
  readonly path: string
  /** sha256 of the bytes projected, so the view cannot be shown against another version. */
  readonly digest: string
}

export interface ProjectDefinitionBody {
  readonly path: string
  readonly digest: string
  readonly inputs: readonly ProjectInputReference[]
  readonly validation: ValidationReport
  readonly gates: GatesReport
  /**
   * The required fields still undecided, or `null` when they could not be
   * named at all.
   *
   * Null is NOT an empty list. `rheplicant.gui` is an optional extra and none
   * of the four criteria depend on it, so its absence means "we cannot name
   * them" — which must not render as "there are none left".
   */
  readonly fields: UndecidedFields | null
  /** Why {@link fields} is null, present only when it is. */
  readonly fieldsUnavailable?: 'gui-extra-absent'
}

/** The undecided-field answer, and what it did not look at. */
export interface UndecidedFields {
  readonly undecided: readonly UndecidedField[]
  /**
   * Form sections this answer excluded, and therefore says nothing about.
   *
   * Today: `runs`. The upstream catalogue emits one widget per option KEY
   * across all eighteen exits, so `must_decide` on a `runs[].*` path means
   * "required for SOME kind" — measured to over-claim four fields on one
   * document. An exclusion nobody announced would read as "nothing to decide
   * there", so it is named rather than left to be inferred from an absence.
   */
  readonly excludes: readonly string[]
}

/**
 * Pure derivation of the LoopRail's five stage verdicts (and Validate's
 * four-pass breakdown) from one `LoopSnapshot`. Kept separate from
 * `LoopRail.tsx` so the honesty rules — what the wire can and cannot support
 * per stage — are readable and reviewable on their own, the same split
 * `run-selectors.ts` draws for the console panels.
 *
 * WIRE HONESTY NOTES (why some states can never appear, or only appear under
 * a narrower condition than a first reading of the four-pass rule suggests):
 * - `author` only ever renders `ok`/`idle`: the wire carries no authoring
 *   failure signal (a document either exists on the latest event or it
 *   doesn't), so `warn`/`error` are structurally unreachable here.
 * - `axes` only ever renders `ok`/`unknown`: the compute service documents
 *   exactly one build-stage failure code (`BUILD_FAILED`, on `built`); there
 *   is no equivalent "axes failed" code, so this pass can never honestly
 *   render `error` — see `axesBuiltPasses` below.
 * - `axes`/`built` render `ok` ONLY when every run in the outcome succeeded
 *   (`status === 'ok'`) or the one documented failure code (`BUILD_FAILED`)
 *   fires. A run that failed for any OTHER reason is genuinely ambiguous
 *   evidence: the wire gives no way to tell "failed after axes/built
 *   succeeded, during the actual compute" apart from "failed for an
 *   unreported reason before either finished" — so both passes render
 *   `unknown` rather than assume the optimistic reading. This is the
 *   dominant source of `unknown` passes in practice: an ordinary compute
 *   failure (not a build failure, not a full success) leaves axes/built
 *   with no honest verdict.
 * - `pending` (of the five-value stage-state enum) is never produced by any
 *   stage: every durable rheplicant event fires only once a call has
 *   settled, so the wire has no "in flight" signal for validate/gates/run to
 *   render against. The state exists for forward-compatibility with the
 *   enum's declared range, not because today's wire can reach it.
 * - `diagnostics`' r_hat check reads BOTH the scalar `RunDiagnostics.rhat`
 *   AND the per-latent `RunDiagnostics.mcmc` bag, at the ONE shared
 *   threshold `ui-kit` owns (`RHAT_WARN_ABOVE`) — a multi-latent NUTS run
 *   commonly reports r_hat/n_eff ONLY per-latent, with no scalar `rhat` at
 *   all, so reading the scalar alone used to render a false `ok` for a run
 *   whose worst latent was well over threshold. There is still only ONE warn
 *   tier here, scalar or per-latent: a bad r_hat never escalates this stage
 *   to `error` (only `divergences > 0` or `converged === false` do) — mixing
 *   the two paths does not invent a new severity, it only widens which
 *   fields participate in the existing one.
 * @module @rheplicant/dsh-rheplicant-ui-console/client/loop-selectors
 */

import type { CheckCost, RunEntry } from '@rheplicant/dsh-rheplicant'
import { RHAT_WARN_ABOVE, formatDiagnostic, formatMs, mcmcLatents } from '@rheplicant/dsh-rheplicant-ui-kit/client'
import type { LoopGatesEntry, LoopRunEntry, LoopSnapshot, LoopValidateEntry } from './loop-contract.ts'

export type StageId = 'author' | 'validate' | 'gates' | 'run' | 'diagnostics'
export type StageState = 'ok' | 'warn' | 'error' | 'pending' | 'idle'
export type PassId = 'pre-flight' | 'axes' | 'built' | 'post-flight'
export type PassState = 'ok' | 'warn' | 'error' | 'unknown'

export interface PassInfo {
  readonly id: PassId
  readonly state: PassState
}

export interface StageInfo {
  readonly id: StageId
  readonly label: string
  readonly state: StageState
  readonly detail: string
  /** `[data-panel]` target this stage scrolls into view when clicked; absent = no click target. */
  readonly panelTarget?: string
  /** Validate only: the four-pass breakdown. */
  readonly passes?: readonly PassInfo[]
  /** Gates only: whether any check is in a skip/auto_skip state (the "stale purple" marker). */
  readonly stale?: boolean
}

const NOT_YET_RECORDED = 'not yet recorded'

type LoopEntry = LoopValidateEntry | LoopGatesEntry | LoopRunEntry

function sectionCount(document: Record<string, unknown>): number {
  return Object.keys(document).length
}

/** The document carried by whichever of validate/gates/run is most recent. */
function latestDocument(snapshot: LoopSnapshot): Record<string, unknown> | undefined {
  const entries: LoopEntry[] = [snapshot.validate, snapshot.gates, snapshot.run]
    .filter((entry): entry is LoopEntry => entry !== undefined)
  if (entries.length === 0) return undefined
  return entries.reduce((latest, entry) => (entry.seq > latest.seq ? entry : latest)).document
}

export function authorStage(snapshot: LoopSnapshot): StageInfo {
  const document = latestDocument(snapshot)
  if (document === undefined) return { id: 'author', label: 'Author', state: 'idle', detail: NOT_YET_RECORDED }
  const count = sectionCount(document)
  return { id: 'author', label: 'Author', state: 'ok', detail: `${count} section${count === 1 ? '' : 's'}` }
}

function preFlightPass(validate: LoopValidateEntry | undefined): PassInfo {
  if (validate === undefined) return { id: 'pre-flight', state: 'unknown' }
  return { id: 'pre-flight', state: validate.report.valid ? 'ok' : 'error' }
}

/**
 * axes/built from the run: a successful run implies both passed; the one
 * documented build-stage failure code (`BUILD_FAILED`) marks `built` failed
 * (and, by pipeline order, implies `axes` still passed — you cannot reach
 * `built` without it). Anything else — a run that failed for an unnamed
 * reason, mixed ok/failed runs with no `BUILD_FAILED` among them — is
 * genuinely ambiguous: the wire cannot distinguish "failed later, during
 * compute" from "failed for an unreported reason before either pass
 * finished", so both passes render `unknown` rather than assume the
 * optimistic reading. See the module doc comment's honesty notes.
 */
function axesBuiltPasses(run: LoopRunEntry | undefined): { readonly axes: PassInfo; readonly built: PassInfo } {
  const UNKNOWN = { axes: { id: 'axes' as const, state: 'unknown' as const }, built: { id: 'built' as const, state: 'unknown' as const } }
  if (run === undefined || run.outcome.runs.length === 0) return UNKNOWN
  const buildFailed = run.outcome.runs.some(entry => entry.status === 'failed' && entry.error?.code === 'BUILD_FAILED')
  if (buildFailed) return { axes: { id: 'axes', state: 'ok' }, built: { id: 'built', state: 'error' } }
  const allOk = run.outcome.runs.every(entry => entry.status === 'ok')
  if (allOk) return { axes: { id: 'axes', state: 'ok' }, built: { id: 'built', state: 'ok' } }
  return UNKNOWN
}

function postFlightPass(run: LoopRunEntry | undefined): PassInfo {
  const findings = run?.outcome.gates
  if (findings === undefined) return { id: 'post-flight', state: 'unknown' }
  if (findings.some(finding => finding.severity === 'refuse')) return { id: 'post-flight', state: 'error' }
  if (findings.some(finding => finding.severity === 'warn')) return { id: 'post-flight', state: 'warn' }
  return { id: 'post-flight', state: 'ok' }
}

export function validateStage(snapshot: LoopSnapshot): StageInfo {
  const validate = snapshot.validate
  const { axes, built } = axesBuiltPasses(snapshot.run)
  const passes: readonly PassInfo[] = [preFlightPass(validate), axes, built, postFlightPass(snapshot.run)]
  if (validate === undefined) {
    return { id: 'validate', label: 'Validate', state: 'idle', detail: NOT_YET_RECORDED, panelTarget: 'gates', passes }
  }
  if (validate.report.valid) {
    return { id: 'validate', label: 'Validate', state: 'ok', detail: 'valid', panelTarget: 'gates', passes }
  }
  const first = validate.report.errors[0]
  const detail = first === undefined ? 'invalid' : `${first.path || '<document>'} · ${first.code}`
  return { id: 'validate', label: 'Validate', state: 'error', detail, panelTarget: 'gates', passes }
}

const CHECK_STATE_RANK: Record<string, number> = { refuse: 4, warn: 3, report: 2, skip: 1, auto_skip: 1, off: 0 }

/** Prefer `state` (the effective, defaults-applied value) over `mode`; see `CheckCost`'s own doc comment. */
function effectiveCheckState(check: CheckCost): string {
  return check.state ?? check.mode
}

function isSkipLike(state: string): boolean {
  return state === 'skip' || state === 'auto_skip'
}

function worstCheckState(checks: readonly CheckCost[]): string | undefined {
  if (checks.length === 0) return undefined
  let worst = effectiveCheckState(checks[0]!)
  for (const check of checks) {
    const state = effectiveCheckState(check)
    if ((CHECK_STATE_RANK[state] ?? 0) > (CHECK_STATE_RANK[worst] ?? 0)) worst = state
  }
  return worst
}

export function gatesStage(snapshot: LoopSnapshot): StageInfo {
  const gates = snapshot.gates
  if (gates === undefined) {
    return { id: 'gates', label: 'Gates', state: 'idle', detail: NOT_YET_RECORDED, panelTarget: 'gates', stale: false }
  }
  const { checks } = gates.report
  const worst = worstCheckState(checks)
  const stale = checks.some(check => isSkipLike(effectiveCheckState(check)))
  const skipped = checks.filter(check => isSkipLike(effectiveCheckState(check))).length
  const state: StageState = worst === undefined
    ? 'idle'
    : worst === 'refuse'
      ? 'error'
      : worst === 'warn' || isSkipLike(worst)
        ? 'warn'
        : 'ok'
  const detail = `${checks.length} check${checks.length === 1 ? '' : 's'} · ${skipped} skipped`
  return { id: 'gates', label: 'Gates', state, detail, panelTarget: 'gates', stale }
}

export function runStage(snapshot: LoopSnapshot): StageInfo {
  const run = snapshot.run
  if (run === undefined || run.outcome.runs.length === 0) {
    return { id: 'run', label: 'Run', state: 'idle', detail: NOT_YET_RECORDED, panelTarget: 'posterior' }
  }
  const total = run.outcome.runs.length
  const ok = run.outcome.runs.filter(entry => entry.status === 'ok').length
  const took = run.outcome.tookMs === undefined ? '' : ` · ${formatMs(run.outcome.tookMs)}`
  return {
    id: 'run',
    label: 'Run',
    state: ok === total ? 'ok' : 'error',
    detail: `${ok}/${total} runs ok${took}`,
    panelTarget: 'posterior',
  }
}

type DiagVerdict = 'ok' | 'warn' | 'error'
const DIAG_RANK: Record<DiagVerdict, number> = { ok: 0, warn: 1, error: 2 }

interface DiagOffender {
  readonly name: string
  readonly metric: string
  readonly value?: number
  /** Present only for an offender found under `mcmc` — names which latent, so the stage detail line can say e.g. `fit: rhat[centre]=1.420` rather than leave the reader to guess. */
  readonly latent?: string
}

/** The worst (highest) numeric r_hat among a run's per-latent `mcmc` entries, with the latent it came from — `undefined` when `mcmc` is absent or reports no numeric r_hat at all. */
function worstMcmcRhat(mcmc: unknown): { readonly latent: string; readonly rhat: number } | undefined {
  let worst: { readonly latent: string; readonly rhat: number } | undefined
  for (const { latent, rhat } of mcmcLatents(mcmc)) {
    if (typeof rhat !== 'number') continue
    if (worst === undefined || rhat > worst.rhat) worst = { latent, rhat }
  }
  return worst
}

function runDiagVerdict(entry: RunEntry): { readonly verdict: DiagVerdict; readonly offender?: DiagOffender } {
  const diagnostics = entry.diagnostics
  if (diagnostics === undefined) return { verdict: 'ok' }
  if (typeof diagnostics.divergences === 'number' && diagnostics.divergences > 0) {
    return { verdict: 'error', offender: { name: entry.name, metric: 'divergences', value: diagnostics.divergences } }
  }
  if (diagnostics.converged === false) {
    return { verdict: 'error', offender: { name: entry.name, metric: 'converged' } }
  }
  // Both the scalar `rhat` and the worst per-latent r_hat under `mcmc`
  // participate at the SAME threshold — see the module doc comment's
  // honesty notes. Neither is preferred over the other; whichever is worse
  // (numerically higher) is the offender that names the stage's detail line,
  // so a run reporting both a fine scalar rhat and a bad per-latent one
  // still surfaces the bad latent, not the fine scalar.
  const scalarRhat = typeof diagnostics.rhat === 'number' ? diagnostics.rhat : undefined
  const worstLatent = worstMcmcRhat(diagnostics.mcmc)
  const candidates: DiagOffender[] = []
  if (scalarRhat !== undefined && scalarRhat > RHAT_WARN_ABOVE) {
    candidates.push({ name: entry.name, metric: 'rhat', value: scalarRhat })
  }
  if (worstLatent !== undefined && worstLatent.rhat > RHAT_WARN_ABOVE) {
    candidates.push({ name: entry.name, metric: 'rhat', value: worstLatent.rhat, latent: worstLatent.latent })
  }
  if (candidates.length === 0) return { verdict: 'ok' }
  const offender = candidates.reduce((worst, candidate) => ((candidate.value ?? -Infinity) > (worst.value ?? -Infinity) ? candidate : worst))
  return { verdict: 'warn', offender }
}

function formatOffender(offender: DiagOffender): string {
  if (offender.metric === 'converged') return `${offender.name}: converged=false`
  const value = offender.value
  const metricLabel = offender.latent === undefined ? offender.metric : `${offender.metric}[${offender.latent}]`
  return `${offender.name}: ${metricLabel}=${value === undefined ? '—' : formatDiagnostic(offender.metric, value)}`
}

export function diagnosticsStage(snapshot: LoopSnapshot): StageInfo {
  const run = snapshot.run
  const diagnosed = run === undefined ? [] : run.outcome.runs.filter(entry => entry.diagnostics !== undefined)
  if (diagnosed.length === 0) {
    return { id: 'diagnostics', label: 'Diagnostics', state: 'idle', detail: NOT_YET_RECORDED, panelTarget: 'chains' }
  }
  let worst: DiagVerdict = 'ok'
  let offending: DiagOffender | undefined
  for (const entry of diagnosed) {
    const { verdict, offender } = runDiagVerdict(entry)
    if (DIAG_RANK[verdict] > DIAG_RANK[worst]) {
      worst = verdict
      offending = offender
    }
  }
  const detail = offending === undefined
    ? `${diagnosed.length} run${diagnosed.length === 1 ? '' : 's'} diagnosed, no issues`
    : formatOffender(offending)
  return { id: 'diagnostics', label: 'Diagnostics', state: worst, detail, panelTarget: 'chains' }
}

/** Every stage in fixed display order: Author, Validate, Gates, Run, Diagnostics. */
export function loopStages(snapshot: LoopSnapshot): readonly StageInfo[] {
  return [authorStage(snapshot), validateStage(snapshot), gatesStage(snapshot), runStage(snapshot), diagnosticsStage(snapshot)]
}

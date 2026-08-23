/**
 * How far one TASK has got toward being trustworthy — read off the project
 * tree, not off any conversation.
 *
 * `docs/project-model.md` §11.4. The half of the old loop rail that belongs to
 * the task: it survives every session, because its evidence is on disk. The
 * other half — what THIS conversation just did — stays in the console, reading
 * the session log, and answers a different question.
 *
 * **Four stages, not five.** The old rail had a `validate` segment, and there
 * is deliberately none here: a validate that ran without publishing leaves
 * nothing on disk, so the stage would sit permanently blank and read as "this
 * task has never been validated" rather than "that is not recorded in the
 * tree". A stage that cannot be answered is worse than a stage that is absent.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/task-maturity
 */

import type { ConsoleExecutionView } from '@rheplicant/dsh-rheplicant-ui-kit/client'
import type { ProjectExecutionRow, ProjectTaskRow } from '@rheplicant/dsh-rheplicant'

/** How a stage reads. Shared vocabulary with the console's own rail. */
export type MaturityState = 'ok' | 'warn' | 'error' | 'idle'

/** One stage of a task's maturity. */
export interface MaturityStage {
  readonly id: 'document' | 'runs' | 'gates' | 'diagnostics'
  readonly label: string
  readonly state: MaturityState
  readonly detail: string
  /**
   * True when the authored document no longer digests to what ran, false when
   * it still does, and ABSENT when the comparison could not be made at all.
   *
   * Three values, not two: an execution whose sidecar recorded no digest, or a
   * document that could not be hashed, must not read as "changed" — that would
   * mark a perfectly fresh result stale forever.
   */
  readonly stale?: boolean
}

/** Everything the maturity rail is derived from. */
export interface MaturityInput {
  readonly task: ProjectTaskRow
  /** The task's newest execution, absent when it has never run. */
  readonly newest: ProjectExecutionRow | undefined
  /** That execution projected, absent when there is none to project. */
  readonly view: ConsoleExecutionView | undefined
  /** sha256 of the authored document, absent when it could not be computed. */
  readonly documentDigest: string | undefined
}

/** A run as the projection carries it, in the shape this module reads. */
interface ProjectedRun {
  readonly status?: string
  readonly diagnostics?: { readonly converged?: boolean | null } | undefined
}

/** A gate finding, in the shape this module reads. */
interface ProjectedGate {
  readonly severity?: string
}

/**
 * Whether the authored document still matches what ran.
 *
 * @returns `true`/`false` when both digests are known, `undefined` otherwise —
 *   the difference between "we compared" and "we could not".
 */
function staleness(input: MaturityInput): boolean | undefined {
  const ran = input.newest?.taskDigest
  if (ran === undefined || input.documentDigest === undefined) return undefined
  return ran !== input.documentDigest
}

/** Spread a stale flag only when there is one to state. */
function withStale(stale: boolean | undefined): { stale?: boolean } {
  return stale === undefined ? {} : { stale }
}

/**
 * The stages of one task's maturity.
 *
 * @param input - the task, its newest execution, that execution's projection,
 *   and the authored document's digest.
 * @returns the four stages, in reading order.
 */
export function taskMaturity(input: MaturityInput): readonly MaturityStage[] {
  const stale = staleness(input)
  const runs = (input.view?.runs ?? []) as readonly ProjectedRun[]
  const gates = (input.view?.gates ?? []) as readonly ProjectedGate[]
  const neverRan = input.newest === undefined

  return [
    {
      id: 'document',
      label: 'Document',
      state: 'ok',
      detail: `${input.task.bytes} bytes`,
      ...withStale(stale),
    },
    { id: 'runs', label: 'Runs', ...runStage(input, runs, neverRan), ...withStale(stale) },
    { id: 'gates', label: 'Gates', ...gateStage(gates, neverRan) },
    { id: 'diagnostics', label: 'Diagnostics', ...diagnosticsStage(runs, neverRan) },
  ]
}

/** The run stage's verdict, keeping the two status axes apart. */
function runStage(
  input: MaturityInput,
  runs: readonly ProjectedRun[],
  neverRan: boolean,
): { state: MaturityState; detail: string } {
  if (neverRan) return { state: 'idle', detail: 'never run' }
  // A results tree that could not be read says nothing about the runs, and
  // reporting "0 runs" would be an answer we do not have.
  if (input.view?.problem === 'unreadable' || input.view?.problem === 'unavailable') {
    return { state: 'warn', detail: 'results could not be read' }
  }
  if (input.view?.problem === 'loading') return { state: 'idle', detail: 'reading…' }
  // The PUBLICATION axis, separate from whether the runs themselves worked: a
  // refused publication means the results are not on disk, however well the
  // computation went.
  if (input.newest !== undefined && input.newest.status !== 'ok') {
    return { state: 'error', detail: `publication ${input.newest.status}` }
  }
  if (runs.length === 0) return { state: 'idle', detail: 'no runs recorded' }
  const ok = runs.filter(run => run.status === 'ok').length
  return {
    state: ok === runs.length ? 'ok' : 'error',
    detail: `${ok} / ${runs.length} runs ok`,
  }
}

/** The gate stage's verdict, worst severity wins. */
function gateStage(
  gates: readonly ProjectedGate[],
  neverRan: boolean,
): { state: MaturityState; detail: string } {
  if (neverRan) return { state: 'idle', detail: 'never run' }
  if (gates.length === 0) return { state: 'idle', detail: 'no findings recorded' }
  const refused = gates.filter(gate => gate.severity === 'refuse').length
  const warned = gates.filter(gate => gate.severity === 'warn').length
  if (refused > 0) return { state: 'error', detail: `${refused} refused` }
  if (warned > 0) return { state: 'warn', detail: `${warned} warned` }
  return { state: 'ok', detail: `${gates.length} reported, none blocking` }
}

/** The diagnostics stage's verdict over every run that carries them. */
function diagnosticsStage(
  runs: readonly ProjectedRun[],
  neverRan: boolean,
): { state: MaturityState; detail: string } {
  if (neverRan) return { state: 'idle', detail: 'never run' }
  const diagnosed = runs.filter(run => run.diagnostics?.converged !== undefined
    && run.diagnostics.converged !== null)
  // Nothing to believe is not the same as nothing to worry about, so this is
  // idle rather than ok.
  if (diagnosed.length === 0) return { state: 'idle', detail: 'nothing diagnosed' }
  const converged = diagnosed.filter(run => run.diagnostics?.converged === true).length
  return converged === diagnosed.length
    ? { state: 'ok', detail: `${converged} / ${diagnosed.length} converged` }
    : { state: 'warn', detail: `${diagnosed.length - converged} did not converge` }
}

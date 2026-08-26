/**
 * What the console header says, derived from one execution reference.
 *
 * `docs/project-model.md` §6.1. Every field here comes out of the published
 * path and the execution id, both of which the run event already carries — the
 * header asks the host for nothing. That is not an optimisation: a header that
 * needed a round trip would go blank exactly when results were unreachable,
 * which is the state it most needs to be able to describe.
 *
 * @module @rheplicant/dsh-rheplicant-ui-loop/client/project-selectors
 */

import type { ProjectExecutionRow } from '@rheplicant/dsh-rheplicant'
import type { LoopExecutionRef } from './loop-contract.ts'

/** `results` as it appears inside a published path, with separators around it. */
const RESULTS_SEGMENT = 'results'

/** `20260822T134501Z-3f9ac2b1-k7m2xq` -> the leading compact-UTC stamp. */
const EXECUTION_STAMP = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-/

/** Split a path on either separator, so a Windows-published tree still reads. */
function segments(path: string): string[] {
  return path.split(/[\\/]+/).filter(part => part !== '')
}

/** Index of the `results` segment that opens the execution tree, or -1. */
function resultsAt(parts: readonly string[]): number {
  // The LAST one: a project directory legitimately named `results` would
  // otherwise swallow the real boundary.
  return parts.lastIndexOf(RESULTS_SEGMENT)
}

/**
 * The project's own name: the directory holding `results/`.
 * @param resultsPath - an execution's absolute published path.
 * @returns the project directory's basename, or undefined when the path does
 *   not look like a published tree.
 */
export function projectName(resultsPath: string | undefined): string | undefined {
  if (resultsPath === undefined) return undefined
  const parts = segments(resultsPath)
  const at = resultsAt(parts)
  return at > 0 ? parts[at - 1] : undefined
}

/**
 * The task segment: everything between `results/` and the execution directory.
 * @param resultsPath - an execution's absolute published path.
 * @returns e.g. `tasks/global-signal-fit`, or undefined when unreadable.
 */
export function taskOf(resultsPath: string | undefined): string | undefined {
  if (resultsPath === undefined) return undefined
  const parts = segments(resultsPath)
  const at = resultsAt(parts)
  if (at < 0 || at + 2 > parts.length - 1) return undefined
  return parts.slice(at + 1, -1).join('/')
}

/**
 * The published path as the user would type it: project-relative, trailing slash.
 * @param resultsPath - an execution's absolute published path.
 * @returns e.g. `results/tasks/global-signal-fit/20260822T134501Z-…/`.
 */
export function projectRelativePath(resultsPath: string | undefined): string | undefined {
  if (resultsPath === undefined) return undefined
  const parts = segments(resultsPath)
  const at = resultsAt(parts)
  return at < 0 ? undefined : `${parts.slice(at).join('/')}/`
}

/**
 * The wall-clock time an execution id was minted, in UTC.
 *
 * Read off the id rather than a file's mtime: the id is what the run was named,
 * and an mtime describes when bytes last moved, which is a different fact.
 *
 * @param executionId - `<UTC compact>-<digest8>-<random6>`.
 * @returns `14:45:01`, or undefined for an id that carries no stamp.
 */
export function executionTime(executionId: string): string | undefined {
  const match = EXECUTION_STAMP.exec(executionId)
  return match === null ? undefined : `${match[4]}:${match[5]}:${match[6]}`
}

/**
 * The date an execution id was minted, in UTC.
 * @param executionId - `<UTC compact>-<digest8>-<random6>`.
 * @returns `2026-08-22`, or undefined for an id that carries no stamp.
 */
export function executionDate(executionId: string): string | undefined {
  const match = EXECUTION_STAMP.exec(executionId)
  return match === null ? undefined : `${match[1]}-${match[2]}-${match[3]}`
}

/** `tasks/demo.yaml` -> `tasks/demo`: the fallback when nothing was published. */
function taskStem(taskPath: string | undefined): string | undefined {
  if (taskPath === undefined) return undefined
  const parts = segments(taskPath)
  const last = parts.at(-1)
  if (last === undefined) return undefined
  const cut = last.lastIndexOf('.')
  return [...parts.slice(0, -1), cut > 0 ? last.slice(0, cut) : last].join('/')
}

/** One optional field, present only when it has a value. */
function maybe<K extends string>(key: K, value: string | undefined): Record<K, string> | object {
  return value === undefined ? {} : { [key]: value } as Record<K, string>
}

/**
 * The executions a picker offers: newest first.
 * @param executions - the snapshot's list, oldest first.
 * @returns a new array, newest first; never the input array.
 */
export function newestFirst(executions: readonly LoopExecutionRef[]): LoopExecutionRef[] {
  return [...executions].reverse()
}

/**
 * One execution as the header shows it, from either source.
 *
 * The two sources report DIFFERENT things and are kept apart on purpose. This
 * session's log knows whether a run inside the execution failed; the tree knows
 * whether the publication itself was refused. An execution can perfectly well
 * publish `ok` and contain a failed run, so folding them into one `status`
 * would make the header claim something neither source said.
 */
export interface HeaderExecution {
  readonly executionId: string
  readonly task?: string
  readonly path?: string
  readonly transport?: string
  /** From this session's log: did any run inside it fail? */
  readonly runsFailed?: boolean
  /** From the tree: how the publication itself ended. */
  readonly publication?: 'ok' | 'refused' | 'error'
  /** False for an execution some other session produced. */
  readonly fromThisSession: boolean
  /** The producing session, when the tree's sidecar recorded one. */
  readonly sessionId?: string
}

/** One of this session's own executions, in the header's shape. */
function fromOwn(ref: LoopExecutionRef): HeaderExecution {
  return {
    executionId: ref.executionId,
    ...maybe('task', taskOf(ref.resultsPath) ?? taskStem(ref.taskPath)),
    ...maybe('path', projectRelativePath(ref.resultsPath)),
    transport: ref.transport,
    runsFailed: ref.status === 'failed',
    fromThisSession: true,
  }
}

/**
 * The list the picker offers: the project's executions when the host can be
 * reached, this session's own when it cannot.
 *
 * An execution this session produced but the project listing does not carry —
 * an inline run that published nothing, or one whose tree has since been
 * pruned — is still offered. Dropping it would make a run vanish from the
 * console because its results moved, which is the failure this design exists to
 * prevent.
 *
 * @param own - this session's executions, oldest first.
 * @param project - the host's project-wide listing, or undefined when the
 *   project is not readable from here.
 * @returns one row per execution, newest first.
 */
export function mergeExecutions(
  own: readonly LoopExecutionRef[],
  project: readonly ProjectExecutionRow[] | undefined,
): HeaderExecution[] {
  const mine = new Map(own.map(ref => [ref.executionId, ref]))
  if (project === undefined) return newestFirst(own).map(fromOwn)
  const merged: HeaderExecution[] = project.map((row) => {
    const ours = mine.get(row.executionId)
    return {
      executionId: row.executionId,
      task: row.task,
      path: row.path,
      ...maybe('transport', row.transport ?? ours?.transport),
      ...(ours === undefined ? {} : { runsFailed: ours.status === 'failed' }),
      publication: row.status,
      fromThisSession: ours !== undefined,
      ...maybe('sessionId', row.sessionId),
    }
  })
  const listed = new Set(merged.map(row => row.executionId))
  for (const ref of own) {
    if (!listed.has(ref.executionId)) merged.push(fromOwn(ref))
  }
  // The id leads with a compact UTC stamp, so descending string order IS
  // newest-first across both sources without reading a clock.
  return merged.sort((left, right) => (left.executionId < right.executionId ? 1 : -1))
}

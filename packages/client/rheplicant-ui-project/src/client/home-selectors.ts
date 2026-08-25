/**
 * Pure derivations the workbench renders from — no React, no fetch, so the
 * rules that decide what a project LOOKS like can be tested without a DOM.
 *
 * The same split `ui-console/project-selectors.ts` makes for the header, and
 * for the same reason: these are the statements the UI makes about a project,
 * and a statement worth making is worth pinning.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/home-selectors
 */

import type { ProjectExecutionRow } from '@rheplicant/dsh-rheplicant'

/** Binary size units, ascending. */
const UNITS = ['B', 'kB', 'MB', 'GB', 'TB'] as const

/**
 * A file size a person can read at a glance.
 *
 * Binary steps (1024) with decimal-ish labels, which is what a filesystem
 * reports and therefore what matches the number an operator would see in a
 * terminal beside the same file.
 *
 * @param bytes - the size the host reported.
 * @returns the rendered size, or an em dash for a value that is not a size.
 *   A dash rather than `0 B` or `NaN B`: "we do not know" and "empty" are
 *   different facts about a file.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(1)} ${UNITS[unit]}`
}

/**
 * A task's `results/` segment: its path minus the extension.
 *
 * The browser-side twin of the host's `taskSegment`, deliberately spelled with
 * the same rule — only an extension on the LAST component counts, and the
 * whole relative path is kept, because two `demo.yaml` in different
 * directories are two different tasks whose executions must not be filed
 * together.
 *
 * @param path - the task's workspace-relative path, POSIX separators.
 * @returns the segment executions of that task are published under.
 */
export function taskSegmentOf(path: string): string {
  const cut = path.lastIndexOf('.')
  return cut > path.lastIndexOf('/') && cut > 0 ? path.slice(0, cut) : path
}

/** One task's executions, in the order the project reported them. */
export interface TaskExecutionGroup {
  readonly task: string
  readonly executions: readonly ProjectExecutionRow[]
}

/**
 * Every execution grouped under the task that produced it.
 *
 * Insertion order is preserved on both axes: the host lists executions
 * newest-first, so the first group is the most recently active task and the
 * first row in a group is that task's newest execution. Nothing here reads a
 * clock — the ordering is already encoded in the ids the host sorted by.
 *
 * @param executions - the project's executions, newest first.
 * @returns one group per task that has run at least once.
 */
export function groupExecutionsByTask(
  executions: readonly ProjectExecutionRow[],
): TaskExecutionGroup[] {
  const groups = new Map<string, ProjectExecutionRow[]>()
  for (const execution of executions) {
    const bucket = groups.get(execution.task)
    if (bucket === undefined) groups.set(execution.task, [execution])
    else bucket.push(execution)
  }
  return [...groups].map(([task, rows]) => ({ task, executions: rows }))
}

/** How many executions ended each way. */
export interface StatusCounts {
  readonly ok: number
  readonly refused: number
  readonly error: number
}

/**
 * Count the three outcomes.
 *
 * All three keys are always present, zeros included, so no caller has to
 * distinguish "none of these" from "this field was not sent" — and so the
 * three stay visibly separate. A refused PUBLICATION and a failed RUN are
 * different problems with different fixes, and a single "failed" total would
 * merge them.
 *
 * @param executions - the rows to count.
 * @returns the three counts.
 */
export function countByStatus(executions: readonly ProjectExecutionRow[]): StatusCounts {
  let ok = 0
  let refused = 0
  let error = 0
  for (const execution of executions) {
    if (execution.status === 'ok') ok += 1
    else if (execution.status === 'refused') refused += 1
    else error += 1
  }
  return { ok, refused, error }
}

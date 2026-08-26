/**
 * What the dashboard derives from the project cards — no React, no fetch, so
 * every rule here is testable as arithmetic.
 *
 * `docs/project-model.md` §25. Two disciplines carried in from the surfaces
 * this one summarises, because a summary is where they are easiest to lose:
 *
 * * **Run status and publication are different axes** (§8.2, §11.10). A count
 *   of executions is not a count of successes, and neither is a claim about
 *   freshness.
 * * **Absent is not zero.** A project that could not be read has no counts, and
 *   a card showing `0 tasks` for it would state something it does not know.
 *   Every total here is `undefined` for such a project, never 0.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/dashboard-selectors
 */

import type { ProjectExecutionRow, ProjectTaskRow } from '@rheplicant/dsh-rheplicant/types'
import type { ProjectCard } from './use-all-projects.ts'

/** One project's counts, or undefined throughout when it could not be read. */
export interface ProjectTotals {
  readonly tasks: number | undefined
  readonly inputs: number | undefined
  readonly executions: number | undefined
  /** Executions by how they ended — the three the tree's own names carry. */
  readonly ok: number | undefined
  readonly refused: number | undefined
  readonly error: number | undefined
  /**
   * True when a scan cap stopped the walk, so the counts are floors rather
   * than totals. Rendered, never swallowed: a listing that quietly dropped half
   * a project reads as a complete listing of a smaller project.
   */
  readonly truncated: boolean
}

/** Counts for one card. */
export function projectTotals(card: ProjectCard): ProjectTotals {
  const overview = card.overview
  if (overview === undefined) {
    return {
      tasks: undefined, inputs: undefined, executions: undefined,
      ok: undefined, refused: undefined, error: undefined, truncated: false,
    }
  }
  const by = (status: ProjectExecutionRow['status']): number =>
    overview.executions.filter(row => row.status === status).length
  return {
    tasks: overview.tasks.length,
    inputs: overview.inputs.length,
    executions: overview.executions.length,
    ok: by('ok'),
    refused: by('refused'),
    error: by('error'),
    truncated: overview.truncated,
  }
}

/** One execution, carrying the project it belongs to. */
export interface DashboardExecution extends ProjectExecutionRow {
  readonly workspaceId: string
  readonly project: string
}

/**
 * Every readable project's executions as one list, newest first.
 *
 * Ordered by `startedAt` DESCENDING, and rows without one sort last rather
 * than first: a missing timestamp means our sidecar never recorded it, and
 * putting unknowns at the top would let the least-described rows dominate the
 * view. Ties keep the order the projects were listed in, so the sort is stable
 * and a refresh does not reshuffle equal rows.
 */
export function allExecutions(cards: readonly ProjectCard[]): DashboardExecution[] {
  const rows: DashboardExecution[] = []
  for (const card of cards) {
    if (card.overview === undefined) continue
    for (const row of card.overview.executions) {
      rows.push({ ...row, workspaceId: card.workspaceId, project: card.overview.project })
    }
  }
  return rows.sort((left, right) => {
    if (left.startedAt === right.startedAt) return 0
    if (left.startedAt === undefined) return 1
    if (right.startedAt === undefined) return -1
    return left.startedAt < right.startedAt ? 1 : -1
  })
}

/**
 * Every exit kind these executions ran, in first-appearance order.
 *
 * The facet's vocabulary comes from the DATA — the kinds that actually ran —
 * and never from a list this repo keeps. §18.2 forbids a hand-maintained
 * catalogue of a grammar this repo does not own, and a filter offering a kind
 * nobody has run would be exactly that catalogue wearing a different name.
 *
 * Executions whose sidecar predates the `kinds` field contribute nothing here
 * and are excluded by any kind filter, which is why {@link matchesKind} treats
 * them as unknown rather than as a match.
 */
export function kindsPresent(rows: readonly DashboardExecution[]): string[] {
  const seen: string[] = []
  for (const row of rows) {
    for (const kind of row.kinds ?? []) {
      if (!seen.includes(kind)) seen.push(kind)
    }
  }
  return seen
}

/**
 * Whether a row belongs under one kind filter.
 *
 * An execution with NO recorded kinds matches no filter and is not smuggled
 * into every one: it is unknown, and a filter that included unknowns would
 * quietly answer "everything we cannot rule out" while looking like it
 * answered "everything that ran this".
 */
export function matchesKind(row: DashboardExecution, kind: string | undefined): boolean {
  if (kind === undefined) return true
  return (row.kinds ?? []).includes(kind)
}

/** One task, carrying the project it belongs to. */
export interface DashboardTask extends ProjectTaskRow {
  readonly workspaceId: string
  readonly project: string
}

/**
 * Every readable project's tasks as one list.
 *
 * Ordered by MODIFICATION, newest first — the question a setups listing
 * answers is "what am I working on", and that is the recency of the document,
 * not of any run. A task edited today with no execution belongs above one that
 * ran last week and has not been touched since; sorting by run recency would
 * bury exactly the task somebody is in the middle of defining.
 *
 * Ties keep project order, so the sort is stable across a refresh.
 */
export function allTasks(cards: readonly ProjectCard[]): DashboardTask[] {
  const rows: DashboardTask[] = []
  for (const card of cards) {
    if (card.overview === undefined) continue
    for (const task of card.overview.tasks) {
      rows.push({ ...task, workspaceId: card.workspaceId, project: card.overview.project })
    }
  }
  return rows.sort((left, right) => {
    if (left.modifiedAt === right.modifiedAt) return 0
    return left.modifiedAt < right.modifiedAt ? 1 : -1
  })
}

/**
 * Whether a task has never been run.
 *
 * `executionCount` is a count the project tree answered, so zero here really is
 * zero rather than unknown — an unreadable project contributes no tasks at all
 * (see {@link allTasks}), so there is no third state to confuse this with.
 */
export function neverRun(task: DashboardTask): boolean {
  return task.executionCount === 0
}

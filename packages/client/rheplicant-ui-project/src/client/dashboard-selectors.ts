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

import type { ProjectExecutionRow, ProjectTaskRow, ProjectTriggerRow } from '@rheplicant/dsh-rheplicant/types'
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

/** One outcome and how many executions ended that way. */
export interface OutcomePart {
  readonly status: 'ok' | 'refused' | 'error'
  readonly count: number
}

/**
 * How a project's executions ended, as the parts worth showing.
 *
 * `projectTotals` has computed `ok`/`refused`/`error` since it was written and
 * the card rendered none of them — three facts derived on every render and
 * dropped, while the surface showed a count of runs that says nothing about
 * whether any of them worked.
 *
 * **The three are exhaustive**, so the parts always sum to `executions`. Not
 * an assumption: `project-overview-client`'s `isExecution` refuses a row whose
 * status is not one of the three, and refuses the whole answer rather than
 * dropping the row — so a fourth status arriving from a newer host makes the
 * project unreadable, which is the state this returns nothing for.
 *
 * **Zero parts are dropped, and the whole is empty for a project with no
 * executions or none we could read.** `0 refused` is noise on a card; `—` is
 * already what an unreadable project shows, and repeating it here as three
 * more dashes would be three more places to read the same absence.
 *
 * @param totals - one card's counts.
 * @returns the non-zero outcomes, in the order the tree names them.
 */
export function outcomeParts(totals: ProjectTotals): OutcomePart[] {
  if (totals.executions === undefined || totals.executions === 0) return []
  const parts: OutcomePart[] = [
    { status: 'ok', count: totals.ok ?? 0 },
    { status: 'refused', count: totals.refused ?? 0 },
    { status: 'error', count: totals.error ?? 0 },
  ]
  return parts.filter(part => part.count > 0)
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

/**
 * Whether the project can say that a trigger's task is there.
 *
 * THREE states, and the third is the one a two-state answer would have lost.
 * A project whose overview never arrived has no task list to compare against,
 * and one whose scan was TRUNCATED has an incomplete one — so absence from the
 * list is not evidence of absence. Rendering either as "names a task that is
 * not here" would state a fact nothing established.
 *
 * Presence, by contrast, is conclusive in every case: a task that IS in a
 * truncated listing is in the project.
 */
export type TaskPresence = 'present' | 'missing' | 'unknown'

/** One trigger, carrying the project it belongs to and what became of its task. */
export interface DashboardTrigger extends ProjectTriggerRow {
  readonly workspaceId: string
  readonly project: string
  /**
   * What became of the task this names — ABSENT for a routine, which names none.
   *
   * Not a fourth value in {@link TaskPresence}, and not `unknown` either.
   * `unknown` is a real claim — *cannot tell if this task is here* — and making
   * it carry "there is no task to look for" would put two different facts under
   * one word, which is the collapse this surface exists to avoid. A routine has
   * no task, so it has no answer, so the field is not there.
   */
  readonly taskPresence?: TaskPresence
}

/**
 * One task path as this comparison spells it.
 *
 * The registry holds whatever the agent wrote — `tasks/fit.yaml`,
 * `./tasks/fit.yaml`, and on a Windows host possibly `tasks\fit.yaml`. The
 * listing's `path` is always workspace-relative POSIX with no prefix. Compared
 * raw, a trigger written with a leading `./` would report its own task missing,
 * which is the one state on this surface that must never be wrong.
 */
function samePathAs(path: string): string {
  return path.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '').replace(/^\/+/, '')
}

/** Whether one card's task list holds the task a trigger names. */
function presenceOf(card: ProjectCard, task: string): TaskPresence {
  const overview = card.overview
  const wanted = samePathAs(task)
  // Positive evidence first, and it is conclusive even from a partial listing.
  if (overview?.tasks.some(row => samePathAs(row.path) === wanted) === true) return 'present'
  if (overview === undefined || overview.truncated) return 'unknown'
  return 'missing'
}

/**
 * Every readable registry's triggers as one list, in registry order.
 *
 * A project whose registry is `absent` or `unreadable` contributes nothing —
 * `unreadable` is reported separately by {@link unreadableRegistries}, because
 * a corrupt file is a fact about the project rather than a trigger of its own.
 * The project NAME comes off the triggers body when it can, so a project whose
 * overview never arrived is still named correctly beside its schedules.
 */
export function allTriggers(cards: readonly ProjectCard[]): DashboardTrigger[] {
  const rows: DashboardTrigger[] = []
  for (const card of cards) {
    if (card.triggers?.state !== 'ok') continue
    const project = card.triggers.project === '' ? card.title : card.triggers.project
    for (const trigger of card.triggers.triggers) {
      rows.push({
        ...trigger,
        workspaceId: card.workspaceId,
        project,
        ...(trigger.task === undefined ? {} : { taskPresence: presenceOf(card, trigger.task) }),
      })
    }
  }
  return rows
}

/** One project whose registry exists and could not be read. */
export interface UnreadableRegistry {
  readonly workspaceId: string
  readonly project: string
  readonly reason: string
}

/**
 * Every project whose registry could not be read.
 *
 * Said out loud, never swallowed. `absent` and `unreadable` both mean nothing
 * will fire, and a surface that showed them the same way would render a corrupt
 * file as "this project has no schedules" — a confident answer to a question
 * nothing could answer.
 *
 * A project whose triggers ROUTE could not be reached at all is deliberately
 * NOT here: its card already says it could not be read, and saying it twice
 * would read as two faults.
 */
export function unreadableRegistries(cards: readonly ProjectCard[]): UnreadableRegistry[] {
  const rows: UnreadableRegistry[] = []
  for (const card of cards) {
    if (card.triggers?.state !== 'unreadable') continue
    rows.push({
      workspaceId: card.workspaceId,
      project: card.triggers.project === '' ? card.title : card.triggers.project,
      reason: card.triggers.reason ?? 'the host did not say why',
    })
  }
  return rows
}

/** The triggers that name one task, in registry order. */
export function triggersForTask(
  triggers: readonly DashboardTrigger[],
  task: DashboardTask,
): DashboardTrigger[] {
  const wanted = samePathAs(task.path)
  return triggers.filter(trigger =>
    trigger.workspaceId === task.workspaceId
    && trigger.task !== undefined
    && samePathAs(trigger.task) === wanted)
}

/**
 * Every routine on the dashboard, in registry order.
 *
 * **They render at the PROJECT, never under a task, and never as orphans.**
 * A routine names no task, so there is no row for it to sit on — but
 * {@link orphanTriggers} means *names a task that is not here*, and printing
 * that beside a routine would be a false statement rather than a missing one.
 * The three states are about a reference that may not resolve; a routine has no
 * reference at all.
 *
 * Flat across projects, like {@link orphanTriggers}: this surface lists every
 * project at once and each row names its own, so grouping here would be a
 * second arrangement of the same facts.
 *
 * @param triggers - every trigger on the dashboard.
 * @returns the routines, in registry order.
 */
export function routineTriggers(triggers: readonly DashboardTrigger[]): DashboardTrigger[] {
  return triggers.filter(trigger => trigger.action === 'routine')
}

/**
 * The triggers with no task row to sit on.
 *
 * `missing` and `unknown` both land here, because both lack a row to attach to
 * — but they are not the same claim, and the surface must render them
 * differently: one says the task is gone, the other says we cannot tell. This
 * is the state that made identity the trigger's own name rather than the task
 * path (design §3): keyed by path, such a trigger would be unrepresentable.
 */
export function orphanTriggers(triggers: readonly DashboardTrigger[]): DashboardTrigger[] {
  // A routine is never an orphan: `taskPresence` is absent because it names no
  // task, and the `!== 'present'` test alone would sweep every routine into a
  // list whose heading says the opposite.
  return triggers.filter(trigger =>
    trigger.taskPresence !== undefined && trigger.taskPresence !== 'present')
}

/**
 * Every trigger, ordered by WHEN — which is the question the board exists for.
 *
 * The Setups tab orders by project and task, because it answers *what does this
 * project have set up*. This orders by the clock, because it answers *what is
 * going to happen next*, and those are different enough questions that both
 * surfaces survive §28's rubric.
 *
 * **Disabled rows go last, in registry order, and are not dropped.** A disabled
 * trigger has no next fire, so it has no place on a timeline — but it is still
 * something the person set up, and hiding it would make the board answer "what
 * is scheduled" with a subset. It also has to be reachable, since the board's
 * one control is the switch that turns it back on.
 *
 * An overdue instant sorts naturally to the front because it is in the past;
 * nothing clamps it (§27.2), so a harness that was down across a window shows
 * exactly that.
 *
 * @param triggers - every trigger on the dashboard.
 * @returns the same rows, ordered by next fire and then by registry order.
 */
export function scheduleBoard(triggers: readonly DashboardTrigger[]): DashboardTrigger[] {
  return triggers.map((trigger, at) => ({ trigger, at })).sort((left, right) => {
    const a = left.trigger.nextFireAt === undefined ? undefined : Date.parse(left.trigger.nextFireAt)
    const b = right.trigger.nextFireAt === undefined ? undefined : Date.parse(right.trigger.nextFireAt)
    const aKnown = a !== undefined && !Number.isNaN(a)
    const bKnown = b !== undefined && !Number.isNaN(b)
    if (aKnown && bKnown && a !== b) return a - b
    // A row with no answer sinks, whatever the reason — disabled, or a
    // timestamp this build could not parse. Ties keep registry order, so the
    // board is stable across renders rather than re-sorting under the pointer.
    if (aKnown !== bKnown) return aKnown ? -1 : 1
    return left.at - right.at
  }).map(entry => entry.trigger)
}

/**
 * When a trigger next fires, as a phrase.
 *
 * `due now` covers both the never-fired trigger and the overdue one, because
 * they are the same fact — the next window is at or before now — and the
 * difference between them is not something a person can act on differently.
 * Note what it does NOT say: nothing here promises the run will happen, which
 * is why the surface prints "only while this harness is running" beside it.
 *
 * @param trigger - the row.
 * @param now - the reader's clock.
 * @returns a phrase for the next-fire cell.
 */
export function nextFireLabel(trigger: DashboardTrigger, now: number): string {
  if (!trigger.enabled) return 'disabled'
  const at = trigger.nextFireAt === undefined ? Number.NaN : Date.parse(trigger.nextFireAt)
  // An enabled trigger with no usable next fire cannot occur in a registry the
  // host read as `ok`, since an unusable cadence makes the whole file
  // unreadable. Answered anyway rather than assumed away: this value crossed a
  // process boundary.
  if (Number.isNaN(at)) return 'next fire unknown'
  const wait = at - now
  if (wait <= 0) return 'due now'
  if (wait < 60_000) return 'in under a minute'
  // The bucket is chosen by the number that will be PRINTED, not by the raw
  // span. Comparing the span and then rounding it separately says "in 60 min"
  // for the last second of the hour and "in 24 h" for the last second of the
  // day — a unit the ladder has a name for, printed in the one below it.
  const minutes = Math.round(wait / 60_000)
  if (minutes < 60) return `in ${minutes} min`
  const hours = Math.round(wait / 3_600_000)
  if (hours < 24) return `in ${hours} h`
  return `in ${Math.round(wait / 86_400_000)} d`
}

/**
 * How long ago an instant was, for the column a table sorts by.
 *
 * Both dashboard tables order on a timestamp neither displayed — `allTasks` on
 * `modifiedAt`, `allExecutions` on `startedAt` — so the rows arrived in an
 * order nothing on screen explained. This is that column.
 *
 * Relative, with the exact instant on `title`: "4 min ago" is the question a
 * person reading a listing is asking, and the ISO instant is the one they need
 * once they have picked a row. The ladder is {@link nextFireLabel}'s, pointing
 * the other way, down to choosing the bucket by the printed number.
 *
 * **Three answers, not two.** A timestamp we do not have and one we cannot
 * parse are both `unknown` — the surface can act on neither, and the rows they
 * belong to already sort last for the same reason. What is NOT collapsed is a
 * timestamp ahead of the reader's clock: within a minute that is ordinary skew
 * and reads as `just now`, and beyond it something is wrong with a clock and
 * saying `just now` would hide it.
 *
 * @param at - the ISO instant, or undefined when nothing recorded one.
 * @param now - the reader's clock.
 * @returns a phrase for the cell.
 */
export function sinceLabel(at: string | undefined, now: number): string {
  const instant = at === undefined ? Number.NaN : Date.parse(at)
  if (Number.isNaN(instant)) return 'unknown'
  const ago = now - instant
  if (ago < -60_000) return 'in the future'
  if (ago < 60_000) return 'just now'
  const minutes = Math.round(ago / 60_000)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(ago / 3_600_000)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(ago / 86_400_000)} d ago`
}

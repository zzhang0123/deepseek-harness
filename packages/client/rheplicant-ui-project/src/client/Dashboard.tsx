/**
 * The dashboard: every project at once, and every execution across them.
 *
 * `docs/project-model.md` §25, and the level `surface-model.md` §3 called the
 * global landing. It is a SCOPE, not a renderer — the workbench renders one
 * project's selection, this one answers "where is everything" — so it reads the
 * project folders (§5) and never the session log.
 *
 * A `section` occupant like the workbench, so the two are mutually exclusive by
 * construction: one store holds one section name (`home-store.ts`), and a nav
 * row switches the name. Both fill the centre column, so this page needs no
 * geometry of its own.
 *
 * WHAT IT DOES NOT SHOW, and why each absence is deliberate:
 *
 * * **No live-run badge.** The only live-job mirror dsh ships is keyed by the
 *   CURRENT session (`ui-jobs`'s `jobsBySession[sessionId]`), so a cross-project
 *   count of what is running cannot be computed here at all. An optimistic
 *   "0 running" would be a claim; the session-header disclosure (§23) is the
 *   surface that legitimately has that state.
 * * **No concurrency mark.** §9.4: publication takes a blocking exclusive lock,
 *   so overlapping executions leave two complete independent trees, and a badge
 *   would assert a hazard the lock says does not exist.
 * * **No archived-session filter.** §9.3: this surface does not address by
 *   session, so there is nothing to filter by.
 * * **No `manual` on a task with no trigger.** The trigger registry now exists
 *   (`docs/superpowers/specs/2026-08-26-trigger-registry-design.md`) and the
 *   Setups rows carry it — but a task nothing schedules renders an EMPTY
 *   schedule cell, not the word "manual". Nothing persists "this one is run by
 *   hand"; a column that said so on every unscheduled row would be an invented
 *   uniformity rather than a reading, which was §26.3's objection to the column
 *   and survives the entity that answered the rest of it.
 *
 * WHAT THE SETUPS TAB NOW SAYS ABOUT SCHEDULES, and why each part is load-bearing:
 *
 * * The cadence **verbatim** (`PT10M`), never rewritten as prose — it is what
 *   the person wrote and what `rheplicant_trigger` takes back.
 * * **"only while this harness is running"**, printed once above the rows and
 *   only when something is actually enabled. Design §6 makes this the first
 *   thing stated rather than the last: a schedule that silently does not run is
 *   worse than no schedule, and this surface is where somebody would otherwise
 *   conclude that it had.
 * * **"names a task that is not here"** for a trigger with no document. This is
 *   the entire reason identity is `(workspace, triggerName)` and not the task
 *   path (design §3): keyed by path, such a trigger would be unrepresentable
 *   rather than merely wrong.
 * * A registry that could not be READ says so, per project. `absent` and
 *   `unreadable` are not the same fact, and a corrupt file rendered as "no
 *   schedules" is the failure the whole design leads with.
 *
 * TWO TABS OVER ONE SCOPE, which is a decision against this document's own
 * earlier sketch. `surface-model.md` §2 drew Tasks as a separate sidebar entry;
 * §3 drew it as the SETUPS half of a setups/runs split, on the desired-state
 * versus observed-state model. §3 wins: it is the same scope and the same fetch
 * read two ways, so a second nav row would say it is a different PLACE. It also
 * keeps the nav short, which is the thing every surveyed platform got wrong by
 * degrees.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/Dashboard
 */
import { memo, useMemo, useState } from 'react'
import { Badge } from '@rheplicant/dsh-rheplicant-ui-kit/client'
import { shortExecutionId } from '@rheplicant/dsh-rheplicant-ui-kit/client'
import { showSection, useHome } from './home-store.ts'
import { canRevealWorkspace, revealWorkspace } from './navigate.ts'
import { IconFolder } from './ActionIcons.tsx'
import { selectInProject } from './selection.ts'
import { taskPathForSegment } from './home-selectors.ts'
import { useAllProjects } from './use-all-projects.ts'
import { tabListKeyHandler, tabPanelProps, tabProps } from './tabs.ts'
import {
  allExecutions, allTasks, allTriggers, kindsPresent, matchesKind, neverRun,
  nextFireLabel, outcomeParts, projectTotals, sinceLabel, triggersForTask,
  unreadableRegistries,
  type DashboardExecution, type DashboardTask, type DashboardTrigger,
} from './dashboard-selectors.ts'
import styles from './dashboard.module.css'

/** One workspace row, as the registry hands it over. */
interface WorkspaceRow {
  readonly workspaceId: string
  readonly title: string
  /**
   * The project's directory on the host.
   *
   * Read for the reveal control and NEVER sent anywhere: it is handed straight
   * back to `ctx.workspaces.openPath`, which is the host's own face for a path
   * the host itself minted. Nothing here assembles a path from parts.
   */
  readonly path?: string
}

interface DashboardProps {
  useWorkspaces: <T>(selector: (state: { items: readonly WorkspaceRow[] }) => T) => T
}

/**
 * A file size a person can read.
 *
 * It was `{task.bytes} B` — `2945 B` — which is a number in the unit the
 * filesystem happens to count in, not the one anybody thinks in.
 *
 * @param bytes - the document's size.
 * @returns the size with a unit.
 */
function fileSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} kB`
}

/** A count, or an em dash when the project could not be read. */
const Count = memo(function Count({ label, value }: { label: string; value: number | undefined }) {
  return (
    <span className={styles.count} data-count={label}>
      <span className={styles.countValue}>{value ?? '—'}</span>
      <span className={styles.countLabel}>{label}</span>
    </span>
  )
})

/**
 * When something last happened, in the column its table is ordered by.
 *
 * The phrase is relative because that is the question a listing answers; the
 * exact instant is on `title` because that is the question the row a reader
 * picks then answers. `unknown` gets no `title` — there is nothing exact
 * underneath it, and a tooltip repeating the word would promise there was.
 */
const Since = memo(function Since({ at, now }: { at: string | undefined; now: number }) {
  const phrase = sinceLabel(at, now)
  return (
    <span
      className={styles.rowSince}
      data-row-since={phrase}
      {...(phrase === 'unknown' ? {} : { title: at })}
    >
      {phrase}
    </span>
  )
})

/**
 * One trigger's identity, cadence and next fire.
 *
 * The cadence is rendered VERBATIM rather than as prose. `PT10M` is what the
 * person wrote, what the registry holds and what `rheplicant_trigger` accepts
 * back; "every ten minutes" would be a translation this surface would then own
 * for every duration the grammar allows.
 */
const Schedule = memo(function Schedule({ trigger, now }: { trigger: DashboardTrigger; now: number }) {
  return (
    <span
      className={styles.trigger}
      data-trigger={trigger.name}
      // A disabled trigger rendered IDENTICALLY to a live one: this span read
      // name + cadence + next fire and never read `enabled`, so the only signal
      // was `nextFireLabel` answering the word "disabled" in the same grey as
      // everything beside it.
      data-trigger-enabled={String(trigger.enabled)}
    >
      <span className={styles.triggerName}>{trigger.name}</span>
      {/* Verbatim, and the KIND is marked because it is the difference a person
          acts on: an interval is measured from the last attempt and drifts when
          the harness was down, a wall clock does not. */}
      <code className={styles.cadence} data-cadence-kind={trigger.cadenceKind}>
        {trigger.cadenceKind === 'dailyAt' ? `@${trigger.cadence}` : trigger.cadence}
      </code>
      <span className={styles.fire}>{nextFireLabel(trigger, now)}</span>
    </span>
  )
})

/**
 * The tree's three status names onto the badge's vocabulary.
 *
 * `refused` is `warn` and `error` is `failed`, and the difference between them
 * is kept rather than flattened: a refusal is rheplicant declining to run
 * something it judged unsound, an error is the run breaking. The badge TEXT is
 * the tree's own word either way, so the distinction survives even where the
 * colour does not.
 */
const STATUS_STATE = {
  ok: 'ok', refused: 'warn', error: 'failed',
} as const

/**
 * The two tabs, in the order the row shows them, and the row's own name.
 *
 * A list rather than two literals because the arrow keys move along it — see
 * `tabs.ts`. The name is a document-wide id prefix, so it carries the plugin.
 */
const TABS = ['setups', 'runs'] as const
type DashboardTab = typeof TABS[number]
const TAB_GROUP = 'rheplicant-dashboard'

export const Dashboard = memo(function Dashboard({ useWorkspaces }: DashboardProps) {
  const { section } = useHome()
  const [nonce, setNonce] = useState(0)
  const [tab, setTab] = useState<DashboardTab>('runs')
  const [kind, setKind] = useState<string | undefined>(undefined)
  const workspaces = useWorkspaces(state => state.items)
  const { loading, cards } = useAllProjects(workspaces, nonce)

  const rows = useMemo(() => allExecutions(cards), [cards])
  const kinds = useMemo(() => kindsPresent(rows), [rows])
  const shown = useMemo(() => rows.filter(row => matchesKind(row, kind)), [rows, kind])
  const tasks = useMemo(() => allTasks(cards), [cards])
  const triggers = useMemo(() => allTriggers(cards), [cards])
  // Asked at render, never cached — the host description arrives with the
  // connection and again after every reconnect.
  const revealable = canRevealWorkspace()
  const pathOf = (workspaceId: string): string | undefined =>
    workspaces.find(row => row.workspaceId === workspaceId)?.path
  const unreadable = useMemo(() => unreadableRegistries(cards), [cards])
  // Read once per answer, not once per render: every "in 8 min" on the page
  // then describes the same instant, and the labels move when the data does
  // rather than drifting under a component that happened to re-render.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `cards` is the
  // arrival of new data, which is exactly when this clock should be re-read.
  const now = useMemo(() => Date.now(), [cards])

  if (section !== 'dashboard') return null

  /** Open one task in the workbench, on its own project. */
  const openTask = (task: DashboardTask): void => {
    // The task without an execution: a setups row is about the DEFINITION, so
    // it selects the document and leaves whatever execution the workbench had
    // for that project alone rather than clearing it to nothing.
    selectInProject(task.workspaceId, { taskPath: task.path })
    showSection('workbench', task.workspaceId)
  }

  /** Open one execution in the workbench, on its own project. */
  const open = (row: DashboardExecution): void => {
    // `row.task` is the sidecar's task SEGMENT (`demo_small`), and the task
    // axis holds a PATH (`demo_small.yaml`). Passing the first as the second
    // is what made a reader arriving here with an execution chosen still be
    // asked which task it was: the workbench looked the segment up in a
    // listing of paths and found nothing.
    //
    // This card carries that project's own listing, so the join is available
    // right here. When the walk was truncated and the owner is not in it, the
    // execution travels ALONE — the workbench resolves what it can from its
    // own listing, and a path this surface cannot verify is not one to invent.
    const listing = cards.find(card => card.workspaceId === row.workspaceId)?.overview?.tasks ?? []
    const owner = taskPathForSegment(listing, row.task)
    // Both, and in this order: selecting without showing moves a view nobody
    // can see, showing without selecting lands somebody on whatever was
    // already chosen (§20.6).
    selectInProject(row.workspaceId, {
      ...(owner === undefined ? {} : { taskPath: owner }),
      executionId: row.executionId,
    })
    showSection('workbench', row.workspaceId)
  }

  return (
    <div className={styles.layer} data-rheplicant-dashboard="">
      <section className={styles.page} aria-label="Dashboard">
        <header className={styles.head}>
          {/* ON THE SAME MEASURE AS THE BODY. The header padded against the
              full column while `.measure` clamped the content to 78rem and
              centred it, so the page had two left edges — the title started
              somewhere the first table row did not. */}
          <div className={styles.headInner}>
            <div className={styles.title}>
              <span className={styles.eyebrow}>all projects</span>
              <span className={styles.name}>{workspaces.length} in this harness</span>
            </div>
            <button
              type="button"
              className={styles.action}
              data-dashboard-refresh=""
              disabled={loading}
              aria-busy={loading}
              onClick={() => { setNonce(current => current + 1) }}
            >
              {loading ? 'Reading…' : 'Refresh'}
            </button>
          </div>
        </header>

        <div className={styles.body}>
         {/* A measure rather than the window — see `.measure`. */}
         <div className={styles.measure}>
          {workspaces.length === 0
            ? (
              <p className={styles.empty} data-dashboard-empty>
                No projects yet. Open a workspace to start one.
              </p>
              )
            : (
              <>
                {/* The grid was unlabelled. An eyebrow costs one line and
                    says what the tiles below it are, which is the one thing a
                    reader arriving at this surface does not know. */}
                <p className={styles.partTitle}>Projects</p>
                <ul className={styles.cards} data-dashboard-cards>
                  {cards.map((card) => {
                    const totals = projectTotals(card)
                    return (
                      <li key={card.workspaceId} className={styles.card} data-project-card={card.title}>
                        <div className={styles.cardHead}>
                          <button
                            type="button"
                            className={styles.cardOpen}
                            onClick={() => { showSection('workbench', card.workspaceId) }}
                          >
                            {card.title}
                          </button>
                          {/* A project IS a directory, so the card is where a
                              way into it belongs. Rendered only when the host
                              can actually open one — on a headless host or a
                              page served to anything but loopback this is
                              absent rather than dead (see `canRevealWorkspace`). */}
                          {revealable && pathOf(card.workspaceId) !== undefined && (
                            <button
                              type="button"
                              className={styles.cardReveal}
                              title={pathOf(card.workspaceId)}
                              aria-label={`Show ${card.title} in the file manager`}
                              data-project-reveal={card.title}
                              onClick={() => { void revealWorkspace(pathOf(card.workspaceId)!) }}
                            >
                              <IconFolder size={14} />
                            </button>
                          )}
                        </div>
                        {card.overview === undefined
                          ? (
                            // Not "empty": the answer never arrived. An empty
                            // project answers with empty lists, and saying "0
                            // tasks" here would state something unknown.
                            <span className={styles.unread} data-card-unread>
                              {loading ? 'reading…' : 'could not be read from here'}
                            </span>
                            )
                          : (
                            <span className={styles.counts}>
                              <Count label="tasks" value={totals.tasks} />
                              <Count label="inputs" value={totals.inputs} />
                              <Count label="executions" value={totals.executions} />
                              {/* HOW those executions ended. `projectTotals`
                                  has derived this on every render since it was
                                  written and the card threw it away, so the
                                  one number a project card gave about running
                                  anything said nothing about whether it
                                  worked.

                                  Its own line rather than three more columns:
                                  at a third of a card's width "1 refused" does
                                  not fit, and the counts row is three
                                  quantities of three different things while
                                  this is one quantity split three ways. */}
                              {outcomeParts(totals).length > 0 && (
                                <span className={styles.outcomes} data-card-outcomes>
                                  {outcomeParts(totals).map(part => (
                                    <span
                                      key={part.status}
                                      className={styles.outcome}
                                      data-outcome={part.status}
                                    >
                                      {part.count} {part.status}
                                    </span>
                                  ))}
                                </span>
                              )}
                              {/* Its own line inside the grid, not a fourth
                                  column: a warning about the listing is not a
                                  statistic, and as a stretched flex item it
                                  used to grow to the full row height. */}
                              {totals.truncated && (
                                <span className={styles.partial}>
                                  <Badge state="warn">partial listing</Badge>
                                </span>
                              )}
                            </span>
                            )}
                      </li>
                    )
                  })}
                </ul>

                <div className={styles.tableHead}>
                  {/* Desired state beside observed state: the same scope read
                      two ways (`surface-model.md` §3), not two places. */}
                  <div
                    className={styles.tabs}
                    role="tablist"
                    aria-label="Dashboard view"
                    onKeyDown={tabListKeyHandler(TAB_GROUP, TABS, tab, setTab)}
                  >
                    <button
                      type="button"
                      className={styles.tab}
                      data-dashboard-tab="setups"
                      {...tabProps(TAB_GROUP, tab, 'setups')}
                      onClick={() => { setTab('setups') }}
                    >
                      Setups
                    </button>
                    <button
                      type="button"
                      className={styles.tab}
                      data-dashboard-tab="runs"
                      {...tabProps(TAB_GROUP, tab, 'runs')}
                      onClick={() => { setTab('runs') }}
                    >
                      Runs
                    </button>
                  </div>
                  {tab === 'runs' && kinds.length > 0 && (
                    <label className={styles.filter}>
                      {/* "Analysis", never "exit": that word is the grammar's
                          own and reads as an exit code on a run table. The
                          VALUES are upstream's, verbatim. */}
                      <span className={styles.filterLabel}>Analysis</span>
                      <select
                        className={styles.filterSelect}
                        data-dashboard-kind-filter=""
                        value={kind ?? ''}
                        onChange={(event) => {
                          setKind(event.target.value === '' ? undefined : event.target.value)
                        }}
                      >
                        <option value="">all</option>
                        {kinds.map(name => <option key={name} value={name}>{name}</option>)}
                      </select>
                    </label>
                  )}
                  {/* Neither table said how big it was, and the filtered one
                      never said what it was hiding. */}
                  <span className={styles.tableCount}>
                    {tab === 'setups'
                      ? `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`
                      : kind === undefined
                        ? `${rows.length} ${rows.length === 1 ? 'run' : 'runs'}`
                        : `${shown.length} of ${rows.length} runs`}
                  </span>
                </div>

                {tab === 'setups' && (
                  <div className={styles.tabPanel} {...tabPanelProps(TAB_GROUP, 'setups')}>
                    {/* A registry that EXISTS and could not be read. Said out
                        loud per project: `absent` and `unreadable` both mean
                        nothing fires, and showing them the same way would
                        render a corrupt file as "no schedules here". */}
                    {unreadable.length > 0 && (
                      <ul className={styles.notices} data-trigger-unreadable>
                        {unreadable.map(entry => (
                          <li key={entry.workspaceId} className={styles.notice}>
                            <Badge state="warn">schedules unreadable</Badge>
                            <span>
                              {entry.project}: {entry.reason}. Nothing in it will fire.
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Design §6's first non-negotiable, and the reason it is
                        printed rather than assumed: someone who reads "every
                        10 minutes" and closes the app will otherwise be wrong
                        about what happened. Shown only when something is
                        actually enabled — a caveat about firing has nothing to
                        qualify when nothing fires. */}
                    {triggers.some(trigger => trigger.enabled) && (
                      <p className={styles.caveat} data-trigger-caveat>
                        Triggers fire only while this harness is running.
                      </p>
                    )}

                    {tasks.length === 0
                      ? (
                        <p className={styles.empty} data-tasks-empty>
                          {loading ? 'Reading projects…' : 'No task documents yet in any project.'}
                        </p>
                        )
                      : (
                        <ul className={styles.rows} data-table="setups" data-dashboard-tasks>
                          {/* Ten unlabelled columns across two tables, and not
                              one of them said what it held. `aria-hidden`: the
                              rows are buttons, not cells, so this is a visual
                              header rather than a table header — announcing it
                              would give a screen reader a row of orphan words. */}
                          <li className={styles.headRow} aria-hidden="true">
                            <span>Task</span>
                            <span className={styles.numeric}>Size</span>
                            <span>Schedule</span>
                            {/* The column this table is ORDERED by, which it
                                spent its whole life not showing. */}
                            <span>Modified</span>
                            <span>Project</span>
                            <span />
                          </li>
                          {tasks.map(task => (
                            <li key={`${task.workspaceId} ${task.path}`} className={styles.row}>
                              <button
                                type="button"
                                className={styles.taskOpen}
                                data-task-open={task.path}
                                onClick={() => { openTask(task) }}
                              >
                                <span className={styles.rowTask}>{task.path}</span>
                                <span className={styles.rowSize}>{fileSize(task.bytes)}</span>
                                {/* EMPTY for a task nothing schedules, never
                                    "manual": nothing persists "this one is run
                                    by hand", and a word on every unscheduled
                                    row would be an invented uniformity. */}
                                <span className={styles.rowTriggers}>
                                  {triggersForTask(triggers, task).map(trigger => (
                                    <Schedule key={trigger.name} trigger={trigger} now={now} />
                                  ))}
                                </span>
                                <Since at={task.modifiedAt} now={now} />
                                {/* LAST, not first. It led both tables while
                                    being the deliberately de-emphasised value,
                                    and in a one-project harness that is the
                                    same grey word opening every row. The
                                    Schedules board already orders it this
                                    way. */}
                                <span className={styles.rowProject}>{task.project}</span>
                                {/* A count the tree answered, so zero really is
                                    zero — an unreadable project contributes no
                                    tasks at all, so there is no unknown here to
                                    confuse with none. */}
                                {neverRun(task)
                                  ? <Badge state="off">never run</Badge>
                                  : (
                                    <Badge state="ok">
                                      {task.executionCount === 1 ? '1 execution' : `${task.executionCount} executions`}
                                    </Badge>
                                    )}
                              </button>
                            </li>
                          ))}
                        </ul>
                        )}

                    {/* Routines and orphaned triggers used to render here.
                        They moved to the Schedules board (§27.6) because
                        neither belongs to a TASK: a routine names none, and an
                        orphan names one that is not in the listing above. What
                        stays is the schedule CELL on each task row, which
                        answers "is the task I am looking at scheduled" — a
                        question about the task, and one this surface is the
                        right place for. */}
                  </div>
                )}

                {tab === 'runs' && (
                  <div className={styles.tabPanel} {...tabPanelProps(TAB_GROUP, 'runs')}>
                    {shown.length === 0
                      ? (
                        <p className={styles.empty} data-executions-empty>
                          {loading
                            ? 'Reading projects…'
                            : kind === undefined
                              ? 'No executions yet in any project.'
                              : `No execution recorded a ${kind} run.`}
                        </p>
                        )
                      : (
                        <ul className={styles.rows} data-table="runs" data-dashboard-executions>
                          <li className={styles.headRow} aria-hidden="true">
                            <span>Task</span>
                            <span>Analysis</span>
                            <span>Execution</span>
                            {/* Ditto: `allExecutions` sorts on this. */}
                            <span>Started</span>
                            <span>Project</span>
                            <span />
                          </li>
                          {shown.map(row => (
                            <li key={`${row.workspaceId} ${row.executionId}`} className={styles.row}>
                              <button
                                type="button"
                                className={styles.rowOpen}
                                data-execution-open={row.executionId}
                                onClick={() => { open(row) }}
                              >
                                <span className={styles.rowTask}>{row.task}</span>
                                <span className={styles.rowKinds}>
                                  {/* CHIPS, not a joined string. `forward · fisher
                                      · nuts` in a cell that ellipsises truncates
                                      mid-word and gives the eye nothing to land on;
                                      three bordered marks are three values.

                                      Absent is not empty: a sidecar written before
                                      the field existed records nothing, and "no
                                      analyses" would be false about a run that had
                                      several. */}
                                  {row.kinds === undefined
                                    ? <span className={styles.rowNone}>—</span>
                                    : row.kinds.map(name => (
                                      <span key={name} className={styles.kindChip}>{name}</span>
                                    ))}
                                </span>
                                <span className={styles.rowId}>{shortExecutionId(row.executionId)}</span>
                                <Since at={row.startedAt} now={now} />
                                {/* LAST — see the setups row. */}
                                <span className={styles.rowProject}>{row.project}</span>
                                <Badge state={STATUS_STATE[row.status]}>{row.status}</Badge>
                              </button>
                            </li>
                          ))}
                        </ul>
                        )}
                  </div>
                )}
              </>
              )}
         </div>
        </div>
      </section>
    </div>
  )
})

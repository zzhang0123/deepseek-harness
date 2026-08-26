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
import { selectInProject } from './selection.ts'
import { useAllProjects } from './use-all-projects.ts'
import {
  allExecutions, allTasks, allTriggers, kindsPresent, matchesKind, neverRun,
  nextFireLabel, orphanTriggers, projectTotals, triggersForTask, unreadableRegistries,
  type DashboardExecution, type DashboardTask, type DashboardTrigger,
} from './dashboard-selectors.ts'
import styles from './dashboard.module.css'

/** One workspace row, as the registry hands it over. */
interface WorkspaceRow {
  readonly workspaceId: string
  readonly title: string
}

interface DashboardProps {
  useWorkspaces: <T>(selector: (state: { items: readonly WorkspaceRow[] }) => T) => T
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
 * One trigger's identity, cadence and next fire.
 *
 * The cadence is rendered VERBATIM rather than as prose. `PT10M` is what the
 * person wrote, what the registry holds and what `rheplicant_trigger` accepts
 * back; "every ten minutes" would be a translation this surface would then own
 * for every duration the grammar allows.
 */
const Schedule = memo(function Schedule({ trigger, now }: { trigger: DashboardTrigger; now: number }) {
  return (
    <span className={styles.trigger} data-trigger={trigger.name}>
      <span className={styles.triggerName}>{trigger.name}</span>
      <code className={styles.cadence}>{trigger.every}</code>
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

export const Dashboard = memo(function Dashboard({ useWorkspaces }: DashboardProps) {
  const { section } = useHome()
  const [nonce, setNonce] = useState(0)
  const [tab, setTab] = useState<'setups' | 'runs'>('runs')
  const [kind, setKind] = useState<string | undefined>(undefined)
  const workspaces = useWorkspaces(state => state.items)
  const { loading, cards } = useAllProjects(workspaces, nonce)

  const rows = useMemo(() => allExecutions(cards), [cards])
  const kinds = useMemo(() => kindsPresent(rows), [rows])
  const shown = useMemo(() => rows.filter(row => matchesKind(row, kind)), [rows, kind])
  const tasks = useMemo(() => allTasks(cards), [cards])
  const triggers = useMemo(() => allTriggers(cards), [cards])
  const orphans = useMemo(() => orphanTriggers(triggers), [triggers])
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
    // Both, and in this order: selecting without showing moves a view nobody
    // can see, showing without selecting lands somebody on whatever was
    // already chosen (§20.6).
    selectInProject(row.workspaceId, { taskPath: row.task, executionId: row.executionId })
    showSection('workbench', row.workspaceId)
  }

  return (
    <div className={styles.layer} data-rheplicant-dashboard="">
      <section className={styles.page} aria-label="Dashboard">
        <header className={styles.head}>
          <div className={styles.title}>
            <span className={styles.eyebrow}>all projects</span>
            <span className={styles.name}>{workspaces.length} in this harness</span>
          </div>
          <button
            type="button"
            className={styles.action}
            data-dashboard-refresh=""
            onClick={() => { setNonce(current => current + 1) }}
          >
            Refresh
          </button>
        </header>

        <div className={styles.body}>
          {workspaces.length === 0
            ? (
              <p className={styles.empty} data-dashboard-empty>
                No projects yet. Open a workspace to start one.
              </p>
              )
            : (
              <>
                <ul className={styles.cards} data-dashboard-cards>
                  {cards.map((card) => {
                    const totals = projectTotals(card)
                    return (
                      <li key={card.workspaceId} className={styles.card} data-project-card={card.title}>
                        <button
                          type="button"
                          className={styles.cardOpen}
                          onClick={() => { showSection('workbench', card.workspaceId) }}
                        >
                          {card.title}
                        </button>
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
                              {totals.truncated && (
                                <Badge state="warn">partial listing</Badge>
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
                  <div className={styles.tabs} role="tablist" aria-label="Dashboard view">
                    <button
                      type="button"
                      role="tab"
                      className={styles.tab}
                      data-dashboard-tab="setups"
                      aria-selected={tab === 'setups'}
                      onClick={() => { setTab('setups') }}
                    >
                      Setups
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={styles.tab}
                      data-dashboard-tab="runs"
                      aria-selected={tab === 'runs'}
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
                </div>

                {tab === 'setups' && (
                  <>
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
                        <ul className={styles.rows} data-dashboard-tasks>
                          {tasks.map(task => (
                            <li key={`${task.workspaceId} ${task.path}`} className={styles.row}>
                              <button
                                type="button"
                                className={styles.taskOpen}
                                data-task-open={task.path}
                                onClick={() => { openTask(task) }}
                              >
                                <span className={styles.rowProject}>{task.project}</span>
                                <span className={styles.rowTask}>{task.path}</span>
                                <span className={styles.rowId}>{task.bytes} B</span>
                                {/* EMPTY for a task nothing schedules, never
                                    "manual": nothing persists "this one is run
                                    by hand", and a word on every unscheduled
                                    row would be an invented uniformity. */}
                                <span className={styles.rowTriggers}>
                                  {triggersForTask(triggers, task).map(trigger => (
                                    <Schedule key={trigger.name} trigger={trigger} now={now} />
                                  ))}
                                </span>
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

                    {/* Triggers with no row above to sit on. This is the entire
                        reason a trigger is identified by its own name and not
                        by the task path (design §3): keyed by path, a trigger
                        whose document was renamed away would be a trigger for
                        nothing, and unrepresentable rather than merely wrong. */}
                    {orphans.length > 0 && (
                      <>
                        <p className={styles.caption} data-orphan-caption>
                          Scheduled, with no document in the listing above
                        </p>
                        <ul className={styles.rows} data-dashboard-orphan-triggers>
                          {orphans.map(trigger => (
                            <li key={`${trigger.workspaceId} ${trigger.name}`} className={styles.row}>
                              <div className={styles.orphanRow} data-orphan-trigger={trigger.name}>
                                <span className={styles.rowProject}>{trigger.project}</span>
                                <span className={styles.rowTask}>{trigger.task}</span>
                                <span className={styles.rowTriggers}>
                                  <Schedule trigger={trigger} now={now} />
                                </span>
                                {/* "gone" and "cannot tell" are different
                                    claims and must not share a rendering: the
                                    second happens when the project could not be
                                    listed, or when a scan cap truncated it, and
                                    absence from a partial list is not evidence
                                    of absence. */}
                                {trigger.taskPresence === 'missing'
                                  ? <Badge state="failed">names a task that is not here</Badge>
                                  : <Badge state="off">cannot tell if this task is here</Badge>}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </>
                )}

                {tab === 'runs' && (shown.length === 0
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
                    <ul className={styles.rows} data-dashboard-executions>
                      {shown.map(row => (
                        <li key={`${row.workspaceId} ${row.executionId}`} className={styles.row}>
                          <button
                            type="button"
                            className={styles.rowOpen}
                            data-execution-open={row.executionId}
                            onClick={() => { open(row) }}
                          >
                            <span className={styles.rowProject}>{row.project}</span>
                            <span className={styles.rowTask}>{row.task}</span>
                            <span className={styles.rowKinds}>
                              {/* Absent is not empty: a sidecar written before
                                  the field existed records nothing, and "no
                                  analyses" would be false about a run that had
                                  several. */}
                              {row.kinds === undefined ? '—' : row.kinds.join(' · ')}
                            </span>
                            <span className={styles.rowId}>{shortExecutionId(row.executionId)}</span>
                            <Badge state={STATUS_STATE[row.status]}>{row.status}</Badge>
                          </button>
                        </li>
                      ))}
                    </ul>
                    ))}
              </>
              )}
        </div>
      </section>
    </div>
  )
})

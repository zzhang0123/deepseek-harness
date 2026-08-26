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
  allExecutions, kindsPresent, matchesKind, projectTotals,
  type DashboardExecution,
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
  const [kind, setKind] = useState<string | undefined>(undefined)
  const workspaces = useWorkspaces(state => state.items)
  const { loading, cards } = useAllProjects(workspaces, nonce)

  const rows = useMemo(() => allExecutions(cards), [cards])
  const kinds = useMemo(() => kindsPresent(rows), [rows])
  const shown = useMemo(() => rows.filter(row => matchesKind(row, kind)), [rows, kind])

  if (section !== 'dashboard') return null

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
                  <h3 className={styles.sectionTitle}>Executions</h3>
                  {kinds.length > 0 && (
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
                    )}
              </>
              )}
        </div>
      </section>
    </div>
  )
})

/**
 * The project home: the archive surface, root-scoped, over one project's
 * tasks, inputs and executions (`docs/project-model.md` §6.0).
 *
 * **Why `shell.overlay` and not §6.0's `conversation.hero.workspace`.** The
 * design named the hero slot on the reasoning that it is root-scoped and shows
 * when no session is open. Both halves are true; what the doc did not record is
 * that the slot is a single-occupant POPOVER anchored to a WorkspaceChip
 * (`ConversationRoot.tsx` renders it inside `heroWorkspaceRow`, gated on
 * `open: pickerOpen`), already occupied by the shipped `WorkspacePicker`, and
 * carrying `replaceRisk: 'shadows-shipped-ui'`. Taking it would mean
 * reimplementing workspace picking AND re-declaring the
 * `conversation.hero.workspace.directoryFlow` child slot, or the directory
 * pickers lose their mount point and nobody can add a workspace any more.
 *
 * `shell.overlay` is the additive root-scoped seat — a list, `replaceRisk:
 * none`, no occupants, described by its own contract as "the additive seat for
 * a frame-wide surface of your own". It gives the archive an actual page
 * instead of a dropdown, and shadows nothing. The layer is click-through by
 * default, so this panel opts back into pointer events; that is why the
 * backdrop is drawn here rather than assumed.
 *
 * The home is a CHOOSER, per §6.0: it has no default selection, and it never
 * renders analysis. Picking an execution here is how you find one; rendering
 * it is the console's job, in a session.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/ProjectHome
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, EmptyState, Panel } from '@rheplicant/dsh-rheplicant-ui-kit/client'
import { closeHome, selectProject, useHome } from './home-store.ts'
import {
  countByStatus, formatBytes, groupExecutionsByTask, taskSegmentOf,
} from './home-selectors.ts'
import { canNavigate, openProject } from './navigate.ts'
import { useProjectOverview } from './use-project-overview.ts'
import styles from './project-home.module.css'

/**
 * How an execution's outcome reads as a badge.
 *
 * `refused` and `error` stay distinct rather than collapsing into one failure
 * chip: a refused PUBLICATION and a failed RUN have different causes and
 * different fixes, and the whole point of the two status axes is that a
 * listing does not merge them.
 */
const EXECUTION_BADGE = { ok: 'ok', refused: 'refuse', error: 'failed' } as const

/**
 * Why an unreadable project is not an empty one.
 *
 * Spelled on screen rather than left to this file, because the person who
 * needs it is looking at a blank panel and wondering whether their project is
 * broken.
 */
const UNREADABLE_HINT = 'The host route that lists a project could not be reached, so this '
  + 'says nothing about whether the project has tasks. It is a different '
  + 'fact from an empty project, and it is reported differently on purpose.'

/** The workspace rows the shell hands every root-scoped occupant. */
interface WorkspaceRow {
  readonly workspaceId: string
  readonly title: string
  readonly path: string
}

/** What this occupant reads off the root-scope standard kit. */
interface ProjectHomeProps {
  readonly useWorkspaces: <T>(selector: (state: {
    items: readonly WorkspaceRow[]
    recentWorkspaceId: string | undefined
  }) => T) => T
  /**
   * The session list, read for one thing only: whether the session that
   * produced an execution still exists, so the home can open THAT one rather
   * than the project's blank session.
   */
  readonly useSessions: <T>(selector: (state: { ids: readonly string[] }) => T) => T
}

export const ProjectHome = memo(function ProjectHome({ useWorkspaces, useSessions }: ProjectHomeProps) {
  const { open, workspaceId } = useHome()
  const [nonce, setNonce] = useState(0)
  const workspaces = useWorkspaces(state => state.items)
  const recent = useWorkspaces(state => state.recentWorkspaceId)
  const sessionIds = useSessions(state => state.ids)

  // The chooser has no default SELECTION (§6.0), but landing on a blank page
  // when there is an obvious project to look at is not a choice, it is a
  // chore. The most recently active workspace is the host's own answer to
  // "which project is this person in", so it seeds the view — and the picker
  // stays on screen, so it is visibly a starting point rather than a scope.
  const chosen = workspaceId ?? recent ?? workspaces[0]?.workspaceId
  const { loading, overview, shownFor } = useProjectOverview(chosen, open, nonce)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeHome()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [open])

  const refresh = useCallback(() => { setNonce(value => value + 1) }, [])
  // A failed connect leaves the home open and unchanged, which is the only
  // honest thing it can do: there is nowhere to have gone.
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const live = useMemo(() => new Set(sessionIds.map(String)), [sessionIds])
  const jumpTo = useCallback((executionId?: string, producedBy?: string) => {
    if (chosen === undefined) return
    setFailure(undefined)
    // Only a session that still exists is worth aiming at; a pruned one would
    // fail to open, and connecting the workspace is the honest fallback.
    const inSession = producedBy !== undefined && live.has(producedBy) ? producedBy : undefined
    void openProject(chosen, { executionId, inSession }).catch((error: unknown) => {
      setFailure(error instanceof Error ? error.message : String(error))
    })
  }, [chosen, live])
  const openable = canNavigate()

  // Guarded on `shownFor`, never on `overview` alone: an overview held over a
  // refresh belongs to the project it was fetched for, and rendering it under
  // any other project's name is the bug this whole design exists to prevent.
  const current = overview !== undefined && shownFor === chosen ? overview : undefined
  const byTask = useMemo(
    () => groupExecutionsByTask(current?.executions ?? []),
    [current],
  )
  const counts = useMemo(() => countByStatus(current?.executions ?? []), [current])
  // Which tasks have run is the join the home is actually for: a document with
  // no executions is work not yet done, and it should not hide among the rest.
  const ranSegments = useMemo(
    () => new Set(byTask.map(group => group.task)),
    [byTask],
  )
  // executionId -> the session our sidecar recorded as its producer. A task
  // row names only its newest execution's ID, so this is how it reaches the
  // same session that execution's own row would.
  const producerOf = useMemo(() => {
    const found = new Map<string, string>()
    for (const execution of current?.executions ?? []) {
      if (execution.sessionId !== undefined) found.set(execution.executionId, execution.sessionId)
    }
    return found
  }, [current])

  if (!open) return null

  return (
    <div className={styles.layer} data-project-home="">
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        className={styles.backdrop}
        data-project-home-backdrop=""
        onClick={closeHome}
        aria-hidden="true"
      />
      <section className={styles.page} role="dialog" aria-label="Project home">
        <header className={styles.head}>
          <div className={styles.title}>
            <span className={styles.eyebrow}>project</span>
            <span className={styles.name} data-project-name="">
              {current?.project ?? '—'}
            </span>
          </div>
          <select
            className={styles.picker}
            data-project-picker=""
            aria-label="Project"
            value={chosen ?? ''}
            onChange={event => { selectProject(event.target.value) }}
          >
            {workspaces.length === 0 && <option value="">no workspaces</option>}
            {workspaces.map(workspace => (
              <option key={workspace.workspaceId} value={workspace.workspaceId}>
                {workspace.title}
              </option>
            ))}
          </select>
          <button type="button" className={styles.action} onClick={refresh} data-project-refresh="">
            Refresh
          </button>
          <button type="button" className={styles.action} onClick={closeHome} data-project-close="">
            Close
          </button>
        </header>

        {current === undefined
          ? (
            <div className={styles.body}>
              <EmptyState
                message={loading ? 'Reading the project…' : 'This project is not readable from here'}
                hint={loading ? undefined : UNREADABLE_HINT}
              />
            </div>
          )
          : (
            <div className={styles.body}>
              {failure !== undefined && (
                <p className={styles.warning} data-project-open-failed="">
                  Could not open this project: {failure}
                </p>
              )}
              {current.truncated && (
                <p className={styles.warning} data-project-truncated="">
                  This project is larger than one listing walk covers, so the tasks and
                  inputs below are what fit — not everything the project holds.
                </p>
              )}

              <Panel id="project-tasks" title="Tasks" subtitle={`${current.tasks.length} document${current.tasks.length === 1 ? '' : 's'}`}>
                {current.tasks.length === 0
                  ? (
                    <EmptyState
                      message="No task documents yet"
                      hint="A task is a rheplicant config document anywhere in this project. Ask the agent to author one, and it becomes runnable here."
                    />
                  )
                  : (
                    <ul className={styles.rows} data-project-tasks="">
                      {current.tasks.map(task => (
                        <li key={task.path} className={styles.row} data-project-task={task.path}>
                          <span className={styles.mono}>{task.path}</span>
                          <span className={styles.meta}>{formatBytes(task.bytes)}</span>
                          {openable && (
                            <button
                              type="button"
                              className={styles.open}
                              data-project-open-task={task.path}
                              onClick={() => {
                                jumpTo(
                                  task.newestExecutionId,
                                  task.newestExecutionId === undefined
                                    ? undefined
                                    : producerOf.get(task.newestExecutionId),
                                )
                              }}
                            >
                              {/* A task with a history opens ON that history; one
                                  without simply opens the project, because there
                                  is no execution to point at. */}
                              {task.newestExecutionId === undefined ? 'Open project' : 'Open latest'}
                            </button>
                          )}
                          {ranSegments.has(taskSegmentOf(task.path))
                            ? (
                              <Badge state="ok">
                                {`${task.executionCount} execution${task.executionCount === 1 ? '' : 's'}`}
                              </Badge>
                            )
                            : <Badge state="off">never run</Badge>}
                        </li>
                      ))}
                    </ul>
                  )}
              </Panel>

              <Panel id="project-inputs" title="Inputs" subtitle={`${current.inputs.length} data file${current.inputs.length === 1 ? '' : 's'}`}>
                {current.inputs.length === 0
                  ? (
                    <EmptyState
                      message="No data files in this project"
                      hint="Nothing here yet that a document's file: node could point at."
                    />
                  )
                  : (
                    <>
                      <ul className={styles.rows} data-project-inputs="">
                        {current.inputs.map(input => (
                          <li key={input.path} className={styles.row} data-project-input={input.path}>
                            <span className={styles.mono}>{input.path}</span>
                            <span className={styles.meta}>{formatBytes(input.bytes)}</span>
                            <span className={styles.chip}>{input.extension}</span>
                          </li>
                        ))}
                      </ul>
                      <p className={styles.note}>
                        These are the project&rsquo;s data files, listed by extension. Which task
                        uses which is not shown: rheplicant reads a file by its document&rsquo;s
                        declared <code>format:</code> and never by the extension, so this layer
                        does not claim a link it has not read.
                      </p>
                    </>
                  )}
              </Panel>

              <Panel
                id="project-executions"
                title="Executions"
                subtitle={`${counts.ok} ok · ${counts.refused} refused · ${counts.error} error`}
              >
                {byTask.length === 0
                  ? (
                    <EmptyState
                      message="Nothing has run in this project"
                      hint="Executions publish under results/ when a task runs. Open a session to run one."
                    />
                  )
                  : (
                    <div data-project-executions="">
                      {byTask.map(group => (
                        <div key={group.task} className={styles.group}>
                          <h4 className={styles.groupHead}>{group.task}</h4>
                          <ul className={styles.rows}>
                            {group.executions.map(execution => (
                              <li
                                key={execution.executionId}
                                className={styles.row}
                                data-project-execution={execution.executionId}
                              >
                                <span className={styles.mono}>{execution.executionId}</span>
                                <span className={styles.meta}>{execution.path}</span>
                                <Badge state={EXECUTION_BADGE[execution.status]}>
                                  {execution.status}
                                </Badge>
                                {openable && (
                                  <button
                                    type="button"
                                    className={styles.open}
                                    data-project-open-execution={execution.executionId}
                                    onClick={() => {
                                      jumpTo(execution.executionId, execution.sessionId)
                                    }}
                                  >
                                    Open
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
              </Panel>
            </div>
          )}
      </section>
    </div>
  )
})

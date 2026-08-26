/**
 * The workbench: the archive surface, root-scoped, over one project's
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
 * a frame-wide surface of your own". It gives the workbench an actual page
 * instead of a dropdown, and shadows nothing. The layer is click-through by
 * default, so this page opts back into pointer events for ITSELF and for
 * nothing else — grabbing them for the whole layer would block the app
 * underneath for every other entry too.
 *
 * **This is a SECTION, not a modal (§20.2).** It used to draw its own backdrop,
 * bind Escape and declare `role="dialog"`, and all three were ours — the slot
 * asked for none of them. A modal says "deal with me first"; the project is not
 * an interruption to the conversation, it is the peer of it, and the frame
 * behind stays lit and usable. So: no backdrop, no Escape, a `region`
 * landmark rather than a dialog, and a switch rather than a close.
 *
 * The page is right-aligned within the layer on purpose. The sidebar is the
 * left column of the frame underneath, and leaving the slack on that side is
 * what keeps it visible and clickable while this section is up. The gutter is
 * sized to the shell's DEFAULT sidebar and can only ever be a default —
 * `ui-layout` writes the column width as an inline `grid-template-columns` on
 * the frame rather than publishing a custom property, so no rule here can
 * follow a resize. Which is why the switch back also lives in this page's own
 * header: that one is reachable whatever the geometry.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/ProjectHome
 */

import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { Badge, EmptyState, Panel, type PanelLayoutView } from '@rheplicant/dsh-rheplicant-ui-kit/client'
import { closeHome, selectProject, useHome } from './home-store.ts'
import {
  countByStatus, formatBytes, groupExecutionsByTask, taskSegmentOf,
} from './home-selectors.ts'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { canNavigate, openProject } from './navigate.ts'
import { selectInProject, useSelection } from './selection.ts'
import { useProjectOverview } from './use-project-overview.ts'
import { useTaskDocument } from './use-task-document.ts'
import { useWorkbenchExecution } from './use-workbench-execution.ts'
import { useDocumentDigest } from './use-document-digest.ts'
import { useTaskDefinition } from './use-task-definition.ts'
import { taskInputUsage } from './input-usage.ts'
import { TaskMaturity } from './TaskMaturity.tsx'
import { TaskDefinition } from './TaskDefinition.tsx'
import { DocumentDiff } from './DocumentDiff.tsx'
import { TaskModel } from './TaskModel.tsx'
import { TaskRuns } from './TaskRuns.tsx'
import { useDocumentProjection } from './use-document-projection.ts'
import { useExecutedDocument } from './use-executed-document.ts'
import { KNOWN_PANELS } from './known-panels.ts'
import { panelsWithNoExit } from './panel-relevance.ts'
import { PanelsMenu } from './PanelsMenu.tsx'
import type { createWorkbenchLayoutStore } from './layout-store.ts'
import type { TaskPanelOwnerProps } from './index.ts'
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

/**
 * What this occupant reads off the root-scope standard kit.
 *
 * `useStore`/`actions` are baked in by the framework because THIS entry's own
 * registration declares `store: createWorkbenchLayoutStore` — the same channel
 * `AppFrame` receives its layout store through. Their types derive from the
 * handle's own return type rather than a hand-written twin, so the declared
 * write set in `layout-store.ts` cannot drift out of sync with what a caller
 * here can actually invoke.
 */
type ProjectHomeProps =
  & {
    useWorkspaces: <T>(selector: (state: {
      items: readonly WorkspaceRow[]
      recentWorkspaceId: string | undefined
    }) => T) => T
    /** Renders this entry's own `task.panel` grid. */
    renderSlot: (key: 'task.panel', owner: TaskPanelOwnerProps) => ReactNode
  }
  & PropsStore<ReturnType<typeof createWorkbenchLayoutStore>>

/**
 * The session share handed to a panel in the workbench: none.
 *
 * Panels accept a session reader as their LOG FALLBACK, for runs that were
 * never published. The workbench has no conversation, so the truthful answer
 * is an empty one — and §11.5 already settled that an unpublished run has no
 * seat here, because it has no folder to be read from.
 *
 * A module constant so its identity is stable across renders; a fresh closure
 * each time would re-render every panel for nothing.
 */
const NO_SESSION = Object.freeze({
  views: new Map<string, unknown>(),
  chat: Object.freeze({ nodes: new Map<string, unknown>() }),
  nodes: Object.freeze([]),
})
const readNoSession = <T,>(selector: (snapshot: ConversationSnapshot) => T): T =>
  selector(NO_SESSION as unknown as ConversationSnapshot)

export const ProjectHome = memo(function ProjectHome(
  { useWorkspaces, renderSlot, useStore, actions }: ProjectHomeProps,
) {
  const { section, workspaceId } = useHome()
  const [nonce, setNonce] = useState(0)
  const workspaces = useWorkspaces(state => state.items)
  const recent = useWorkspaces(state => state.recentWorkspaceId)

  // The chooser has no default SELECTION (§6.0), but landing on a blank page
  // when there is an obvious project to look at is not a choice, it is a
  // chore. The most recently active workspace is the host's own answer to
  // "which project is this person in", so it seeds the view — and the picker
  // stays on screen, so it is visibly a starting point rather than a scope.
  const chosen = workspaceId ?? recent ?? workspaces[0]?.workspaceId
  const { loading, overview, shownFor } = useProjectOverview(chosen, section === 'workbench', nonce)
  // The workbench renders the PROJECT's selection — the same one the console
  // reads (`docs/project-model.md` §11.2), so the two never disagree about
  // which task is in view.
  const selection = useSelection(chosen)
  const document_ = useTaskDocument(chosen, selection.taskPath, nonce)
  const executionView = useWorkbenchExecution(chosen, selection.executionId, nonce)
  // Staleness is a DIGEST comparison (§4.2), so the authored document is
  // hashed here rather than compared by modification time.
  const documentDigest = useDocumentDigest(document_.document?.text)
  // Checked on SELECTION, not behind a button (§12.7): both halves are pure
  // functions of the text, and a checklist that must be asked for is one
  // nobody sees.
  const definition = useTaskDefinition(chosen, selection.taskPath, nonce)
  // The bytes the SELECTED execution actually ran, so "as authored vs as it
  // ran" can be answered with the difference rather than only with a flag
  // (§11.4). No new transport: `config.input.yaml` has been on P3's artifact
  // allow-list since the seam existed.
  const executed = useExecutedDocument(chosen, selection.executionId, nonce)
  // The diagram and the declared physics, needing NO execution (§17). Before
  // this, both appeared only after a first run — so the one diagram the
  // philosophy asks to be "always present on screen" was missing for exactly
  // the task somebody is still authoring.
  const projected = useDocumentProjection(chosen, selection.taskPath, nonce)

  const refresh = useCallback(() => { setNonce(value => value + 1) }, [])
  // A failed connect leaves the home open and unchanged, which is the only
  // honest thing it can do: there is nowhere to have gone.
  const [failure, setFailure] = useState<string | undefined>(undefined)
  // "Go and work on this project" — the only thing opening a session still
  // means, and now the only shape it comes in. No producing-session hunt: the
  // workbench shows results without one, so a blank conversation is exactly
  // the right place to land (§11.5).
  //
  // THERE USED TO BE A PER-TASK FORM of this, one button per row, and the
  // reason it is gone is the reason §11.11 removed the per-EXECUTION form: the
  // destination did not differ. The task travelled as a client-side selection
  // that the blank conversation never renders and the agent never receives —
  // measured 2026-08-26, `ctx.rheplicantSelection` is browser-half only — so
  // four buttons landed you in the same place with nothing to show which one
  // you pressed. One project-level button says what all four actually did.
  const workOnProject = useCallback(() => {
    if (chosen === undefined) return
    setFailure(undefined)
    void openProject(chosen).catch((error: unknown) => {
      setFailure(error instanceof Error ? error.message : String(error))
    })
  }, [chosen])
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
  const selectedTask = current?.tasks.find(row => row.path === selection.taskPath)
  const newestOfTask = useMemo(() => {
    if (selectedTask?.newestExecutionId === undefined) return undefined
    return current?.executions.find(row => row.executionId === selectedTask.newestExecutionId)
  }, [current, selectedTask])
  // Which tasks have run is the join the home is actually for: a document with
  // no executions is work not yet done, and it should not hide among the rest.
  const ranSegments = useMemo(
    () => new Set(byTask.map(group => group.task)),
    [byTask],
  )
  // Guarded on `shownFor` once, here, so the checklist and the input marks
  // can never disagree about which task they describe.
  const definitionKey = `${chosen ?? ''} ${selection.taskPath ?? ''}`
  const reportForTask = definition.shownFor === definitionKey ? definition.report : undefined
  // §11.4's link, finally answerable: which of the project's data files THIS
  // task reads, from the YAML parse §12 added. Nothing is claimed about any
  // other task, and the note below says so.
  const usage = useMemo(
    () => taskInputUsage(current?.inputs ?? [], reportForTask),
    [current, reportForTask],
  )

  // --- Panel layout (§20.4) ------------------------------------------------
  const collapsed = useStore(state => state.collapsed)
  const hidden = useStore(state => state.hidden)
  const collapsedSet = useMemo(() => new Set(collapsed), [collapsed])
  const hiddenSet = useMemo(() => new Set(hidden), [hidden])
  const layout: PanelLayoutView = useMemo(() => ({
    collapsed: collapsedSet,
    hidden: hiddenSet,
    toggleCollapsed: actions.toggleCollapsed,
    hide: actions.hide,
    show: actions.show,
  }), [collapsedSet, hiddenSet, actions])
  const toggleHidden = useCallback((id: string) => {
    if (hiddenSet.has(id)) actions.show(id)
    else actions.hide(id)
  }, [hiddenSet, actions])

  // Which panels this task declares no exit for. Read off the projection's
  // `runs.declared[].products`, which is upstream's own `RUN_KIND_SELECTORS`
  // on the wire — see `known-panels.ts` for why a PRODUCT and not a run kind.
  const projectedRuns = projected.shownFor === `${chosen ?? ''} ${selection.taskPath ?? ''}`
    && !projected.loading
    ? projected.projection?.runs
    : undefined
  const withoutExit = useMemo(
    () => panelsWithNoExit(KNOWN_PANELS, projectedRuns),
    [projectedRuns],
  )
  const withoutExitSet = useMemo(() => new Set(withoutExit), [withoutExit])
  // A SUGGESTION, never a set: `suggestCollapsed` skips any panel a human has
  // touched, in either direction. Without that, switching tasks would re-close
  // a panel somebody deliberately opened — the same "propose, never select"
  // discipline §11.2 applies to the execution axis.
  useEffect(() => {
    if (withoutExit.length > 0) actions.suggestCollapsed(withoutExit)
  }, [withoutExit, actions])


  if (section !== 'workbench') return null

  return (
    <div className={styles.layer} data-project-home="">
      {/* A `region` landmark, not a dialog: this is one of the frame's two
          peer sections, and nothing behind it is disabled or dimmed. */}
      <section className={styles.page} aria-label="Workbench">
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
          <PanelsMenu
            panels={KNOWN_PANELS}
            hidden={hiddenSet}
            withoutExit={withoutExitSet}
            onToggleHidden={toggleHidden}
            onReset={actions.reset}
          />
          <button type="button" className={styles.action} onClick={refresh} data-project-refresh="">
            Refresh
          </button>
          {/* A SWITCH, not a close (§20.2). The sidebar foot carries the same
              switch, but it sits under this page whenever the frame is narrow
              enough for the page to reach it — so the one that is always
              reachable lives here. */}
          <button type="button" className={styles.action} onClick={closeHome} data-project-switch="">
            Conversation
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
                    <>
                      <EmptyState
                        message="No task documents yet"
                        hint="A task is a rheplicant config document anywhere in this project — there is no blessed directory, so wherever you keep it is where it lives."
                      />
                      {/* §7's four criteria, before there is a task for them
                          to be about. The same list the checklist above shows
                          once one exists, so the vocabulary is learned once. */}
                      <ol className={styles.onboarding} data-project-onboarding="">
                        <li>
                          <strong>Inputs resolve.</strong> Every <code>file:</code> the document
                          names can be found — beside the document, or anywhere else you point it.
                        </li>
                        <li>
                          <strong>The document validates.</strong> Pre-flight, which is every check
                          decidable from the text alone, comes back clean.
                        </li>
                        <li>
                          <strong>The gates are priced.</strong> You have seen what each check costs
                          and chosen its mode, with a written reason for anything you skip.
                        </li>
                        <li>
                          <strong>The task is named.</strong> Its name is the file&rsquo;s, and it is
                          what its results are filed under in <code>results/</code>.
                        </li>
                      </ol>
                      <p className={styles.note}>
                        Only then is running it the obvious next step. This surface reads a project;
                        it never writes one, so authoring is a conversation — open a session and ask
                        the agent for a document, and it appears here.
                      </p>
                    </>
                  )
                  : (
                    <ul className={styles.rows} data-project-tasks="">
                      {current.tasks.map(task => (
                        <li
                          key={task.path}
                          className={`${styles.row} ${selection.taskPath === task.path ? styles.rowActive : ''}`}
                          data-project-task={task.path}
                          data-project-task-active={selection.taskPath === task.path ? '' : undefined}
                        >
                          {/* Selecting is IN PLACE. A row used to navigate,
                              which is what made the workbench feel like a
                              directory rather than a surface — and a project
                              with no session open had nowhere to go anyway. */}
                          <button
                            type="button"
                            className={styles.rowPick}
                            data-project-select-task={task.path}
                            onClick={() => { if (chosen !== undefined) selectInProject(chosen, { taskPath: task.path }) }}
                          >
                            <span className={styles.mono}>{task.path}</span>
                          </button>
                          <span className={styles.meta}>{formatBytes(task.bytes)}</span>
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
                {/* One seat, both branches. It used to live only in the
                    empty-project arm, which made "open a session here" an
                    onboarding step rather than an action — and left a project
                    WITH tasks offering only the per-task buttons that have
                    since gone. */}
                {openable && (
                  <div className={styles.onboardingActions}>
                    <button
                      type="button"
                      className={styles.openProject}
                      data-project-open-empty=""
                      onClick={() => { workOnProject() }}
                    >
                      Open a session in this project
                    </button>
                  </div>
                )}
              </Panel>

              {/* A selection can outlive the file it names — deleted, renamed,
                  or moved out of the walk's reach. Saying so is better than
                  the panels quietly disappearing, which reads as a mis-click;
                  the document pane below already explains itself for exactly
                  this case, and three panels about one task should not
                  disagree about whether to speak. */}
              {selection.taskPath !== undefined && current.tasks.length > 0
                && selectedTask === undefined && (
                <p className={styles.warning} data-project-task-gone="">
                  <code>{selection.taskPath}</code> is selected but is no longer in this
                  project&rsquo;s listing — it may have been renamed, deleted, or moved
                  beyond the depth this walk covers. Its executions, if it has any, are
                  still below.
                </p>
              )}

              {selection.taskPath !== undefined && selectedTask !== undefined && (
                <Panel
                  id="project-task-definition"
                  title="Is this task defined?"
                  subtitle="read off the document, as authored"
                >
                  {/* Guarded on `shownFor` for the same reason the document
                      pane is: a verdict held across a change of task would
                      appear under the new task's name. */}
                  <TaskDefinition
                    task={selectedTask}
                    report={reportForTask}
                    problem={definition.shownFor === definitionKey ? definition.problem : 'loading'}
                    documentDigest={documentDigest}
                  />
                </Panel>
              )}

              {selection.taskPath !== undefined && selectedTask !== undefined && (
                <Panel id="project-task-maturity" title="This task" subtitle="read off the project, not this conversation">
                  <TaskMaturity
                    task={selectedTask}
                    newest={newestOfTask}
                    view={newestOfTask?.executionId === selection.executionId ? executionView : undefined}
                    documentDigest={documentDigest}
                  />
                </Panel>
              )}

              {selection.taskPath !== undefined && selectedTask !== undefined && (
                <Panel
                  id="project-task-runs"
                  title="Exits"
                  subtitle="what this task computes, and what it is not reaching for"
                >
                  {projected.shownFor !== `${chosen ?? ''} ${selection.taskPath}` || projected.loading
                    ? <EmptyState message="Reading the exits…" />
                    : projected.projection !== undefined
                      ? <TaskRuns runs={projected.projection.runs} />
                      : (
                        <EmptyState
                          message="The exits could not be listed from here"
                          hint="Same projection the Model panel needs, so it is unavailable for the same reason — the remedy is stated once, there."
                        />
                      )}
                </Panel>
              )}

              {selection.taskPath !== undefined && selectedTask !== undefined && (
                <Panel id="project-task-model" title="Model" subtitle="the physics this document declares">
                  {projected.shownFor !== `${chosen ?? ''} ${selection.taskPath}` || projected.loading
                    ? <EmptyState message="Projecting the document…" />
                    : projected.projection !== undefined
                      ? (
                        <TaskModel
                          svg={projected.projection.svg}
                          model={projected.projection.model}
                        />
                      )
                      : (
                        <EmptyState
                          message={projected.refused
                            ? 'This project would not serve that document'
                            : 'The model could not be projected from here'}
                          hint={projected.refused
                            ? 'The path is outside the project, inside its results tree, or not a task document.'
                            : 'Projecting a document needs the compute service\'s optional gui extra (pip install "rheplicant[gui]"). Everything else on this page works without it.'}
                        />
                      )}
                </Panel>
              )}

              {selection.taskPath !== undefined && (
                <Panel
                  id="project-task-document"
                  title={selection.taskPath}
                  subtitle="as authored"
                >
                  {/* Guarded on `shownFor`: a document held across a change of
                      task would appear under the new task's title, which is
                      exactly the confusion §11 exists to remove. */}
                  {document_.shownFor !== `${chosen ?? ''} ${selection.taskPath}`
                    || document_.loading
                    ? <EmptyState message="Reading the document…" />
                    : document_.document !== undefined
                      ? (
                        <>
                          <pre className={styles.document} data-project-document>
                            {document_.document.text}
                          </pre>
                          <p className={styles.note}>
                            {formatBytes(document_.document.bytes)} on disk. This is the task
                            as AUTHORED; what a given execution actually ran is its own
                            <code> config.input.yaml</code>, which is how an edited task shows
                            up as stale rather than silently changing history.
                          </p>
                          {/* The comparison, when there is an execution to
                              compare against. Guarded on `shownFor` like
                              everything else here: diffing against another
                              execution's bytes would report changes nobody
                              made. */}
                          {selection.executionId !== undefined
                            && executed.shownFor === `${chosen ?? ''} ${selection.executionId}`
                            && (executed.loading
                              ? <p className={styles.note}>Reading what that execution ran…</p>
                              : executed.text !== undefined
                                ? (
                                  <DocumentDiff
                                    ran={executed.text}
                                    authored={document_.document.text}
                                    executionId={selection.executionId}
                                  />
                                )
                                : (
                                  <p className={styles.note} data-document-diff-unavailable="">
                                    {executed.unreadable
                                      ? 'The document this execution ran is no longer readable — its results may have been pruned, so there is nothing to compare against.'
                                      : 'The document this execution ran could not be read from here, so this shows only the task as authored.'}
                                  </p>
                                ))}
                        </>
                      )
                      : (
                        <EmptyState
                          message={document_.refused
                            ? 'This project would not serve that document'
                            : 'The document could not be read from here'}
                          hint={document_.refused
                            ? 'The path is outside the project, inside its results tree, or not a task document.'
                            : 'The host route that serves a task document could not be reached.'}
                        />
                      )}
                </Panel>
              )}

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
                            {usage.used.has(input.path) && (
                              <span className={styles.usedMark} data-input-used="">
                                read by this task
                              </span>
                            )}
                            <span className={styles.chip}>{input.extension}</span>
                          </li>
                        ))}
                      </ul>
                      {usage.known && (
                        <p className={styles.note} data-input-usage-note="">
                          {/* Scoped to ONE task, on purpose. A row with no mark is
                              not an unused file; it is a file this task does not
                              read, and the project's other tasks are not being
                              spoken for. */}
                          The marks show what <code>{selection.taskPath}</code> reads, from its own
                          <code> file: </code> nodes as rheplicant resolves them. An unmarked row is
                          not unused — it is one this task does not read.
                          {usage.unlisted.length > 0 && (
                            <span data-input-unlisted="">
                              {' '}It also reads {usage.unlisted.join(', ')}, which
                              {usage.unlisted.length === 1 ? ' is' : ' are'} in this project but not
                              in the list above: the listing matches on a fixed set of extensions,
                              so a file outside that set resolves perfectly well and never appears
                              as a row.
                            </span>
                          )}
                          {usage.outside > 0 && (
                            <span data-input-outside="">
                              {' '}{usage.outside} further reference
                              {usage.outside === 1 ? '' : 's'} resolve
                              {usage.outside === 1 ? 's' : ''} outside this project. Where is not
                              shown, because a path outside the project is not this project&rsquo;s
                              to disclose — rheplicant places no restriction on where a
                              <code> file: </code> may point.
                            </span>
                          )}
                          {usage.unresolved > 0 && (
                            <span data-input-unresolved="">
                              {' '}{usage.unresolved} reference
                              {usage.unresolved === 1 ? '' : 's'} could not be found at all; the
                              checklist above names {usage.unresolved === 1 ? 'it' : 'them'}.
                            </span>
                          )}
                        </p>
                      )}
                      <p className={styles.note}>
                        The extension beside each row is what this listing matched on, never a
                        format claim: rheplicant reads a file by its document&rsquo;s declared
                        <code> format: </code> and never by the extension.
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
                                <button
                                  type="button"
                                  className={styles.rowPick}
                                  data-project-select-execution={execution.executionId}
                                  onClick={() => {
                                    if (chosen !== undefined) {
                                      selectInProject(chosen, { executionId: execution.executionId })
                                    }
                                  }}
                                >
                                  <span className={styles.mono}>{execution.executionId}</span>
                                </button>
                                <span className={styles.meta}>{execution.path}</span>
                                <Badge state={EXECUTION_BADGE[execution.status]}>
                                  {execution.status}
                                </Badge>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
              </Panel>

              {/* The only panel grid there is, since §20.4. The owner object
                  is identical for every occupant — the one channel that
                  reaches them all — so the layout rides it beside the
                  execution, and each panel self-applies its own row. */}
              {selection.executionId !== undefined && (
                <div className={styles.panels} data-project-panels>
                  {renderSlot('task.panel', {
                    useSession: readNoSession,
                    execution: executionView,
                    layout,
                  })}
                </div>
              )}
            </div>
          )}
      </section>
    </div>
  )
})

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
import { Badge, EmptyState, Panel, type PanelLayoutView, shortExecutionId } from '@rheplicant/dsh-rheplicant-ui-kit/client'
import { closeHome, selectProject, useHome } from './home-store.ts'
import { showWorkbenchPage, useWorkbenchPage, type WorkbenchPage } from './workbench-page.ts'
import { tabListKeyHandler, tabPanelProps, tabProps } from './tabs.ts'
import {
  countByStatus, formatBytes, groupExecutionsByTask, taskPathForSegment, taskSegmentOf,
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
import { TaskPlan } from './TaskPlan.tsx'
import { useDocumentProjection } from './use-document-projection.ts'
import { useModelSource } from './use-model-source.ts'
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
/**
 * A run's terminal status, onto the badge vocabulary.
 *
 * **`refused` takes the WARN wash, not the error one.** The two failure kinds
 * are documented here as staying distinct — a refused publication is
 * rheplicant declining a document it judged unsound, a failed one is the run
 * breaking — and they rendered in the same red, so the distinction survived
 * only in the word. `refuse` keeps its own red inside the Gates panel, where a
 * refusing gate IS the hard verdict; this map is local to executions so
 * changing it here changes nothing there.
 */
const EXECUTION_BADGE = { ok: 'ok', refused: 'warn', error: 'failed' } as const

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

/**
 * The four pages, in the order a person meets them.
 *
 * A tab is a QUESTION rather than a panel title: two of the four hold more
 * than one panel, and naming a tab after one of them would be a claim about
 * the others. `docs/superpowers/specs/2026-08-27-workbench-pages.md` D1.
 */
const WORKBENCH_PAGES: readonly { readonly id: WorkbenchPage; readonly label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'setup', label: 'Setup' },
  { id: 'model', label: 'Model' },
  { id: 'results', label: 'Results' },
]

/**
 * The same four, as the bare names the arrow keys walk (`tabs.ts`), and the
 * row's own name — a document-wide id prefix, so it carries the plugin.
 *
 * Derived rather than written a second time: the row's order and the key
 * order must be the same list, and two lists that must agree eventually do
 * not.
 */
const PAGE_NAMES: readonly WorkbenchPage[] = WORKBENCH_PAGES.map(entry => entry.id)
const TAB_GROUP = 'rheplicant-workbench'

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
  const page = useWorkbenchPage()
  // The three tabs that are about ONE task. Named once, because three separate
  // `page !== 'overview'` tests is three places for the set to drift.
  const taskScoped = page !== 'overview'
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
  /**
   * The task an execution belongs to, resolved through THIS project's listing.
   *
   * `ProjectExecutionRow.task` is the sidecar's task SEGMENT (`demo_small`),
   * not the task's path (`demo_small.yaml`). Only a holder of the listing can
   * turn one into the other, which is why `selection-bridge.ts`'s
   * `chooseExecution` sets the execution alone and §28.7 recorded that as a
   * known limitation: it does not hold the listing. This component does.
   */
  const ownerOf = useCallback((executionId: string): string | undefined => {
    const execution = current?.executions.find(row => row.executionId === executionId)
    if (execution === undefined) return undefined
    return taskPathForSegment(current?.tasks ?? [], execution.task)
  }, [current])

  /**
   * SELECTING AN EXECUTION SELECTS ITS TASK. Nobody should have to say both.
   *
   * Reported by the user: arriving in the workbench from the dashboard with an
   * execution chosen still asked which task it was — *"task也应该确定了，何必再
   * 选?"* — and they were right twice over. The dashboard was passing the
   * sidecar's task SEGMENT where a task PATH belongs, so the listing lookup
   * found nothing; and `chooseExecution` sets the execution alone by design.
   *
   * Fixing only the dashboard would have left the second door open, so the
   * repair is here, where the listing is: whenever an execution is selected
   * and the task axis does not name the task that execution actually belongs
   * to, this pins it. Every entry point inherits it, including ones not
   * written yet.
   *
   * **It cannot loop and it cannot guess.** It writes only when the resolved
   * owner DIFFERS from what is selected, so the next render is a no-op; and it
   * resolves only through this project's own listing, so an execution from a
   * truncated walk leaves the axis alone rather than inventing a path. That
   * keeps §28.7's rule — the two axes may disagree only where the design says
   * they may, never because a caller was careless.
   *
   * **Only for a PINNED execution**, which is the whole point of there being
   * two verbs. `proposeExecution` offers whatever finished last; the store
   * honours it on the unpinned axes and deliberately does not pin. If this
   * effect fired on a proposal it would take that offer, hand it to
   * `selectInProject` — the pinning verb — and pin a task the reader never
   * chose, over the one they did. A proposal that can move a pin is not a
   * proposal.
   */
  useEffect(() => {
    if (chosen === undefined || selection.executionId === undefined) return
    if (!selection.pinned.execution) return
    const owner = ownerOf(selection.executionId)
    if (owner === undefined || owner === selection.taskPath) return
    selectInProject(chosen, { taskPath: owner })
  }, [chosen, selection.executionId, selection.pinned.execution, selection.taskPath, ownerOf])

  /**
   * The runs of the SELECTED task, newest first — what the header's third
   * picker offers.
   *
   * Keyed on the task's own segment rather than on its path, because that is
   * what the sidecar records (`taskSegmentOf`, and §28.7's note on the two
   * derivations that disagreed). An unselected task yields none rather than
   * every run in the project: the picker's whole job is to be about ONE task.
   */
  const runsOfTask = useMemo(() => {
    if (selection.taskPath === undefined) return []
    const segment = taskSegmentOf(selection.taskPath)
    return (current?.executions ?? []).filter(row => row.task === segment)
  }, [current, selection.taskPath])
  const newestOfTask = useMemo(() => {
    if (selectedTask?.newestExecutionId === undefined) return undefined
    return current?.executions.find(row => row.executionId === selectedTask.newestExecutionId)
  }, [current, selectedTask])
  // --- The Model section's two sources (§28.1) -----------------------------
  const selectedExecution = current?.executions
    .find(row => row.executionId === selection.executionId)
  const model = useModelSource({
    workspaceId: chosen,
    taskPath: selection.taskPath,
    executionId: selection.executionId,
    nonce,
    task: selectedTask,
    execution: selectedExecution,
    documentDigest,
  })

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
        {/* WHAT YOU ARE LOOKING AT, AND HOW TO CHANGE IT — one path, three
            steps, on every tab.

            It used to be a project NAME on the left and a project PICKER on the
            right: the same fact twice, one of them not a control. And the task
            and the execution — the two things every other tab reads — had no
            representation here at all, so the only way to change either was to
            go to a particular tab and click a row. That made three tabs
            secretly subordinate to a fourth while the row of tabs said they
            were peers.

            Now the selection is the header and the tabs are genuinely peers:
            you can see and change all three from anywhere. */}
        {/* NO TITLE HERE, deliberately. An audit asked for one on the grounds
          that both sibling sections carry an identity — and the Document tab
          had exactly such a heading removed on 2026-08-28 for the opposite
          reason: the sidebar's active nav row already names the destination in
          the accent, so a heading restating it is the same word twice in two
          weights. What this header carries instead is the breadcrumb, which
          answers the question a title cannot — WHICH project, task and run. */}
      <header className={styles.head}>
          <div className={styles.path} data-workbench-path>
            {/* ONE control, showing the AUTHORITATIVE name.
                The header used to print `current.project` — the name the
                overview reports — beside a picker listing workspace TITLES,
                which is the name the shell reports. Merging them lost that
                distinction until this: the selected row shows the project's own
                name once the overview for THAT workspace has arrived, and the
                title until then. So the surface still cannot show one
                project's contents under another's name, which is the property
                `shownFor === chosen` exists to keep and this is the visible
                half of. */}
            <select
              className={styles.pathPick}
              data-project-picker=""
              data-project-name={current?.project ?? ''}
              aria-label="Project"
              value={chosen ?? ''}
              onChange={event => { selectProject(event.target.value) }}
            >
              {workspaces.length === 0 && <option value="">no projects</option>}
              {workspaces.map(workspace => (
                <option key={workspace.workspaceId} value={workspace.workspaceId}>
                  {workspace.workspaceId === chosen && current !== undefined
                    ? current.project
                    : workspace.title}
                </option>
              ))}
            </select>
            <span className={styles.pathSep} aria-hidden="true">/</span>
            <select
              className={styles.pathPick}
              data-workbench-pick-task=""
              aria-label="Task"
              value={selection.taskPath ?? ''}
              disabled={current === undefined || current.tasks.length === 0}
              onChange={event => {
                if (chosen === undefined) return
                // Changing the task drops the execution: an execution belongs to
                // ONE task, and carrying it across would leave the two axes
                // disagreeing — the state §28.7 records as the source of a
                // diagram drawn under the wrong document's name.
                // `|| undefined`, as the Run picker beside it already does:
                // the placeholder option's value is `''`, and an empty string
                // is not "no task" to any guard on this page — every one of
                // them tests `!== undefined`. Left raw it read as SELECTED, so
                // the "no task" prompt stayed hidden, the task-gone warning
                // rendered `'' is no longer in this project's listing`, and the
                // Setup panel fetched the empty path.
                selectInProject(chosen, {
                  taskPath: event.target.value || undefined,
                  executionId: undefined,
                })
              }}
            >
              <option value="">choose a task</option>
              {(current?.tasks ?? []).map(task => (
                <option key={task.path} value={task.path}>{task.path}</option>
              ))}
            </select>
            <span className={styles.pathSep} aria-hidden="true">/</span>
            <select
              className={styles.pathPick}
              data-workbench-pick-execution=""
              aria-label="Run"
              value={selection.executionId ?? ''}
              disabled={current === undefined || selection.taskPath === undefined || runsOfTask.length === 0}
              onChange={event => {
                if (chosen === undefined) return
                selectInProject(chosen, { executionId: event.target.value || undefined })
              }}
            >
              <option value="">
                {/* THREE states, not two. `runsOfTask` reads
                    `current?.executions ?? []`, which is empty while the
                    project is being read and empty when it could not be read
                    at all — so "this task has not run" was a claim about a
                    project nobody had looked at yet, printed beside "Reading
                    the project…" on the ordinary path in from the dashboard.
                    §28.7's defect class, in a dropdown. */}
                {current === undefined
                  ? 'not read yet'
                  : selection.taskPath === undefined
                    ? 'choose a task first'
                    : runsOfTask.length === 0 ? 'this task has not run' : 'choose a run'}
              </option>
              {runsOfTask.map(execution => (
                <option key={execution.executionId} value={execution.executionId}>
                  {shortExecutionId(execution.executionId)} · {execution.status}
                </option>
              ))}
            </select>
          </div>
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

        {/* The page switch. Under the header rather than in it, and a tab row
            rather than a second left rail: the dashboard already chooses
            Setups/Runs this way, and the frame's own sidebar is one column
            away — two left rails would read as two navigations.

            The dashboard's OWN pattern, down to the roles: `role="tablist"` /
            `role="tab"` / `aria-selected`, and the word "tab". A first draft
            used `<nav>` + `aria-current="page"` and called them pages, which
            promises something this does not do — no URL changes and Back does
            not undo a switch. */}
        <div className={styles.pagesRow}>
          {/* THE TABLIST OWNS TABS AND NOTHING ELSE. The Panels menu used to be
              a child of this element, which made a `tablist` whose last owned
              child was a menu button — a shape no assistive technology has an
              answer for, and one the arrow keys would have had to step over.
              It keeps its place at the end of the row; the row is now a box
              around the tablist rather than the tablist itself. */}
          <div
            className={styles.pages}
            role="tablist"
            aria-label="Workbench view"
            data-workbench-pages
            onKeyDown={tabListKeyHandler(TAB_GROUP, PAGE_NAMES, page, showWorkbenchPage)}
          >
            {WORKBENCH_PAGES.map(entry => (
              <button
                key={entry.id}
                type="button"
                className={styles.pageTab}
                data-workbench-page={entry.id}
                {...tabProps(TAB_GROUP, page, entry.id)}
                onClick={() => { showWorkbenchPage(entry.id) }}
              >
                {entry.label}
              </button>
            ))}
          </div>
          {/* The menu governs the `task.panel` grid and nothing else, so it
              lives with it. It sat in the header above eight sections it has
              no say over. */}
          {page === 'results' && (
            <span className={styles.pagesEnd}>
              <PanelsMenu
                panels={KNOWN_PANELS}
                hidden={hiddenSet}
                withoutExit={withoutExitSet}
                onToggleHidden={toggleHidden}
                onReset={actions.reset}
              />
            </span>
          )}
        </div>

        {current === undefined
          ? (
            <div className={styles.body} {...tabPanelProps(TAB_GROUP, page)}>
              {/* BOUNDED, like the prompts it is a sibling of. `EmptyState`
                  brings its own frame — solid for `unavailable`, dashed for
                  `arriving` — so the box was never missing; what was missing
                  is a measure. As a stretched flex item it ran the full body,
                  which at 2200px is a one-sentence message centred inside a
                  1900px box. `.prompt` bounds itself at 32rem for exactly this
                  reason and says so; this is that. */}
              <div className={styles.pageState}>
                <EmptyState
                  kind={loading ? 'arriving' : 'unavailable'}
                  message={loading ? 'Reading the project…' : 'This project is not readable from here'}
                  hint={loading ? undefined : UNREADABLE_HINT}
                />
              </div>
            </div>
          )
          : (
            <div className={styles.body} {...tabPanelProps(TAB_GROUP, page)}>
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

              {/* The four tabs (spec D1). Each is a QUESTION, and the workbench
                  used to stack all four answers in one 6 484 px scroll. A page
                  that needs a task says so rather than rendering blank — three
                  absences, not one (§27.3). */}
              {page === 'overview' && (
                <>
                {/* What is here, and what has run. Needs no selection. */}
                <Panel id="project-tasks" title="Tasks" subtitle={`${current.tasks.length} document${current.tasks.length === 1 ? '' : 's'}`}>
                  {current.tasks.length === 0
                    ? (
                      <>
                        <EmptyState
                          kind="waiting"
                          message="No task documents yet"
                          hint="A task is a rheplicant config document anywhere in this project — there is no blessed directory, so wherever you keep it is where it lives."
                        />
                        {/* §7's four criteria, before there is a task for them
                            to be about. The same list the definition checklist
                            shows once one exists, so the vocabulary is learned
                            once. (It said "above"; the checklist is on the Task
                            tab now, and §28.6's rule is that a stale mapping
                            from a word to a place is the worst kind.) */}
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
                            {/* ONE derivation, and it is the count (§28.7). The
                                badge used to be chosen by a segment join —
                                `ranSegments.has(taskSegmentOf(task.path))` —
                                while PRINTING `executionCount` inside it, so a
                                task whose sidecar `task` string does not equal
                                `taskSegmentOf(path)` rendered "never run" beside
                                a nonzero count. They agree in the demo by luck of
                                naming. `executionCount` is the host's own answer
                                (`withExecutions` in `project-api.ts`), and it is
                                the number on screen, so it is the number that
                                decides. §26.2's rule applies here too: nothing
                                can be missing, so zero really is zero. */}
                            {task.executionCount > 0
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

                <Panel id="project-inputs" title="Inputs" subtitle={`${current.inputs.length} data file${current.inputs.length === 1 ? '' : 's'}`}>
                  {current.inputs.length === 0
                    ? (
                      <EmptyState
                        kind="waiting"
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
                                definition checklist, on the Setup tab, names{' '}
                                {usage.unresolved === 1 ? 'it' : 'them'}.
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

                {/* The SCOPE is in the subtitle because the position implies the
                    wrong one (§28.4): this panel sits under five task-scoped
                    panels and is the PROJECT's, so a task selection does not
                    narrow it. The dashboard's Runs tab is the same reading one
                    scope wider — every project — and neither surface said which
                    it was until the audit. */}
                <Panel
                  id="project-executions"
                  title="Executions"
                  subtitle="every task in this project"
                  /* The three counts were the tail of a four-fact middot run in
                     one 12px grey string, where the number a reader is actually
                     looking for — how many failed — was the least visible thing
                     in it. As badges they carry their own colour, which is the
                     whole reason the palette exists. */
                  actions={(
                    <>
                      <Badge state="ok">{`${counts.ok} ok`}</Badge>
                      {counts.refused > 0 && <Badge state="warn">{`${counts.refused} refused`}</Badge>}
                      {counts.error > 0 && <Badge state="failed">{`${counts.error} error`}</Badge>}
                    </>
                  )}
                >
                  {byTask.length === 0
                    ? (
                      <EmptyState
                        kind="waiting"
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
                                // The selection axis §11 is built on was
                                // invisible on the surface that owns it (§28.7):
                                // the task row has carried an active mark since
                                // §11, the execution row carried none. It is also
                                // why a mismatched pair was so easy to fall into.
                                <li
                                  key={execution.executionId}
                                  className={`${styles.row} ${
                                    selection.executionId === execution.executionId
                                      ? styles.rowActive
                                      : ''}`}
                                  data-project-execution={execution.executionId}
                                  data-project-execution-active={
                                    selection.executionId === execution.executionId ? '' : undefined}
                                >
                                  <button
                                    type="button"
                                    className={styles.rowPick}
                                    data-project-select-execution={execution.executionId}
                                    onClick={() => {
                                      if (chosen === undefined) return
                                      // The TASK travels with the execution
                                      // (§28.4). This panel is the project's and
                                      // lists every task's executions, so picking
                                      // a row while another task is selected used
                                      // to leave the two disagreeing — and §28.1's
                                      // as-run comparison would then diff one
                                      // document's bytes against another's and
                                      // report an edit nobody made. The dashboard
                                      // already sets both; this row did not.
                                      // Through the ONE derivation, not a second
                                      // inline copy of it — this row used to
                                      // spell the join itself, which is how it
                                      // kept the dotted-basename bug
                                      // `taskPathForSegment` had already fixed.
                                      const owner = taskPathForSegment(current.tasks, execution.task)
                                      selectInProject(chosen, {
                                        ...(owner === undefined ? {} : { taskPath: owner }),
                                        executionId: execution.executionId,
                                      })
                                    }}
                                  >
                                    {/* SHORT, like every other place this id is
                                        rendered — the run picker two hundred
                                        lines up already does exactly this. The
                                        full 33 characters sat in a flex cell set
                                        to `overflow-wrap: anywhere`, so a run's
                                        name broke mid-identifier across two
                                        lines and the row under it started
                                        somewhere else.

                                        The path went with it: the id NAMES that
                                        directory, so the row was printing the
                                        same fact twice and the second copy was
                                        the one that could not shrink. */}
                                    <span className={styles.mono}>
                                      {shortExecutionId(execution.executionId)}
                                    </span>
                                  </button>
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
                </>
              )}

              {page === 'setup' && (
                <>
                {/* What this task is set up to do, and whether it is finished. */}
                {selection.taskPath !== undefined && selectedTask !== undefined && (
                  <Panel
                    id="project-task-plan"
                    title="How this is fitted"
                    subtitle="which parameters, by which step, with which settings"
                  >
                    {projected.shownFor !== `${chosen ?? ''} ${selection.taskPath}` || projected.loading
                      ? <EmptyState kind="arriving" message="Reading the setup…" />
                      : projected.projection !== undefined
                        ? (
                          <TaskPlan
                            runs={projected.projection.runs}
                            parameters={projected.projection.parameters}
                          />
                        )
                        : (
                          <EmptyState
                            kind="unavailable"
                            message="The setup could not be read from here"
                            hint="Needs the same reading of the file as the Model tab, so it is unavailable for the same reason — the remedy is stated there."
                          />
                        )}
                  </Panel>
                )}


                {selection.taskPath !== undefined && selectedTask !== undefined && (
                  <Panel
                    id="project-task-definition"
                    title="Is this task defined?"
                    subtitle="from the task file"
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

                {selection.taskPath !== undefined && (
                  <Panel
                    id="project-task-document"
                    title={selection.taskPath}
                    subtitle="the file as it is now"
                  >
                    {/* Guarded on `shownFor`: a document held across a change of
                        task would appear under the new task's title, which is
                        exactly the confusion §11 exists to remove. */}
                    {document_.shownFor !== `${chosen ?? ''} ${selection.taskPath}`
                      || document_.loading
                      ? <EmptyState kind="arriving" message="Reading the document…" />
                      : document_.document !== undefined
                        ? (
                          <>
                            <pre className={styles.document} data-project-document>
                              {document_.document.text}
                            </pre>
                            <p className={styles.note}>
                              {formatBytes(document_.document.bytes)} on disk. This is the file
                              as it is now. Each run keeps its own copy of the file it used
                              (<code>config.input.yaml</code>), so editing it here does not change
                              what past runs did — it makes them older than the file.
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
                                        : 'The copy this run used could not be read from here, so this shows only the file as it is now.'}
                                    </p>
                                  ))}
                          </>
                        )
                        : (
                          <EmptyState
                            kind="unavailable"
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
                </>
              )}

              {page === 'model' && (
                <>
                {/* What physics it declares, and what it computes. The diagram
                    comes FIRST: it is the headline and the catalogue beside it
                    is the reading of it. */}
                {selection.taskPath !== undefined && selectedTask !== undefined && (
                  <Panel
                    id="project-task-model"
                    // "Signal path", not "Model": the TAB is called Model and
                    // holds this panel and Exits, so a panel of the same name
                    // made the tab a claim about one of its two occupants.
                    // This is the repo's own word for the drawing (§28.1,
                    // `SignalPathPanel`). The id stays — it is the layout
                    // store's key, and renaming it would silently forget a
                    // reader's collapse state.
                    title="Signal path"
                    subtitle={model.source.showing === 'as-run'
                      ? 'the physics this run used'
                      : 'the physics this file sets up'}
                  >
                    {projected.shownFor !== `${chosen ?? ''} ${selection.taskPath}` || projected.loading
                      ? <EmptyState kind="arriving" message="Projecting the document…" />
                      : projected.projection !== undefined
                        ? (
                          // The as-run projection when it has arrived, the
                          // declared one until then. Falling back to the
                          // declared picture is safe ONLY because the switch
                          // says which is on screen — and it does, in both
                          // directions, including while the fetch is in flight.
                          <TaskModel
                            svg={model.comparing && model.asRun.projection !== undefined
                              ? model.asRun.projection.svg
                              : projected.projection.svg}
                            model={model.comparing && model.asRun.projection !== undefined
                              ? model.asRun.projection.model
                              : projected.projection.model}
                            source={model.source}
                          />
                        )
                        : (
                          <EmptyState
                            kind="unavailable"
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

                {selection.taskPath !== undefined && selectedTask !== undefined && (
                  <Panel
                    id="project-task-runs"
                    title="Exits"
                    subtitle="what this task computes, and what it is not reaching for"
                  >
                    {projected.shownFor !== `${chosen ?? ''} ${selection.taskPath}` || projected.loading
                      ? <EmptyState kind="arriving" message="Reading the exits…" />
                      : projected.projection !== undefined
                        ? <TaskRuns runs={projected.projection.runs} />
                        : (
                          <EmptyState
                            kind="unavailable"
                            message="The exits could not be listed from here"
                            hint="Needs the same reading of the file as Signal path above, so it is unavailable for the same reason — the remedy is stated there."
                          />
                        )}
                  </Panel>
                )}
                </>
              )}

              {page === 'results' && (
                <>
                {/* What it produced. The only tab the Panels menu governs. */}
                {/* THE RAIL READS THE TREE, so it belongs on the tab whose
                    subject is the tree. §12.3's argument for keeping it beside
                    the definition checklist is that the two read DIFFERENT
                    sources — the checklist the document, this the project — and
                    the split made that argument an argument for separating
                    them: Runs / Gates / Diagnostics is a summary of the panels
                    below it, and it spent one release two tabs away from them.
                    Its own detail text says "select this task's newest
                    execution", and on the Setup tab there was no control for
                    that within reach. */}

                {/* On the SAME layout store as the six panels directly
                    below it. It was the one panel on this tab with no
                    chevron, sitting immediately above a grid where every
                    occupant has one — so the affordance read as arbitrary
                    rather than as a property of panels. The store is keyed
                    by arbitrary id and this one is stable.

                    It stays out of the Panels menu, and that is not the same
                    gap: that menu's roster is the `task.panel` occupants
                    (`known-panels.ts` says so in its first line) and this
                    panel is not one — it is rendered here. Collapse is a
                    panel's own control; hide is the grid's. */}
                {selection.taskPath !== undefined && selectedTask !== undefined && (
                  <Panel
                    id="project-task-maturity"
                    title="How far this task has got"
                    subtitle="from what is on disk, not this chat"
                    collapsed={collapsedSet.has('project-task-maturity')}
                    onToggleCollapse={() => { actions.toggleCollapsed('project-task-maturity') }}
                  >
                    <TaskMaturity
                      task={selectedTask}
                      newest={newestOfTask}
                      view={newestOfTask?.executionId === selection.executionId ? executionView : undefined}
                      documentDigest={documentDigest}
                    />
                  </Panel>
                )}

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
                </>
              )}

              {/* A selection can outlive the file it names — deleted, renamed,
                  or moved out of the walk's reach. Saying so is better than the
                  panels quietly disappearing, which reads as a mis-click.

                  On EVERY task-scoped tab, not just one. It used to live on the
                  page that holds the checklist, which left Model rendering
                  wholly blank in this exact state — no panels (they are guarded
                  on the task being in the listing), no warning, no empty state.
                  That is the one case D1's own first rule exists to prevent.

                  And it said the executions were "still below". They are on the
                  Overview tab now. §28.6: a stale mapping from a word to a
                  place is worse than a stale anything else.

                  No `current.tasks.length > 0` guard. It was here to defer to
                  the empty-project checklist, which now lives on Overview — a
                  tab away — so all the guard did was reinstate the blank Model
                  tab for the one project shape that is hardest to reason about:
                  a task selected and a listing that came back empty. */}
              {taskScoped && selection.taskPath !== undefined
                && selectedTask === undefined && (
                <p className={styles.warning} data-project-task-gone="">
                  <code>{selection.taskPath}</code> is selected but is no longer in this
                  project&rsquo;s listing — it may have been renamed, deleted, or moved
                  beyond the depth this walk covers. Its executions, if it has any, are
                  on the Overview tab.
                </p>
              )}

              {/* NOT an `EmptyState`, and that is the point. Its three kinds are
                  about DATA — nothing produced it, it is arriving, it could not
                  be had — and a missing SELECTION is none of them: the project
                  has tasks, and this changes the moment the reader picks one.
                  A prompt is a fourth thing, and a prompt whose hint names a
                  control it does not offer ("pick one on the Overview tab") is
                  a surface that knows what it wants and will not do it. So it
                  carries the control. */}
              {taskScoped && selection.taskPath === undefined && (
                <div className={styles.prompt} data-workbench-prompt="task">
                  {/* A run WITHOUT its task is a different sentence. Reachable
                      without a truncated walk: tasks and executions are two
                      independent scans, so a renamed or deleted task file
                      leaves its executions listed, and a run opened from there
                      arrives with the task axis empty. Saying "No task
                      selected" beside a panel grid printing that run's task
                      path is the page contradicting itself. */}
                  <p className={styles.promptMessage}>
                    {selection.executionId === undefined
                      ? 'No task selected'
                      : 'This run\u2019s task is not in the listing'}
                  </p>
                  <p className={styles.promptHint}>
                    {selection.executionId === undefined
                      ? 'This tab is about one task, and there is not one yet.'
                      : 'The run is still readable, but the file it ran may have been renamed, deleted, or moved beyond this walk.'}
                  </p>
                  <button
                    type="button"
                    className={styles.action}
                    data-workbench-prompt-go="overview"
                    onClick={() => { showWorkbenchPage('overview') }}
                  >
                    Choose a task
                  </button>
                </div>
              )}
              {page === 'results' && selection.taskPath !== undefined
                && selection.executionId === undefined && (
                <div className={styles.prompt} data-workbench-prompt="execution">
                  <p className={styles.promptMessage}>No execution selected</p>
                  <p className={styles.promptHint}>
                    These panels read the files one run wrote.
                  </p>
                  <button
                    type="button"
                    className={styles.action}
                    data-workbench-prompt-go="overview"
                    onClick={() => { showWorkbenchPage('overview') }}
                  >
                    Choose an execution
                  </button>
                </div>
              )}
            </div>
          )}
      </section>
    </div>
  )
})

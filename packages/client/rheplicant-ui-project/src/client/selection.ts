/**
 * Which task and which execution one PROJECT is showing.
 *
 * `docs/project-model.md` §11.2. The store that replaces addressing-by-session.
 * Every surface — the workbench, a session's console tab — reads and writes
 * this one selection, keyed by workspace, so they cannot disagree and none of
 * them has to ask which conversation it is in.
 *
 * **Why `select` and `propose` are different verbs.** A session used to be the
 * addressing dimension, which is what made "one session, one task" structural.
 * Removing it must not also remove `ask → run → see`: after a run finishes you
 * still want to be looking at what just ran. So a finished run PROPOSES its
 * execution and a human SELECTS one, and a proposal never overrides a
 * selection. That turns "show me what I just ran" from a structural fact into
 * a stated default — which is the whole distinction this phase exists to make.
 *
 * Not persisted. A selection is where you are looking right now; restoring it
 * across a reload would resurrect a choice whose context is gone.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/selection
 */

import { useSyncExternalStore } from 'react'

/** Which axes a human chose explicitly. A proposal may not touch these. */
export interface SelectionPins {
  readonly task: boolean
  readonly execution: boolean
}

/** What one project is showing. */
export interface ProjectSelection {
  /** Workspace-relative task path, e.g. `tasks/fit.yaml`. */
  readonly taskPath: string | undefined
  readonly executionId: string | undefined
  readonly pinned: SelectionPins
}

/**
 * The axes a caller may set.
 *
 * ABSENT means "leave this one alone". PRESENT-AND-`undefined` means "clear
 * this one" — two different requests, and `selectInProject` tells them apart
 * by key presence rather than by value. It used to fold with `??`, which
 * merged them: the task picker's `{ taskPath: next, executionId: undefined }`
 * asked to drop the run and was read as asking to keep it, so a selected run
 * survived every task change and the owner-effect then wrote the old run's
 * task straight back over the one just chosen. The picker looked inert
 * because, for as long as any run was selected, it was.
 */
export interface SelectionPatch {
  readonly taskPath?: string | undefined
  readonly executionId?: string | undefined
}

/**
 * The state of a project nobody has touched.
 *
 * One frozen instance, deliberately: `useSyncExternalStore` compares snapshots
 * by identity, so every untouched project must answer with the SAME object or
 * a subscribed component re-renders forever.
 */
const UNTOUCHED: ProjectSelection = Object.freeze({
  taskPath: undefined,
  executionId: undefined,
  pinned: Object.freeze({ task: false, execution: false }),
})

const selections = new Map<string, ProjectSelection>()
const listeners = new Set<() => void>()

/** Publish one project's new state, waking subscribers only on a real change. */
function commit(workspaceId: string, next: ProjectSelection): void {
  const current = selections.get(workspaceId) ?? UNTOUCHED
  if (current.taskPath === next.taskPath
    && current.executionId === next.executionId
    && current.pinned.task === next.pinned.task
    && current.pinned.execution === next.pinned.execution) return
  selections.set(workspaceId, next)
  for (const listener of listeners) listener()
}

/**
 * Choose explicitly, pinning the axes named.
 *
 * An axis the patch does not mention keeps its value and its pin. An axis the
 * patch mentions takes the new value — and clearing one (`undefined`) also
 * UNPINS it, because a pin records "a human chose this" and there is no longer
 * a choice to record.
 *
 * @param workspaceId - the project this choice belongs to.
 * @param patch - the axes to set; see {@link SelectionPatch} for why presence
 *   and value are read separately.
 */
export function selectInProject(workspaceId: string, patch: SelectionPatch): void {
  if (workspaceId === '') return
  const current = readSelection(workspaceId)
  const setsTask = 'taskPath' in patch
  const setsExecution = 'executionId' in patch
  commit(workspaceId, {
    taskPath: setsTask ? patch.taskPath : current.taskPath,
    executionId: setsExecution ? patch.executionId : current.executionId,
    pinned: {
      task: setsTask ? patch.taskPath !== undefined : current.pinned.task,
      execution: setsExecution ? patch.executionId !== undefined : current.pinned.execution,
    },
  })
}

/**
 * Offer a default for the axes nobody has pinned.
 *
 * What a finished run calls. It never pins and never overrides a pin, so a
 * background run cannot yank the view away from the execution someone opened
 * on purpose.
 *
 * @param workspaceId - the project this default belongs to.
 * @param patch - the axes to fill if they are free.
 */
export function proposeSelection(workspaceId: string, patch: SelectionPatch): void {
  if (workspaceId === '') return
  const current = readSelection(workspaceId)
  commit(workspaceId, {
    taskPath: current.pinned.task ? current.taskPath : patch.taskPath ?? current.taskPath,
    executionId: current.pinned.execution
      ? current.executionId
      : patch.executionId ?? current.executionId,
    pinned: current.pinned,
  })
}

/**
 * Forget this project's selection and go back to following the default.
 * @param workspaceId - the project to reset.
 */
export function clearSelection(workspaceId: string): void {
  if (workspaceId === '') return
  commit(workspaceId, UNTOUCHED)
}

/**
 * What one project is showing right now.
 * @param workspaceId - the project to read.
 * @returns its selection; the shared untouched state when it has none.
 */
export function readSelection(workspaceId: string): ProjectSelection {
  return selections.get(workspaceId) ?? UNTOUCHED
}

/**
 * Subscribe to selection changes across every project.
 * @param listener - called after any project's selection changes.
 * @returns the unsubscribe.
 */
export function subscribeSelection(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Drop every project's selection. Exists for tests, which share a module. */
export function resetSelections(): void {
  const touched = [...selections.keys()]
  selections.clear()
  if (touched.length === 0) return
  for (const listener of listeners) listener()
}

/**
 * Subscribe a component to one project's selection.
 * @param workspaceId - the project to watch, or undefined for none chosen.
 * @returns its selection, or the untouched state.
 */
export function useSelection(workspaceId: string | undefined): ProjectSelection {
  return useSyncExternalStore(
    subscribeSelection,
    () => (workspaceId === undefined ? UNTOUCHED : readSelection(workspaceId)),
    () => UNTOUCHED,
  )
}

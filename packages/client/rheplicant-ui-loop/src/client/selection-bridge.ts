/**
 * How the console reaches the PROJECT's selection (`docs/project-model.md`
 * §11.2).
 *
 * The selection lives in `ui-project`, in a different client bundle, so the
 * console reaches it through `ctx.get('rheplicantSelection')` — captured here
 * by `apply()`, because React components have no route to the plugin context.
 *
 * **The fallback is deliberately dumber than the real thing.** With no project
 * surface mounted there is exactly one writer — this console — so there is no
 * conflict for pinning to arbitrate, and `propose` collapses into `select`.
 * Reimplementing the pin semantics here would be duplicating a rule that
 * cannot fire.
 *
 * @module @rheplicant/dsh-rheplicant-ui-loop/client/selection-bridge
 */

import { useSyncExternalStore } from 'react'

/** The axes a caller may set; an absent axis is left alone. */
export interface SelectionPatch {
  readonly taskPath?: string | undefined
  readonly executionId?: string | undefined
}

/** What one project is showing. */
export interface ProjectSelection {
  readonly taskPath: string | undefined
  readonly executionId: string | undefined
  readonly pinned: { readonly task: boolean; readonly execution: boolean }
}

/** The face `ui-project` publishes, as this package needs it. */
export interface SelectionSource {
  select(workspaceId: string, patch: SelectionPatch): void
  propose(workspaceId: string, patch: SelectionPatch): void
  read(workspaceId: string): ProjectSelection
  subscribe(listener: () => void): () => void
}

/** One frozen instance: `useSyncExternalStore` compares snapshots by identity. */
const UNTOUCHED: ProjectSelection = Object.freeze({
  taskPath: undefined,
  executionId: undefined,
  pinned: Object.freeze({ task: false, execution: false }),
})

/** The local stand-in used when no project surface is mounted. */
const local = new Map<string, ProjectSelection>()
const localListeners = new Set<() => void>()

const fallback: SelectionSource = {
  select(workspaceId, patch) {
    if (workspaceId === '') return
    const current = local.get(workspaceId) ?? UNTOUCHED
    const next: ProjectSelection = {
      taskPath: patch.taskPath ?? current.taskPath,
      executionId: patch.executionId ?? current.executionId,
      pinned: UNTOUCHED.pinned,
    }
    if (next.taskPath === current.taskPath && next.executionId === current.executionId) return
    local.set(workspaceId, next)
    for (const listener of localListeners) listener()
  },
  // One writer, so nothing to arbitrate: see this module's header.
  propose(workspaceId, patch) { fallback.select(workspaceId, patch) },
  read(workspaceId) { return local.get(workspaceId) ?? UNTOUCHED },
  subscribe(listener) {
    localListeners.add(listener)
    return () => { localListeners.delete(listener) }
  },
}

/**
 * How the service is found.
 *
 * A thunk, not the service itself: `ctx.get` at `apply()` time answers
 * `undefined` when the provider mounts LATER in the composition, and mount
 * order is a profile's business, not this package's. Resolving on first use
 * makes the console indifferent to it.
 */
let locate: (() => SelectionSource | undefined) | undefined
let resolved: SelectionSource | undefined

/**
 * Install the lookup. Called once from `apply()`.
 * @param next - the thunk, or undefined to uninstall (tests).
 */
export function setSelectionSource(next: (() => SelectionSource | undefined) | undefined): void {
  locate = next
  resolved = undefined
}

/** The project's selection service, or the local stand-in. */
function source(): SelectionSource {
  resolved ??= locate?.()
  return resolved ?? fallback
}

/**
 * Subscribe a component to one project's selection.
 * @param workspaceId - the project to watch, or undefined when it is unknown.
 * @returns its selection, or the untouched state.
 */
export function useProjectSelection(workspaceId: string | undefined): ProjectSelection {
  return useSyncExternalStore(
    listener => source().subscribe(listener),
    () => (workspaceId === undefined ? UNTOUCHED : source().read(workspaceId)),
    () => UNTOUCHED,
  )
}

/**
 * Choose an execution explicitly — what the console's picker does.
 * @param workspaceId - the project.
 * @param executionId - the execution the human picked.
 */
export function chooseExecution(workspaceId: string | undefined, executionId: string): void {
  if (workspaceId === undefined) return
  source().select(workspaceId, { executionId })
}

/**
 * Offer an execution as the default — what a finished run does.
 * @param workspaceId - the project.
 * @param executionId - the execution that just became available.
 */
export function proposeExecution(workspaceId: string | undefined, executionId: string): void {
  if (workspaceId === undefined) return
  source().propose(workspaceId, { executionId })
}

/** Drop the local stand-in's state. Exists for tests, which share a module. */
export function resetLocalSelection(): void {
  local.clear()
  for (const listener of localListeners) listener()
}

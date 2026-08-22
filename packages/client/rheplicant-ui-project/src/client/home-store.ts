/**
 * Whether the project home is open, shared between the trigger and the page.
 *
 * A module-level store rather than a framework one, and the reason is
 * structural: the two halves of this feature occupy two DIFFERENT slots —
 * `sidebar.footer.action` for the trigger and `shell.overlay` for the page —
 * so no React context spans them and no owner-props channel connects them
 * (that channel runs from one owner to ITS occupants, and these two have
 * different owners).
 *
 * This is safe here for exactly the reason the same trick is NOT safe in
 * `ui-kit`: ui-kit is INLINED into each consuming plugin's bundle, so a
 * module-level value there is one copy per plugin and shares nothing. Both
 * readers here live in THIS plugin's single bundle, so they see one module
 * instance and one value.
 *
 * Deliberately not persisted. The home is a chooser, and an app that reopened
 * a full-frame overlay on every reload would be an app you have to dismiss
 * before you can work.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/home-store
 */

import { useSyncExternalStore } from 'react'

/** What the home is showing: closed, or open on one project. */
export interface HomeState {
  readonly open: boolean
  /** The workspace whose project is being inspected, when one is chosen. */
  readonly workspaceId: string | undefined
}

const CLOSED: HomeState = { open: false, workspaceId: undefined }

let state: HomeState = CLOSED
const listeners = new Set<() => void>()

/** Publish a new state and wake every subscriber. */
function commit(next: HomeState): void {
  // Referential equality is the subscription contract `useSyncExternalStore`
  // relies on, so a no-op write must not produce a new object.
  if (next.open === state.open && next.workspaceId === state.workspaceId) return
  state = next
  for (const listener of listeners) listener()
}

/** Subscribe to home-state changes; returns the unsubscribe. */
function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Open the home, optionally on a specific project. */
export function openHome(workspaceId?: string): void {
  commit({ open: true, workspaceId: workspaceId ?? state.workspaceId })
}

/** Close the home, remembering which project was being inspected. */
export function closeHome(): void {
  commit({ ...state, open: false })
}

/** Toggle the home — what the sidebar trigger does. */
export function toggleHome(): void {
  commit({ ...state, open: !state.open })
}

/** Choose which project the home inspects. */
export function selectProject(workspaceId: string): void {
  commit({ ...state, workspaceId })
}

/** Reset to closed with no selection. Exists for tests, which share a module. */
export function resetHome(): void {
  commit(CLOSED)
}

/** Read the current state without subscribing. */
export function readHome(): HomeState {
  return state
}

/** Subscribe a component to the home state. */
export function useHome(): HomeState {
  // The third argument is the server snapshot: this plugin only ever runs in
  // a browser, but passing it keeps the hook from throwing if the bundle is
  // ever evaluated during a pre-render.
  return useSyncExternalStore(subscribe, readHome, readHome)
}

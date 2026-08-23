/**
 * Which of the two peer sections is on screen — the project, or the
 * conversation — shared between the switch and the page.
 *
 * `docs/project-model.md` §20.2. This was an OPEN/CLOSED flag for a modal
 * overlay; it is a SECTION flag now, and the difference is not cosmetic. A
 * modal is a thing you dismiss before you can work; a section is a place you
 * are, and a place you are is a thing the app should still know about after a
 * reload. So this persists, where the modal deliberately did not — its own
 * comment used to say "an app that reopened a full-frame overlay on every
 * reload would be an app you have to dismiss before you can work", which was
 * true of an overlay and is not true of a section.
 *
 * A module-level store rather than a framework one, and the reason is
 * structural: the two halves of this feature occupy two DIFFERENT slots —
 * `sidebar.footer.action` for the switch and `shell.overlay` for the page —
 * so no React context spans them and no owner-props channel connects them
 * (that channel runs from one owner to ITS occupants, and these two have
 * different owners).
 *
 * This is safe here for exactly the reason the same trick is NOT safe in
 * `ui-kit`: ui-kit is INLINED into each consuming plugin's bundle, so a
 * module-level value there is one copy per plugin and shares nothing. Both
 * readers here live in THIS plugin's single bundle, so they see one module
 * instance and one value. A reader in ANOTHER bundle — the chat result node —
 * reaches it through `workbench-service.ts` instead, for the same reason.
 *
 * **Only the section is remembered, never the project.** Which workspace was
 * being inspected is re-derived on load from the host's own
 * `recentWorkspaceId`, which is a live answer to "which project is this person
 * in"; a persisted id would outlive the workspace it names and pin the page to
 * a project that is no longer there.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/home-store
 */

import { useSyncExternalStore } from 'react'

/** What the workbench is showing: the section flag, and the project in view. */
export interface HomeState {
  readonly open: boolean
  /** The workspace whose project is being inspected, when one is chosen. */
  readonly workspaceId: string | undefined
}

const CLOSED: HomeState = { open: false, workspaceId: undefined }

/**
 * Where the section flag is remembered.
 *
 * The `dsh.<feature>` dotted convention the framework's own stores use
 * (`dsh.conversation.chat`), in this package's namespace — matching
 * `rheplicant.console.layout`, which the console's engine store already writes.
 */
const SECTION_KEY = 'rheplicant.project.section'

/**
 * Read the remembered section.
 *
 * Every access is guarded: `localStorage` throws outright in a browser with
 * storage disabled, and a page that failed to mount because it could not
 * remember which tab you were on would be a worse page than one that forgets.
 *
 * @returns true when the project section was the one on screen.
 */
function rememberedSection(): boolean {
  try {
    return globalThis.localStorage?.getItem(SECTION_KEY) === 'project'
  } catch {
    return false
  }
}

/** Remember the section, or forget it. Failures are not worth a broken page. */
function remember(open: boolean): void {
  try {
    if (open) globalThis.localStorage?.setItem(SECTION_KEY, 'project')
    else globalThis.localStorage?.removeItem(SECTION_KEY)
  } catch {
    // Storage refused. The section still works for this page load.
  }
}

let state: HomeState = { open: rememberedSection(), workspaceId: undefined }
const listeners = new Set<() => void>()

/** Publish a new state and wake every subscriber. */
function commit(next: HomeState): void {
  // Referential equality is the subscription contract `useSyncExternalStore`
  // relies on, so a no-op write must not produce a new object.
  if (next.open === state.open && next.workspaceId === state.workspaceId) return
  if (next.open !== state.open) remember(next.open)
  state = next
  for (const listener of listeners) listener()
}

/**
 * Subscribe to section changes; returns the unsubscribe.
 *
 * Exported because `workbench-service.ts` republishes it across bundles — a
 * consumer in another plugin cannot import this module and see the same
 * instance, so the service is the channel and this is what it carries.
 */
export function subscribeHome(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Show the project section, optionally on a specific project. */
export function openHome(workspaceId?: string): void {
  commit({ open: true, workspaceId: workspaceId ?? state.workspaceId })
}

/** Go back to the conversation, remembering which project was being inspected. */
export function closeHome(): void {
  commit({ ...state, open: false })
}

/** Switch between the two sections — what the sidebar control does. */
export function toggleHome(): void {
  commit({ ...state, open: !state.open })
}

/** Choose which project the workbench inspects. */
export function selectProject(workspaceId: string): void {
  commit({ ...state, workspaceId })
}

/**
 * Reset to the conversation with no project chosen, and forget the section.
 * Exists for tests, which share a module AND a storage.
 */
export function resetHome(): void {
  commit(CLOSED)
  remember(false)
}

/** Read the current state without subscribing. */
export function readHome(): HomeState {
  return state
}

/** Subscribe a component to the section state. */
export function useHome(): HomeState {
  // The third argument is the server snapshot: this plugin only ever runs in
  // a browser, but passing it keeps the hook from throwing if the bundle is
  // ever evaluated during a pre-render. It answers with the CONVERSATION
  // section, because a pre-render has no storage to have remembered anything.
  return useSyncExternalStore(subscribeHome, readHome, () => CLOSED)
}

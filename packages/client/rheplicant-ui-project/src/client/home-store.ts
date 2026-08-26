/**
 * Which peer section is on screen — the conversation, or one of the surfaces
 * beside it — shared between every nav row and every page.
 *
 * `docs/project-model.md` §20.2 and §25. This was an OPEN/CLOSED flag for a
 * modal overlay, then a two-valued section flag, and it is a NAMED section now
 * because there is more than one place to be. Mutual exclusion is structural:
 * one variable holds one name, so two sections cannot both paint the column,
 * and a new nav row costs a member of the union rather than a second flag that
 * has to be kept false. A
 * modal is a thing you dismiss before you can work; a section is a place you
 * are, and a place you are is a thing the app should still know about after a
 * reload. So this persists, where the modal deliberately did not — its own
 * comment used to say "an app that reopened a full-frame overlay on every
 * reload would be an app you have to dismiss before you can work", which was
 * true of an overlay and is not true of a section.
 *
 * A module-level store rather than a framework one, and the reason is
 * structural: the halves of this feature occupy DIFFERENT slots —
 * `sidebar.nav` for the rows and `section` for the pages — so no React context
 * spans them and no owner-props channel connects them (that channel runs from
 * one owner to ITS occupants, and these have different owners).
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

/**
 * Where you are.
 *
 * `conversation` is the transcript — the absence of a section, and the only
 * member that names no page. Every other member names a `section` occupant.
 */
export type Section = 'conversation' | 'workbench' | 'dashboard'

/** Which section is on screen, and the project in view. */
export interface HomeState {
  readonly section: Section
  /** The workspace whose project is being inspected, when one is chosen. */
  readonly workspaceId: string | undefined
}

const CLOSED: HomeState = { section: 'conversation', workspaceId: undefined }

/** The stored names, so a value written by an older build is not trusted. */
const SECTIONS: readonly Section[] = ['conversation', 'workbench', 'dashboard']

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
 * A name this build does not know is read as the conversation rather than
 * trusted: storage outlives the code that wrote it, and the failure of the
 * alternative is a blank column with no way back.
 *
 * `project` is accepted as a synonym for `workbench` because that is what
 * builds before §25 wrote, and a person who left the app in the workbench
 * should find it there.
 *
 * @returns the remembered section.
 */
function rememberedSection(): Section {
  try {
    const stored = globalThis.localStorage?.getItem(SECTION_KEY)
    if (stored === 'project') return 'workbench'
    return SECTIONS.find(name => name === stored) ?? 'conversation'
  } catch {
    return 'conversation'
  }
}

/** Remember the section, or forget it. Failures are not worth a broken page. */
function remember(section: Section): void {
  try {
    if (section === 'conversation') globalThis.localStorage?.removeItem(SECTION_KEY)
    else globalThis.localStorage?.setItem(SECTION_KEY, section)
  } catch {
    // Storage refused. The section still works for this page load.
  }
}

let state: HomeState = { section: rememberedSection(), workspaceId: undefined }
const listeners = new Set<() => void>()

/** Publish a new state and wake every subscriber. */
function commit(next: HomeState): void {
  // Referential equality is the subscription contract `useSyncExternalStore`
  // relies on, so a no-op write must not produce a new object.
  if (next.section === state.section && next.workspaceId === state.workspaceId) return
  if (next.section !== state.section) remember(next.section)
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

/** Show one section, optionally on a specific project. */
export function showSection(section: Section, workspaceId?: string): void {
  commit({ section, workspaceId: workspaceId ?? state.workspaceId })
}

/** Show the workbench, optionally on a specific project. */
export function openHome(workspaceId?: string): void {
  showSection('workbench', workspaceId)
}

/** Go back to the conversation, remembering which project was being inspected. */
export function closeHome(): void {
  commit({ ...state, section: 'conversation' })
}

/**
 * Toggle one section against the conversation — what a nav row does.
 *
 * Pressing the row you are already on returns you to the transcript, and
 * pressing a different row switches directly to it: the row is a toggle for
 * ITS section, never a toggle of "some section is showing".
 */
export function toggleSection(section: Section): void {
  commit({ ...state, section: state.section === section ? 'conversation' : section })
}

/** Switch the workbench against the conversation. */
export function toggleHome(): void {
  toggleSection('workbench')
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
  remember('conversation')
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

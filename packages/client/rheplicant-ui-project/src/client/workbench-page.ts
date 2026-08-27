/**
 * Which of the workbench's four tabs is on screen.
 *
 * `docs/superpowers/specs/2026-08-27-workbench-pages.md` D1. The workbench
 * answered four different questions and stacked all four answers in one
 * scroll — measured at **6 484 px** on the demo task, eight panels plus a
 * six-panel grid. It is four tabs now.
 *
 * **Subordinate to `home-store`'s `Section`, not a peer of it.** That variable
 * says WHERE YOU ARE (§25.1: conversation / workbench / dashboard) and is the
 * one this app navigates by; this one says which page of the workbench you
 * were on when you were last there. A page is meaningless while the section is
 * the conversation, which is exactly why it is a second variable rather than
 * four more members of the first: the union would then hold states like
 * `conversation`+`model` that cannot happen, and §25.1's argument for one
 * variable is that a state which cannot happen should not be representable.
 *
 * Same module-store idiom, and safe for the same reason: both readers live in
 * THIS plugin's single bundle. A reader in another bundle would need
 * `workbench-service.ts`, and none wants this.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/workbench-page
 */

import { useSyncExternalStore } from 'react'

/**
 * The four questions, in the order a person meets them.
 *
 * Each name is the QUESTION's subject rather than a panel's title, because
 * three of the four hold more than one panel and a tab named after one of them
 * would be a claim about the others.
 *
 * **Two of these were renamed in review, and both for collisions this project
 * has a documented history with.**
 *
 * - `overview`, not `project`. HANDOVER's vocabulary table carves out exactly
 *   one surviving use of the word "project" on this surface — the eyebrow over
 *   the project name and the picker's accessible name — and says they name the
 *   ENTITY the workbench is showing, not a surface. A tab named Project names
 *   a surface, three rows from both of them.
 * - `setup` and `results`, which are the DASHBOARD's own two words. It splits
 *   every project into Setups (what was configured) and Runs (what happened),
 *   and the workbench is that same split for ONE project — so the two surfaces
 *   now teach one vocabulary instead of two. A review argued `analysis` for the
 *   second, on the ground that `results/<task>/<id>/` is §5's on-disk tree and
 *   the Executions panel prints those paths on a different tab. Overridden:
 *   the tab shows what is IN that tree, so the two names agreeing is the truth
 *   rather than a collision, and "Results" is the word a reader already has.
 */
export type WorkbenchPage = 'overview' | 'setup' | 'model' | 'results'

/** The stored names, so a value written by an older build is not trusted. */
const PAGES: readonly WorkbenchPage[] = ['overview', 'setup', 'model', 'results']

/**
 * Where the page is remembered — beside `rheplicant.project.section`, in the
 * same `<feature>.<thing>` shape, so the two read as one family in a storage
 * inspector rather than as two unrelated keys.
 */
const PAGE_KEY = 'rheplicant.workbench.page'

/** The page a first visit lands on: the one that needs nothing selected. */
const DEFAULT_PAGE: WorkbenchPage = 'overview'

/**
 * Read the remembered page.
 *
 * Guarded exactly as `home-store`'s is, and for the same reason: `localStorage`
 * throws outright with storage disabled, and a page that failed to mount
 * because it could not remember a tab would be worse than one that forgets.
 *
 * @returns the remembered page, or the default.
 */
function rememberedPage(): WorkbenchPage {
  try {
    const stored = globalThis.localStorage?.getItem(PAGE_KEY)
    return PAGES.find(name => name === stored) ?? DEFAULT_PAGE
  } catch {
    return DEFAULT_PAGE
  }
}

/** Remember the page. A storage failure is not worth a broken surface. */
function remember(page: WorkbenchPage): void {
  try {
    globalThis.localStorage?.setItem(PAGE_KEY, page)
  } catch {
    // Storage refused. The tab still works for this page load.
  }
}

let page: WorkbenchPage = rememberedPage()
const listeners = new Set<() => void>()

/**
 * Subscribe to page changes.
 *
 * @param listener - called after every change.
 * @returns the unsubscribe.
 */
export function subscribeWorkbenchPage(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * Show one page.
 *
 * @param next - the page to show.
 */
export function showWorkbenchPage(next: WorkbenchPage): void {
  if (next === page) return
  page = next
  remember(page)
  for (const listener of listeners) listener()
}

/** @returns the page on screen, without subscribing. */
export function readWorkbenchPage(): WorkbenchPage {
  return page
}

/** @returns the page on screen, re-rendering the caller when it changes. */
export function useWorkbenchPage(): WorkbenchPage {
  return useSyncExternalStore(subscribeWorkbenchPage, readWorkbenchPage, readWorkbenchPage)
}

/** Reset to the default. Tests only — nothing in the app un-chooses a page. */
export function resetWorkbenchPage(): void {
  page = DEFAULT_PAGE
  try {
    globalThis.localStorage?.removeItem(PAGE_KEY)
  } catch {
    // Storage refused; the in-memory reset stands.
  }
  for (const listener of listeners) listener()
}

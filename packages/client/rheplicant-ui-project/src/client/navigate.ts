/**
 * Leaving the workbench for a session — the one thing the home DOES rather
 * than shows.
 *
 * The capabilities this needs (`ctx.workspaces`, `ctx.sessions`, and the
 * console's optional navigation face) live on the plugin context, which React
 * components have no route to: this plugin occupies two slots it does not own,
 * so there is no owner-props channel carrying them in. `apply()` captures them
 * here once, and the components call through.
 *
 * A navigator that was never installed leaves the home a pure chooser: the
 * rows render, they simply do not offer to open anything. That is the honest
 * degradation for a composition that mounted this plugin without a
 * conversation surface to send anyone to.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/navigate
 */

import { closeHome } from './home-store.ts'

/** What opening a project needs from the host page. */
export interface Navigator {
  /**
   * Connect a workspace and return the session that now represents it.
   * `ctx.workspaces.connectWorkspace`.
   */
  connect: (workspaceId: string) => Promise<string>
  /** Bring one session to the front. `ctx.sessions.open`. */
  open: (sessionId: string) => void
}

let navigator: Navigator | undefined

/**
 * Install the navigator. Called once from `apply()`.
 * @param next - the capabilities, or undefined to uninstall (tests).
 */
export function setNavigator(next: Navigator | undefined): void {
  navigator = next
}

/** Whether the home can open anything at all. */
export function canNavigate(): boolean {
  return navigator !== undefined
}

/**
 * Open a conversation in one project, and close the home.
 *
 * **This no longer targets the session that produced an execution.** P6 had
 * to: an execution could only be SHOWN inside a console, a console only exists
 * in a session, and `connect` hands back the project's BLANK session — the
 * hero screen, which mounts no console tab. So the jump had to hunt for a
 * session that already had one.
 *
 * The workbench renders all of those surfaces with no session at all (§11.5),
 * so that whole search is gone. What is left is the only thing this action
 * ever meant: go and WORK on this project.
 *
 * **It no longer takes a target, 2026-08-26.** It used to accept a task and an
 * execution to arrive selected, and `ProjectHome` passed them from a button on
 * every task row. That affordance is gone for the reason §11.11 removed its
 * per-execution twin: the destination did not differ. A blank conversation
 * renders nothing about the selection, and the selection is browser-half only
 * — `ctx.rheplicantSelection` never crosses to the host, so the agent you
 * landed in front of could not read it either. Carrying a task to a place that
 * cannot use it is not navigation, and the parameter that carried it is gone
 * rather than left for a caller who might believe it does something.
 *
 * @param workspaceId - the project to open.
 * @returns resolution after the session is open; rejects if connecting fails.
 */
export async function openProject(workspaceId: string): Promise<void> {
  const via = navigator
  if (via === undefined) return
  via.open(await via.connect(workspaceId))
  // Closed only after the jump succeeded. A home that closed first and then
  // failed to connect would leave someone looking at the session they were
  // already in, with no sign that anything had gone wrong.
  closeHome()
}

/**
 * Leaving the project home for a session — the one thing the home DOES rather
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
import { selectInProject } from './selection.ts'

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

/** What to have in view once a conversation opens. */
export interface OpenTarget {
  /** The task to select, so the workbench and console agree on arrival. */
  readonly taskPath?: string | undefined
  /** The execution to select alongside it, when the task has one. */
  readonly executionId?: string | undefined
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
 * ever meant: go and WORK on this project. A blank conversation is the right
 * place to land for that, and the selection travels because it belongs to the
 * project rather than to wherever you happen to be standing.
 *
 * @param workspaceId - the project to open.
 * @param target - what to have selected on arrival.
 * @returns resolution after the session is open; rejects if connecting fails.
 */
export async function openProject(workspaceId: string, target: OpenTarget = {}): Promise<void> {
  const via = navigator
  if (via === undefined) return
  // Selected BEFORE the jump, so whatever renders next already agrees.
  if (target.taskPath !== undefined || target.executionId !== undefined) {
    selectInProject(workspaceId, {
      ...(target.taskPath === undefined ? {} : { taskPath: target.taskPath }),
      ...(target.executionId === undefined ? {} : { executionId: target.executionId }),
    })
  }
  via.open(await via.connect(workspaceId))
  // Closed only after the jump succeeded. A home that closed first and then
  // failed to connect would leave someone looking at the session they were
  // already in, with no sign that anything had gone wrong.
  closeHome()
}

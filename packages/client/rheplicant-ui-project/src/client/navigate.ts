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

/** Where a row wants to land. */
export interface OpenTarget {
  /** The execution to show once there, when the row names one. */
  readonly executionId?: string | undefined
  /**
   * A session to open directly, instead of connecting the workspace.
   *
   * This is what makes "open this execution" actually show it. `connect` is
   * the WORKSPACE-SWITCH primitive: it hands back the project's BLANK session
   * (ui-conversation's own picker documents it as "switches to that
   * workspace's blank session"). A blank session is the hero screen — no
   * console tab exists there, so a requested execution has nowhere to appear
   * and simply waits. Measured in a real boot, which is the only place it
   * shows.
   *
   * The caller supplies the session that PRODUCED the execution, which our own
   * sidecar recorded and the listing already carries, having first checked it
   * still exists. Absent when we do not know one, or it is gone.
   */
  readonly inSession?: string | undefined
}

/**
 * Open one project, optionally on one execution, and close the home.
 *
 * The selection is set before the jump, so the console reads it as it mounts
 * rather than visibly jumping a moment later. It no longer needs the session
 * id first — a selection belongs to the project, not to a conversation — which
 * is why this is simpler than P6's version.
 *
 * @param workspaceId - the project to open.
 * @param target - what to show, and where.
 * @returns resolution after the session is open; rejects if connecting fails.
 */
export async function openProject(workspaceId: string, target: OpenTarget = {}): Promise<void> {
  const via = navigator
  if (via === undefined) return
  // A known producing session is opened as-is: connecting the workspace would
  // send us to its blank session instead, losing the console that can show
  // this execution.
  // The selection is set FIRST and is not addressed to any session: it is the
  // project's, so whichever surface renders next reads the same thing. This is
  // what replaced P6's "ask that session's console" — see §11.2.
  if (target.executionId !== undefined && target.executionId !== '') {
    selectInProject(workspaceId, { executionId: target.executionId })
  }
  const sessionId = target.inSession !== undefined && target.inSession !== ''
    ? target.inSession
    : await via.connect(workspaceId)
  via.open(sessionId)
  // Closed only after the jump succeeded. A home that closed first and then
  // failed to connect would leave someone looking at the session they were
  // already in, with no sign that anything had gone wrong.
  closeHome()
}

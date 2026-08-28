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
  /**
   * Whether the host can show a path in the OS file manager, re-read on every
   * call rather than captured.
   *
   * A THUNK, for `selection-bridge.ts`'s reason: the answer is
   * `connection.isLoopback && hostDescription.getSnapshot()?.canOpenPath`, and
   * the description arrives with the connection — after `apply()` runs, and
   * again after every reconnect. A boolean captured at install time would say
   * "no" for the life of the page.
   *
   * It is false on a headless or containerised Linux host (no WSL, no
   * `DISPLAY`, no `WAYLAND_DISPLAY`) and on any page served to a non-loopback
   * authority — DSH pins `host.openPath` to loopback in its own API gateway,
   * so a remote page asking would be refused at the wire and the control would
   * be a lie.
   */
  canReveal: () => boolean
  /** Show a path in the OS file manager. `ctx.workspaces.openPath`. */
  reveal: (path: string) => Promise<void>
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

/**
 * Open one session by id, and close the home.
 *
 * **This is the jump `openProject` could not be.** That one connects a
 * project's reusable BLANK session and carries nothing — not a schedule's
 * name, prompt, cadence or state — so a person who arrived there met an agent
 * that could not answer "change it to nine". This one names a session that
 * already exists and already knows: a routine's session opens with a framing
 * (`routine.ts`) whose first message states the routine's name, cadence,
 * occurrence and prompt. Nothing has to be carried, because it is already
 * there.
 *
 * **It asserts nothing about the session existing.** The id came off a record
 * written when a firing opened it, and a session can be deleted from the
 * sidebar afterwards. The host owns that answer; this asks and does not
 * pretend to know. The home closes either way — a home that stayed open on a
 * failed jump would leave someone looking at the board with no sign anything
 * had happened, which is the opposite of `openProject`'s reason for closing
 * last.
 *
 * @param sessionId - the session to bring to the front.
 */
export function openSession(sessionId: string): void {
  const via = navigator
  if (via === undefined) return
  via.open(sessionId)
  closeHome()
}

/**
 * Whether a "show in the file manager" control should exist at all.
 *
 * Asked at RENDER, never cached — see {@link Navigator.canReveal}. A surface
 * that cannot open a path renders the directory as text and nothing else,
 * which is the degradation DSH's own `native-path-opener` documents this
 * capability flag for.
 *
 * @returns true when the host can open a path and this page may ask it to.
 */
export function canRevealWorkspace(): boolean {
  return navigator?.canReveal() === true
}

/**
 * Show one directory in the OS file manager.
 *
 * **This adds no new way to reach the filesystem.** It calls
 * `ctx.workspaces.openPath`, whose RPC method DSH already pins to loopback in
 * its `/api` gateway, and it is handed a path that came from the workspace
 * REGISTRY rather than from anything a page assembled — the same
 * id-not-path discipline `project-api.ts` states for its own routes. No host
 * route is added here and no process is spawned by this repo.
 *
 * @param path - the workspace directory, as the registry holds it.
 * @returns resolution after the host accepted the request; rejects if it did not.
 */
export async function revealWorkspace(path: string): Promise<void> {
  const via = navigator
  if (via === undefined) return
  await via.reveal(path)
}

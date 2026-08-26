/**
 * Leave the section when the conversation changes underneath it.
 *
 * `docs/project-model.md` §25.1 made the section STICKY on purpose: it
 * persists, because a place you are is a place you should still be in after a
 * reload. That is right for a reload and wrong for a session click — the
 * transcript switches underneath and the section keeps painting over it, so
 * the app looks like it ignored you.
 *
 * **The asymmetry is the bug, and it is worth naming exactly.** Of the four
 * transitions between the three things that can occupy the centre column,
 * three were already handled by `toggleSection` and one had no code at all:
 *
 * | from | to | who moved the section |
 * |---|---|---|
 * | workbench | dashboard | `toggleSection`, from the nav row |
 * | session | session | nobody needs to — the section is already `conversation` |
 * | session | workbench/dashboard | `toggleSection`, from the nav row |
 * | **workbench/dashboard** | **session** | **nobody. This module.** |
 *
 * `closeHome()` had exactly two callers before this — the project-switch button
 * and `openProject()` — and both are jumps the app itself starts. A person
 * clicking a session in the sidebar goes through dsh's own list, which knows
 * nothing about our section.
 *
 * The shipped precedent for the shape is dsh's own `AppFrame`, which watches
 * the current session and calls `closeDetails()` when it changes: the same
 * rule for a different overlay, including the guard below.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/session-follow
 */

/** The slice of the session list this rule reads. */
export interface CurrentSession {
  readonly current: string | undefined
}

/** A source of that slice — `ctx.sessions.list` satisfies it structurally. */
export interface CurrentSessionSource {
  getSnapshot(): CurrentSession
  subscribe(listener: () => void): () => void
}

/**
 * Whether a change from `previous` to `current` should return to the transcript.
 *
 * Three answers are no, and each of them is a real case rather than defensive
 * padding:
 *
 * * **unchanged** — the list publishes on every mutation it carries (titles,
 *   running flags, background jobs), not only on selection, so most wake-ups
 *   are not switches at all;
 * * **`previous` undefined** — the FIRST time the list resolves, which happens
 *   after mount on every page load. Treating that as a switch would close the
 *   remembered section on every reload and undo §25.1 entirely;
 * * **`current` undefined** — the selection was cleared, not moved. Nothing was
 *   opened, so there is nothing to reveal, and closing would drop someone onto
 *   an empty column.
 *
 * A switch to a BLANK session does count. That is the "New Session" button, and
 * it is one of the two gestures this exists to answer.
 *
 * @param previous - the last current session id seen.
 * @param current - the current session id now.
 * @returns whether to leave the section for the conversation.
 */
export function leavesSection(previous: string | undefined, current: string | undefined): boolean {
  if (previous === current) return false
  if (previous === undefined) return false
  if (current === undefined) return false
  return true
}

/**
 * Watch the current session and leave the section when it changes.
 *
 * @param sessions - the session-list source (`ctx.sessions.list`).
 * @param leave - what to call on a switch (`closeHome`).
 * @returns the unsubscribe.
 */
export function followSession(sessions: CurrentSessionSource, leave: () => void): () => void {
  // Latched at subscribe time, not at first notification: whatever is current
  // when this plugin mounts is where the person already is, not a switch.
  let previous = sessions.getSnapshot().current
  return sessions.subscribe(() => {
    const { current } = sessions.getSnapshot()
    const moved = leavesSection(previous, current)
    previous = current
    if (moved) leave()
  })
}

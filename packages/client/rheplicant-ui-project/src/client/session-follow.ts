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
  /**
   * How many times a selection has been REQUESTED — dsh's `selectedSeq`.
   *
   * Absent on a runtime that does not report it, in which case this module
   * falls back to comparing `current`, which is all it had before.
   */
  readonly selectedSeq?: number | undefined
}

/** A source of that slice — `ctx.sessions.list` satisfies it structurally. */
export interface CurrentSessionSource {
  getSnapshot(): CurrentSession
  subscribe(listener: () => void): () => void
}

/**
 * Whether this publication should return the centre column to the transcript.
 *
 * **The id is not enough, and this cost a user report to learn.** Pressing New
 * Session while that Workspace's blank session is ALREADY open changes
 * nothing: `workspaces.startSession()` REUSES the blank session and calls
 * `sessions.open()` on the id that is already current, so the list publishes a
 * snapshot in which `current` is unchanged. Comparing ids reads that as "not a
 * switch" and the section keeps painting over the transcript — the exact
 * symptom this module exists to fix, for the exact gesture its own comment
 * claimed to answer. `select()` is idempotent in its RESULT, never in its
 * INTENT.
 *
 * So the SEQUENCE decides when the runtime reports one. `selectedSeq` is
 * bumped by every selection mutator — open, open-subagent, clear — whether or
 * not the id moved, which is precisely the navigation signal `current` cannot
 * carry. The id comparison stays as the fallback for a runtime that does not
 * report it.
 *
 * **`previous.current === undefined` is never a switch, under either rule, and
 * that guard is load-bearing in a way the sequence would otherwise destroy.**
 * It covers the first resolve after mount AND the session RESTORE after a page
 * reload — and a restore goes through `select()`, so it bumps the sequence
 * too. Without this the remembered section would close on every reload, which
 * is §25.1 undone. The cost is stated rather than hidden: on a harness with no
 * sessions at all, the very first New Session press does not move the section
 * either, because it is indistinguishable from a restore by anything this
 * module can see.
 *
 * Two more answers are no, both real cases rather than defensive padding: the
 * list publishes on every mutation it carries (titles, running flags,
 * background jobs), so most wake-ups are not selections at all; and under the
 * fallback rule a cleared selection is not a move, because nothing was opened
 * and closing would drop someone onto an empty column. Under the SEQUENCE
 * rule a clear DOES yield — `sessions.clear()` is the New-Session path taken
 * when there is no Workspace at all, and that gesture means "show me the blank
 * view", which is not this section.
 *
 * @param previous - the last snapshot seen.
 * @param current - the snapshot now.
 * @returns whether to leave the section for the conversation.
 */
export function leavesSection(previous: CurrentSession, current: CurrentSession): boolean {
  // First resolve, or a restore after a reload. Above BOTH rules on purpose.
  if (previous.current === undefined) return false
  if (previous.selectedSeq !== undefined || current.selectedSeq !== undefined) {
    return current.selectedSeq !== previous.selectedSeq
  }
  if (previous.current === current.current) return false
  if (current.current === undefined) return false
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
  let previous: CurrentSession = sessions.getSnapshot()
  return sessions.subscribe(() => {
    const snapshot = sessions.getSnapshot()
    const moved = leavesSection(previous, snapshot)
    previous = snapshot
    if (moved) leave()
  })
}

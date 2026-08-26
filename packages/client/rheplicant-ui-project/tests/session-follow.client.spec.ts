/**
 * Leaving the section when the conversation changes underneath it.
 *
 * The bug this covers was reported from the running app, and the report named
 * the shape better than the first diagnosis did: of the four transitions
 * between the three things that can occupy the centre column, exactly one was
 * broken — the one no code was on. So these specs are organised by transition,
 * and the three that already worked are here too: a fix that closed the
 * section on a reload, or on every list mutation, would "fix" the bug by
 * breaking the sticky section §25.1 exists to provide.
 */
import { describe, expect, it, vi } from 'vitest'
import { followSession, leavesSection, type CurrentSession } from '../src/client/session-follow.ts'

/** A hand-driven `ctx.sessions.list`. */
function source(initial: string | undefined) {
  let state: CurrentSession = { current: initial }
  const listeners = new Set<() => void>()
  return {
    getSnapshot: (): CurrentSession => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    /** Publish a new current session, the way selecting one does. */
    select(current: string | undefined) {
      state = { current }
      for (const listener of listeners) listener()
    },
    /** Publish WITHOUT changing the selection — a title or job update. */
    touch() {
      state = { ...state }
      for (const listener of listeners) listener()
    },
  }
}

describe('the one transition that had no code on it', () => {
  it('leaves the section when another session is selected', () => {
    const leave = vi.fn()
    const sessions = source('session-a')
    followSession(sessions, leave)
    sessions.select('session-b')
    expect(leave).toHaveBeenCalledTimes(1)
  })

  it('leaves for a BLANK session too — that is the New Session button', () => {
    // A blank session has an id like any other and is what `New Session` and
    // `openProject`'s `connect` both land on. Filtering blanks out (as dsh's
    // own AppFrame does for its details pane) would leave half the report
    // unfixed: the user named "chat session or new session".
    const leave = vi.fn()
    const sessions = source('session-a')
    followSession(sessions, leave)
    sessions.select('blank-session')
    expect(leave).toHaveBeenCalledTimes(1)
  })
})

describe('the three transitions that already worked, and must keep working', () => {
  it('does not leave when the list publishes without a selection change', () => {
    // The list wakes subscribers for titles, running flags and background jobs.
    // Closing on those would make the section unusable while an agent works.
    const leave = vi.fn()
    const sessions = source('session-a')
    followSession(sessions, leave)
    sessions.touch()
    sessions.touch()
    expect(leave).not.toHaveBeenCalled()
  })

  it('does not leave when the list first resolves after mount', () => {
    // THE REGRESSION THIS GUARDS. On every page load the list is empty for a
    // tick and then resolves. Reading that as a switch would close the
    // remembered section on every reload — which is the whole of §25.1.
    const leave = vi.fn()
    const sessions = source(undefined)
    followSession(sessions, leave)
    sessions.select('session-a')
    expect(leave).not.toHaveBeenCalled()
  })

  it('does not leave when the selection is cleared', () => {
    // Cleared is not moved: nothing was opened, so there is nothing to reveal
    // and closing would drop someone onto an empty column.
    const leave = vi.fn()
    const sessions = source('session-a')
    followSession(sessions, leave)
    sessions.select(undefined)
    expect(leave).not.toHaveBeenCalled()
  })
})

describe('the rule itself', () => {
  // Object cases rather than tuples: `it.each` types the callback against the
  // WHOLE tuple, so a four-element row with a three-parameter callback is a
  // type error — caught by the dsh checkout's own pre-push typecheck, which is
  // stricter than this repo's `tsconfig.check*.json` and is the gate that
  // matters.
  it.each([
    { previous: 'a', current: 'b', expected: true, why: 'a switch' },
    { previous: 'a', current: 'a', expected: false, why: 'unchanged' },
    { previous: undefined, current: 'a', expected: false, why: 'first resolution' },
    { previous: 'a', current: undefined, expected: false, why: 'cleared' },
    { previous: undefined, current: undefined, expected: false, why: 'still nothing' },
  ])('$previous -> $current is $expected ($why)', ({ previous, current, expected }) => {
    expect(leavesSection(previous, current)).toBe(expected)
  })
})

describe('the subscription', () => {
  it('latches the current session at subscribe time, not on first notification', () => {
    // Someone who reloads INTO the workbench with a session already open must
    // stay there. Latching on the first notification instead would treat that
    // already-open session as a switch.
    const leave = vi.fn()
    const sessions = source('session-a')
    followSession(sessions, leave)
    sessions.touch()
    expect(leave).not.toHaveBeenCalled()
    sessions.select('session-b')
    expect(leave).toHaveBeenCalledTimes(1)
  })

  it('stops watching when unsubscribed', () => {
    const leave = vi.fn()
    const sessions = source('session-a')
    const stop = followSession(sessions, leave)
    stop()
    sessions.select('session-b')
    expect(leave).not.toHaveBeenCalled()
  })

  it('reports each switch once, not once per intermediate publish', () => {
    const leave = vi.fn()
    const sessions = source('session-a')
    followSession(sessions, leave)
    sessions.select('session-b')
    sessions.touch()
    sessions.select('session-c')
    expect(leave).toHaveBeenCalledTimes(2)
  })
})

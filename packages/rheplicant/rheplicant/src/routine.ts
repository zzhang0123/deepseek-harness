/**
 * A routine: one session this harness opens on a schedule, and the words it
 * opens with.
 *
 * **This is the part of the trigger design that §27.4 said would not exist.**
 * That section refused to give a fired trigger a conversation, and the sentence
 * it refused it with is still right about the thing it was written about:
 * *"inventing a session to hold one would put a conversation in the transcript
 * that nobody had."* A published execution is not something anyone said, so
 * wrapping one in a chat would be a fiction.
 *
 * A routine is the case that sentence does not cover. Here the conversation IS
 * the deliverable — someone asked for a recurring one — so opening a session is
 * not inventing anything; it is delivering exactly what the record describes.
 * The distinction is the action, and it is why `action` is a field on the
 * trigger record rather than a second registry: one schedule, two things it can
 * do, one place that decides when.
 *
 * **What lives here and what does not.** The framing and the sequence live
 * here, injected through {@link RoutineDeps}, so both are testable without an
 * agent, a model or a network. Building those deps out of a real Cordis context
 * is `trigger-loop.ts`'s job, because that is the module that already owns the
 * mount.
 *
 * @module @rheplicant/dsh-rheplicant/routine
 */

import { cadenceOf, type RoutineTrigger } from './triggers.ts'

/**
 * The session a routine runs in, narrowed to the four things firing needs.
 *
 * Deliberately not `Agent`: this module should be readable — and testable —
 * without knowing what an agent is, and the four members below are the entire
 * contract between "a schedule came due" and "a conversation happened".
 */
export interface RoutineSession {
  /** The session's durable id, for the host log and nothing else. */
  readonly sessionId: string
  /** Open one ordinary turn with this text. */
  say(text: string): void
  /** Resolve when that turn has finished and its log is durable. */
  settle(): Promise<void>
  /** Release the live agent. The durable log outlives it. */
  close(): Promise<void>
}

/** What running a routine needs from the harness. */
export interface RoutineDeps {
  /**
   * Open a session in one project directory.
   *
   * @param workspace - the project the routine belongs to; the session's `cwd`.
   */
  open(workspace: string): Promise<RoutineSession>
  /**
   * The session exists, and here is its id.
   *
   * Called once, immediately after {@link open} resolves and before the turn
   * is said — so a caller that records the id records it for a routine that is
   * still running, and for one whose harness dies before it finishes. The
   * return value of {@link runRoutine} carries the same id and arrives at the
   * end; this is the same fact, earlier.
   *
   * **A throw here does not stop the routine.** Recording where a turn happens
   * is bookkeeping, and bookkeeping that fails must not cost the turn — the
   * whole point of a routine is that it runs. Optional, because the framing
   * and the sequence are testable without a recorder.
   *
   * @param sessionId - the session that is now open.
   */
  opened?(sessionId: string): void
}

/** One routine that ran, narrowed to what the loop reports about it. */
export interface RanRoutine {
  readonly sessionId: string
}

/** Everything the framing states, so the caller cannot state half of it. */
export interface RoutineFraming {
  /** The record, for its name, cadence and prompt. */
  readonly trigger: RoutineTrigger
  /** The instant this occurrence is for, epoch ms. */
  readonly occurrenceAt: number
}

/**
 * The words a routine's turn opens with.
 *
 * **One sentence here is behaviour and the rest is data.** A routine turn is
 * indistinguishable from a person typing — same role, same shape — and a model
 * that assumes a person will ask a clarifying question into an empty room and
 * stop, having done nothing, on a schedule, forever. So the framing says nobody
 * is there before it says anything else.
 *
 * The prompt is JSON-encoded for the same reason DSH's own Schedule encodes a
 * reminder: a multi-line prompt would otherwise blur into the framing around
 * it, and a prompt is exactly the field a person is most likely to write a
 * whole paragraph into.
 *
 * The cadence is VERBATIM — `PT30M`, not "every thirty minutes" — following
 * `project-model.md` §27.2. Prose would make this module the owner of a
 * translation for every duration the grammar allows.
 *
 * @param framing - the record and the occurrence.
 * @returns the user-role text that opens the turn.
 */
export function routineFraming({ trigger, occurrenceAt }: RoutineFraming): string {
  return [
    '[ROUTINE]',
    'This turn was opened by a routine on its own schedule. Nobody is at the keyboard:'
    + ' a question asked here receives no answer, and whatever you write is read later'
    + ' or not at all. Do the work and leave the finding in the transcript.',
    `routine_name: ${JSON.stringify(trigger.name)}`,
    // Through `cadenceOf`, NOT `trigger.every`. When the wall-clock selector
    // landed, `every` became optional and this line silently rendered
    // `cadence: undefined` into a model-facing message for every `dailyAt`
    // routine — a template literal swallows undefined, so `tsc` passed it.
    `cadence: ${cadenceOf(trigger).text}`,
    `occurrence_at: ${new Date(occurrenceAt).toISOString()}`,
    `routine_prompt: ${JSON.stringify(trigger.prompt)}`,
  ].join('\n')
}

/** One routine firing: which project, which record, and when. */
export interface RoutineRun {
  /** The project directory the session opens in. */
  readonly workspace: string
  /** The record that came due. */
  readonly trigger: RoutineTrigger
  /** The instant it came due, epoch ms. */
  readonly now: number
}

/**
 * Run one routine: open a session, say the framing, wait, release.
 *
 * **The close is in a `finally` and that is load-bearing.** A model error, a
 * refused tool, a disposed context — every one of them leaves an agent alive if
 * the release is on the happy path, and a broken routine on a thirty-minute
 * cadence would accumulate one live agent every half hour for as long as the
 * harness runs. The durable log is written before the release, so closing loses
 * nothing: what the person sees in the sidebar afterwards is a persisted
 * session, resumable like any other.
 *
 * **Failure propagates rather than being swallowed.** The loop above already
 * knows what to do with it — report it, keep the schedule, do not disable —
 * and a routine that reported success for a session that never opened would be
 * the failure this whole design leads with.
 *
 * @param deps - how to open a session.
 * @param run - the project, the record, and the instant.
 * @returns the session that was opened.
 */
export async function runRoutine(deps: RoutineDeps, run: RoutineRun): Promise<RanRoutine> {
  const session = await deps.open(run.workspace)
  try {
    // Before `say`, and inside the `try` so `close` still runs if it throws —
    // but its own failure is swallowed, because a routine that opened must not
    // be abandoned over a note about where it opened.
    try {
      deps.opened?.(session.sessionId)
    } catch {
      // Nothing to do here that would not be worse: the caller owns whatever
      // recording this was, and it has already failed on its own terms.
    }
    session.say(routineFraming({ trigger: run.trigger, occurrenceAt: run.now }))
    await session.settle()
    return { sessionId: session.sessionId }
  } finally {
    await session.close()
  }
}

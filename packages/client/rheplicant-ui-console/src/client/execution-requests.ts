/**
 * "Show THIS execution in THAT session" — the one thing another plugin can ask
 * the console to do.
 *
 * The project home (`ui-project`) is a chooser in `shell.overlay`; the console
 * is a `conversation.view` tab. Choosing in one has to arrive in the other, and
 * the two are separate client bundles, so none of the obvious channels work:
 *
 * * **A value in `ui-kit` does not work.** ui-kit is INLINED into each client
 *   bundle, so a module-level store there is one copy per plugin and shares
 *   nothing. This is the trap P4c already paid for once.
 * * **Owner props do not reach.** That channel runs from a slot's owner to ITS
 *   occupants; the home and the console have different owners.
 *
 * What does work is a cordis service — which is why this module is paired with
 * `navigation-service.ts`. The store lives HERE, as module state inside the
 * console's own bundle, so the console's React code can subscribe to it
 * directly; the service is a thin face over the same object, so a plugin in a
 * different bundle can reach it through `ctx.get('rheplicantConsole')`. One
 * store, two doors.
 *
 * A request is an INSTRUCTION, not a preference: it is consumed once and
 * cleared. Leaving it standing would make a session someone returns to next
 * week snap to an execution they picked once.
 *
 * **Consumption is destructive, so this assumes ONE reader per session.** That
 * holds: `conversation.view` renders one entry at a time, so a session has at
 * most one mounted console. If a second ever existed, whichever reacted first
 * would consume the request and the other would never see it — React re-reads
 * `getSnapshot` lazily, so a store mutated by one subscriber's effect can leave
 * a later subscriber with no change to notice at all. Test suites reproduce
 * exactly this when components leak between cases, which is why the specs call
 * `cleanup()` explicitly rather than relying on an auto-hook this repo does not
 * register.
 *
 * @module @rheplicant/dsh-rheplicant-ui-console/client/execution-requests
 */

/** Pending requests, keyed by session id. */
const pending = new Map<string, string>()
const listeners = new Set<() => void>()

/** Wake every subscriber. */
function notify(): void {
  for (const listener of listeners) listener()
}

/**
 * Ask a session's console to show one execution.
 *
 * @param sessionId - the session that should show it.
 * @param executionId - the execution to show.
 */
export function requestExecution(sessionId: string, executionId: string): void {
  // A blank id names nothing; storing one would make `peek` answer with an
  // empty string, which reads as "there is a request" everywhere downstream.
  if (sessionId === '' || executionId === '') return
  if (pending.get(sessionId) === executionId) return
  pending.set(sessionId, executionId)
  notify()
}

/**
 * The execution one session has been asked to show, if any.
 * @param sessionId - the session to ask about.
 * @returns the execution id, or undefined when nothing is pending.
 */
export function peekExecutionRequest(sessionId: string): string | undefined {
  return pending.get(sessionId)
}

/**
 * Consume one session's request.
 * @param sessionId - the session whose request has been applied.
 */
export function clearExecutionRequest(sessionId: string): void {
  if (!pending.delete(sessionId)) return
  notify()
}

/**
 * Subscribe to request changes.
 *
 * Subscription is required rather than a mount-time read: `shell.overlay`
 * renders whether or not a session is open, so the home can be opened OVER the
 * session it is about. Picking an execution there navigates nowhere, and a
 * console that only read on mount would never see it.
 *
 * @param listener - called after any change.
 * @returns the unsubscribe.
 */
export function subscribeExecutionRequests(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Drop every pending request. Exists for tests, which share a module. */
export function resetExecutionRequests(): void {
  pending.clear()
  notify()
}

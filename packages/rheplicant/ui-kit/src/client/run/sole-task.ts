/**
 * The rule a LOG FALLBACK must obey: fall back only when the log is
 * unambiguous (`docs/project-model.md` §19.1).
 *
 * A panel that cannot reach the selected execution may read the session log
 * instead. That is honest for a conversation that touched ONE task and a guess
 * for a conversation that touched several — and a diagram is the most
 * confidently-read thing on a page, so guessing there is the most expensive
 * guess available. So a caller that would otherwise guess declines.
 *
 * **Why this lives in ui-kit and not beside the projection that produces it.**
 * ui-kit is INLINED into every consuming client bundle, which is what makes it
 * the right home for a pure function two plugins both need: a cross-plugin
 * value import is refused outright by the client bundle's purity gate
 * (`packages/client/tsdown.client.ts`), and a cordis service for a function
 * with no state would be ceremony around a conditional. Its first home was
 * ui-console, imported from ui-analysis — which made the analysis bundle
 * unbuildable, invisibly, because `test:web:built` serves whatever each
 * package last emitted.
 *
 * Generic over the task shape rather than typed against ui-console's
 * `LoopTask`: the rule is about the COUNT, and typing it against the loop
 * contract would put a type edge from ui-kit back to one of its own consumers.
 *
 * @module @rheplicant/dsh-rheplicant-ui-kit/client/run/sole-task
 */

/**
 * The one task a conversation touched, or undefined when it is not exactly one.
 *
 * @param snapshot - the loop projection, absent outside a rheplicant session.
 * @returns the sole task, or undefined when there are none or several.
 */
export function soleTask<Task>(
  snapshot: { readonly tasks: readonly Task[] } | undefined,
): Task | undefined {
  return snapshot?.tasks.length === 1 ? snapshot.tasks[0] : undefined
}

/**
 * `ctx.rheplicantConsole` — the console's cross-plugin face.
 *
 * A thin service over `execution-requests.ts`, existing for exactly one
 * reason: a plugin in a DIFFERENT client bundle cannot import that module's
 * state (see its header for why the usual channels do not reach). A cordis
 * service can be reached from anywhere in the composition, so it is the door.
 *
 * **Consumers should reach it with `ctx.get('rheplicantConsole')`, not
 * `inject`.** This vendored cordis has no optional-inject form, so naming it in
 * `inject` would mean a plugin that refuses to mount at all when the console is
 * absent. The project home lists a project perfectly well without a console to
 * hand executions to; it should lose the "open" affordance, not itself. That is
 * the same pattern `ui-conversation` uses for `chatFileMentions`.
 *
 * @module @rheplicant/dsh-rheplicant-ui-console/client/navigation-service
 */

import { Context, Service } from '@deepseek-ai/cordis'

import { requestExecution } from './execution-requests.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /**
     * The rheplicant console's navigation face. Optional by construction —
     * reach it via `ctx.get('rheplicantConsole')`.
     */
    rheplicantConsole: ConsoleNavigation
  }
}

/** The console's navigation service, registered as `ctx.rheplicantConsole`. */
export class ConsoleNavigation extends Service {
  constructor(ctx: Context) {
    super(ctx, 'rheplicantConsole')
  }

  /**
   * Ask one session's console to show one execution.
   *
   * Fire-and-forget on purpose. The caller is a chooser that is about to
   * navigate; making it await a console that may not have mounted yet would
   * couple the two lifecycles for no gain. An unclaimed request simply waits
   * in the store until that session's console reads it, and is dropped when it
   * does.
   *
   * @param sessionId - the session that should show it.
   * @param executionId - the execution to show.
   */
  requestExecution(sessionId: string, executionId: string): void {
    requestExecution(sessionId, executionId)
  }
}

export default ConsoleNavigation

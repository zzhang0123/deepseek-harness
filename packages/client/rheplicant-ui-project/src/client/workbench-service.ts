/**
 * `ctx.rheplicantWorkbench` — the project surface's cross-bundle face.
 *
 * `docs/project-model.md` §20.3. A plugin in a DIFFERENT client bundle cannot
 * import `home-store.ts` and reach the same module instance: the client build's
 * own purity gate (`packages/client/tsdown.client.ts`,
 * `dsh-client-bundle-purity`) refuses a cross-plugin value import outright,
 * because inlining one would give the importer its own private copy of the
 * store and the two halves would disagree about what is on screen. Cordis
 * services are the channel that gate names as the alternative, and this is one.
 *
 * **Separate from `ctx.rheplicantSelection` on purpose.** That service answers
 * "which task and which execution is this project showing" — a fact about the
 * project, which outlives any surface. This one answers "is the project surface
 * the thing on screen", which is a fact about the frame. Folding the second
 * into the first would make a selection change able to move the view, which is
 * exactly the coupling §11 removed on the session axis.
 *
 * Consumers reach it with `ctx.get('rheplicantWorkbench')`, never `inject`:
 * this vendored cordis has no optional-inject form, so `inject` would make a
 * chat node refuse to mount in any composition without the project surface.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/workbench-service
 */

import { Context, Service } from '@deepseek-ai/cordis'

import { openHome, readHome, subscribeHome, toggleHome, type HomeState } from './home-store.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /**
     * Whether the project surface is the section on screen. Optional by
     * construction — reach it via `ctx.get('rheplicantWorkbench')`.
     */
    rheplicantWorkbench: WorkbenchRuntime
  }
}

/** The project surface's visibility, registered as `ctx.rheplicantWorkbench`. */
export class WorkbenchRuntime extends Service {
  constructor(ctx: Context) {
    super(ctx, 'rheplicantWorkbench')
  }

  /**
   * Show the project surface, optionally on a named project.
   * @param workspaceId - the project to inspect; absent keeps the current one.
   */
  show(workspaceId?: string): void {
    openHome(workspaceId)
  }

  /**
   * Go to the project surface.
   *
   * Named `toggle` for the cross-bundle shape it already publishes; it stopped
   * toggling when the nav rows did (`home-store`'s `toggleSection`), because a
   * destination pressed twice is a destination. `close()` is how a caller
   * leaves.
   */
  toggle(): void {
    toggleHome()
  }

  /**
   * What the surface is showing right now.
   * @returns the state, without subscribing.
   */
  read(): HomeState {
    return readHome()
  }

  /**
   * Subscribe to changes.
   * @param listener - called after any change.
   * @returns the unsubscribe.
   */
  subscribe(listener: () => void): () => void {
    return subscribeHome(listener)
  }
}

export default WorkbenchRuntime

/**
 * `ctx.rheplicantSelection` — the selection's cross-bundle face.
 *
 * `docs/project-model.md` §11.2, §11.6. A thin service over `selection.ts`,
 * existing because a plugin in a DIFFERENT client bundle cannot import that
 * module's state: ui-kit is inlined per bundle, and owner props run from a
 * slot's owner to its own occupants, so neither reaches across.
 *
 * **This replaces P6's `ctx.rheplicantConsole`, and the direction is the
 * point.** That service lived in ui-console and let the home ask a SESSION's
 * console to show an execution — which encoded the session-as-address model
 * this phase removes. The selection is a property of the PROJECT, so the
 * project surface owns it and the console reads it. The degradation that
 * matters runs the same way: a console without the project surface falls back
 * to its own local selection, while the workbench must never lose its
 * selection because a session tab happens to be absent.
 *
 * Consumers reach it with `ctx.get('rheplicantSelection')`, not `inject`: this
 * vendored cordis has no optional-inject form, and a console that refuses to
 * mount without the project surface would be a worse console.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/selection-service
 */

import { Context, Service } from '@deepseek-ai/cordis'

import {
  clearSelection,
  proposeSelection,
  readSelection,
  selectInProject,
  subscribeSelection,
  type ProjectSelection,
  type SelectionPatch,
} from './selection.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /**
     * Which task and execution each project is showing. Optional by
     * construction — reach it via `ctx.get('rheplicantSelection')`.
     */
    rheplicantSelection: SelectionRuntime
  }
}

/** The project selection, registered as `ctx.rheplicantSelection`. */
export class SelectionRuntime extends Service {
  constructor(ctx: Context) {
    super(ctx, 'rheplicantSelection')
  }

  /**
   * Choose explicitly, pinning the axes named.
   * @param workspaceId - the project this choice belongs to.
   * @param patch - the axes to set.
   */
  select(workspaceId: string, patch: SelectionPatch): void {
    selectInProject(workspaceId, patch)
  }

  /**
   * Offer a default for whatever nobody has pinned — what a finished run calls.
   * @param workspaceId - the project this default belongs to.
   * @param patch - the axes to fill if they are free.
   */
  propose(workspaceId: string, patch: SelectionPatch): void {
    proposeSelection(workspaceId, patch)
  }

  /**
   * Go back to following the default.
   * @param workspaceId - the project to reset.
   */
  clear(workspaceId: string): void {
    clearSelection(workspaceId)
  }

  /**
   * What one project is showing right now.
   * @param workspaceId - the project to read.
   * @returns its selection.
   */
  read(workspaceId: string): ProjectSelection {
    return readSelection(workspaceId)
  }

  /**
   * Subscribe to selection changes across every project.
   * @param listener - called after any change.
   * @returns the unsubscribe.
   */
  subscribe(listener: () => void): () => void {
    return subscribeSelection(listener)
  }
}

export default SelectionRuntime

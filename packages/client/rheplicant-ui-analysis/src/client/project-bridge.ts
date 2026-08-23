/**
 * How a chat result node reaches the project surface (`docs/project-model.md`
 * §20.3).
 *
 * The chat node is the only surface anchored to the turn that CAUSED a result,
 * which is what "let me see the consequence right now" actually asks for. What
 * it lacked was a way to go deeper — so this is the one edge from there to the
 * project surface: select that exact `(taskPath, executionId)`, then show it.
 *
 * **Two services, not an import.** `openHome` and `selectInProject` are both
 * exported from ui-project's client index, and importing either as a VALUE from
 * here is refused at build time by the client bundle's own purity gate
 * (`packages/client/tsdown.client.ts`, `dsh-client-bundle-purity`): a
 * cross-plugin value import either inlines a private duplicate of that module's
 * state — two stores, one of which nothing is watching — or asks the loader's
 * module table for a specifier it cannot answer. Cordis services are the
 * channel the gate names, and both halves have one.
 *
 * **Resolved lazily, on first use.** `ctx.get` at `apply()` time answers
 * `undefined` whenever ui-project mounts LATER in the composition, and mount
 * order is a profile's business. A composition with no project surface at all
 * simply never offers the action — the honest degradation, and the reason this
 * is `ctx.get` rather than `inject` (this vendored cordis has no optional
 * inject, so injecting would make the analysis node refuse to mount).
 *
 * @module @rheplicant/dsh-rheplicant-ui-analysis/client/project-bridge
 */

/** The axes a caller may set on the project's selection; absent leaves one alone. */
export interface SelectionPatch {
  readonly taskPath?: string | undefined
  readonly executionId?: string | undefined
}

/** The `ctx.rheplicantSelection` face, as this package needs it. */
export interface SelectionSource {
  select(workspaceId: string, patch: SelectionPatch): void
}

/** The `ctx.rheplicantWorkbench` face, as this package needs it. */
export interface WorkbenchSource {
  show(workspaceId?: string): void
}

/** Both halves, however the host composition can supply them. */
export interface ProjectSurface {
  readonly selection: SelectionSource | undefined
  readonly workbench: WorkbenchSource | undefined
}

let locate: (() => ProjectSurface) | undefined

/**
 * Install the lookup. Called once from `apply()`.
 * @param next - the thunk, or undefined to uninstall (tests).
 */
export function setProjectSurface(next: (() => ProjectSurface) | undefined): void {
  locate = next
}

/**
 * Whether a result can be opened in the project surface at all.
 *
 * Both halves are required and the test says so: selecting without showing
 * would move a surface nobody can see, and showing without selecting would
 * land someone on whatever was already chosen — which is worse than not
 * offering the action, because it looks like it worked.
 *
 * @returns true when both services are reachable.
 */
export function canOpenInProject(): boolean {
  const surface = locate?.()
  return surface?.selection !== undefined && surface.workbench !== undefined
}

/** What a chat node knows about the result it drew. */
export interface ResultAddress {
  readonly taskPath?: string | undefined
  readonly executionId?: string | undefined
}

/**
 * Select one result in its project and bring the project surface up.
 *
 * A `select`, never a `propose`: a person clicking this row has chosen, and the
 * pin is what keeps a background run from moving the view off it afterwards
 * (§11.2's rule, from the other side).
 *
 * @param workspaceId - the project the result belongs to.
 * @param address - the task and execution to select.
 * @returns true when the surface was actually asked to show it.
 */
export function openInProject(workspaceId: string, address: ResultAddress): boolean {
  if (workspaceId === '') return false
  const surface = locate?.()
  const selection = surface?.selection
  const workbench = surface?.workbench
  if (selection === undefined || workbench === undefined) return false
  // Selected BEFORE the surface comes up, so what appears is already the right
  // thing — the same order `navigate.ts` uses for the jump in the other
  // direction, and for the same reason.
  if (address.taskPath !== undefined || address.executionId !== undefined) {
    selection.select(workspaceId, {
      ...(address.taskPath === undefined ? {} : { taskPath: address.taskPath }),
      ...(address.executionId === undefined ? {} : { executionId: address.executionId }),
    })
  }
  workbench.show(workspaceId)
  return true
}

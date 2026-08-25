/**
 * The workbench's read of one project, over the host's own route.
 *
 * `docs/project-model.md` §6.0. The console's own client
 * (`ui-console/project-api-client.ts`) asks by SESSION, because it is always
 * inside a conversation. The workbench is shown exactly when no session is
 * open, so it asks by WORKSPACE id — the uuid the host minted and handed the
 * browser through the workspace list. Same trust boundary, different handle:
 * neither surface names a directory, so neither can widen the host's reachable
 * set beyond the sessions and workspaces the host already registered.
 *
 * Everything here degrades rather than throws. A composition without the route
 * plugin answers 404, and the home must say "this project is not readable from
 * here" rather than take its slot down — `undefined` is that state, and it is
 * a different fact from an empty project.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/project-overview-client
 */

import type {
  ProjectDefinitionBody, ProjectDocumentProjectionBody, ProjectExecutionRow, ProjectInputRow,
  ProjectOverviewBody,
  ProjectTaskRow,
} from '@rheplicant/dsh-rheplicant'

/** Where the host mounts the project routes. */
const ROUTE_PREFIX = '/rheplicant/project'

/** Whether one decoded value is a usable task row. */
function isTask(value: unknown): value is ProjectTaskRow {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return typeof row.path === 'string'
    && typeof row.bytes === 'number'
    && typeof row.executionCount === 'number'
}

/** Whether one decoded value is a usable input row. */
function isInput(value: unknown): value is ProjectInputRow {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return typeof row.path === 'string' && typeof row.extension === 'string'
}

/** Whether one decoded value is a usable execution row. */
function isExecution(value: unknown): value is ProjectExecutionRow {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return typeof row.executionId === 'string'
    && typeof row.task === 'string'
    && typeof row.path === 'string'
    && (row.status === 'ok' || row.status === 'refused' || row.status === 'error')
}

/**
 * Everything one project holds and has run.
 *
 * @param workspaceId - the workspace the host minted an id for. The host
 *   resolves the directory from it; no path is ever sent.
 * @param signal - abort when the selection changes or the home closes.
 * @returns the overview, or `undefined` when the project cannot be read from
 *   here — a composition without the route, an id the registry dropped, or a
 *   body that did not decode.
 */
export async function fetchProjectOverview(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<ProjectOverviewBody | undefined> {
  let response: Response
  try {
    response = await fetch(
      `${ROUTE_PREFIX}/overview?workspace=${encodeURIComponent(workspaceId)}`,
      // Spread rather than `signal`: the checkout's client build runs
      // `exactOptionalPropertyTypes`, under which `RequestInit.signal` is
      // `AbortSignal | null` and an explicit `undefined` is a type error.
      { ...(signal === undefined ? {} : { signal }), headers: { accept: 'application/json' } },
    )
  } catch {
    // Aborted, offline, or no server: not an error worth showing anyone.
    return undefined
  }
  if (!response.ok) return undefined
  let body: unknown
  try {
    body = await response.json()
  } catch {
    return undefined
  }
  if (typeof body !== 'object' || body === null) return undefined
  const decoded = body as Record<string, unknown>
  // Validate rather than cast: this crosses a process boundary, and a slot
  // occupant that throws takes its whole slot down with it.
  if (!Array.isArray(decoded.tasks) || !Array.isArray(decoded.inputs)
    || !Array.isArray(decoded.executions)) return undefined
  return {
    project: typeof decoded.project === 'string' ? decoded.project : '',
    tasks: decoded.tasks.filter(isTask),
    inputs: decoded.inputs.filter(isInput),
    executions: decoded.executions.filter(isExecution),
    // Absent reads as "not truncated" only because the host always sends it;
    // a body that omitted it is one this client does not know, and claiming
    // completeness for it would be the one lie this flag exists to prevent.
    truncated: decoded.truncated === true,
  }
}

export type { ProjectExecutionRow, ProjectInputRow, ProjectOverviewBody, ProjectTaskRow }

/** One task document, as the host returns it. */
export interface TaskDocumentBody {
  readonly path: string
  readonly text: string
  readonly bytes: number
  readonly modifiedAt: string
}

/**
 * One task's document — the bytes the operator authored, as they stand now.
 *
 * Deliberately NOT the same thing as an execution's `config.input.yaml`, which
 * is what a particular run used. Holding the two apart is what lets the
 * workbench show that a task has been edited since it last ran (§4.2).
 *
 * @param workspaceId - the project the task belongs to.
 * @param path - the task's workspace-relative path, from the listing.
 * @param signal - abort when the selection changes.
 * @returns the document, `'refused'` when the host would not serve that path,
 *   and `undefined` when the route could not be reached at all. Three answers,
 *   because they read differently: refused means the path is wrong, undefined
 *   means we do not know.
 */
export async function fetchTaskDocument(
  workspaceId: string,
  path: string,
  signal?: AbortSignal,
): Promise<TaskDocumentBody | 'refused' | undefined> {
  let response: Response
  try {
    response = await fetch(
      `${ROUTE_PREFIX}/task?workspace=${encodeURIComponent(workspaceId)}`
      + `&path=${encodeURIComponent(path)}`,
      { ...(signal === undefined ? {} : { signal }), headers: { accept: 'application/json' } },
    )
  } catch {
    return undefined
  }
  // The host answered and would not serve this path — a fact worth showing,
  // and not the same as never having reached it.
  if (response.status === 400 || response.status === 404) return 'refused'
  if (!response.ok) return undefined
  try {
    const body: unknown = await response.json()
    if (typeof body !== 'object' || body === null) return undefined
    const row = body as Record<string, unknown>
    if (typeof row.text !== 'string' || typeof row.path !== 'string') return undefined
    return {
      path: row.path,
      text: row.text,
      bytes: typeof row.bytes === 'number' ? row.bytes : row.text.length,
      modifiedAt: typeof row.modifiedAt === 'string' ? row.modifiedAt : '',
    }
  } catch {
    return undefined
  }
}

/** One execution projected into the wire shape a run returns. */
export interface ExecutionProjection {
  readonly runs?: readonly unknown[]
  readonly gates?: readonly unknown[]
  readonly graph?: unknown
}

/**
 * Project one published execution, addressed by PROJECT rather than session.
 *
 * The same route the console uses; only the handle differs, which is the whole
 * point of §11 — the workbench has no session to name and does not need one.
 *
 * @param workspaceId - the project the execution belongs to.
 * @param executionId - the execution to project.
 * @param signal - abort when the selection changes.
 * @returns the projection, `'unreadable'` when the project answered that this
 *   execution is gone or changed, and `undefined` when the route could not be
 *   reached at all.
 */
export async function fetchExecutionProjection(
  workspaceId: string,
  executionId: string,
  signal?: AbortSignal,
): Promise<ExecutionProjection | 'unreadable' | undefined> {
  let response: Response
  try {
    response = await fetch(
      `${ROUTE_PREFIX}/execution?workspace=${encodeURIComponent(workspaceId)}`
      + `&execution=${encodeURIComponent(executionId)}`,
      { ...(signal === undefined ? {} : { signal }), headers: { accept: 'application/json' } },
    )
  } catch {
    return undefined
  }
  // 404/409 mean the project answered and this execution is not servable;
  // anything else means the route itself is not there to ask.
  if (response.status === 404 || response.status === 409) return 'unreadable'
  if (!response.ok) return undefined
  try {
    const body: unknown = await response.json()
    return typeof body === 'object' && body !== null ? body as ExecutionProjection : undefined
  } catch {
    return undefined
  }
}

/**
 * How far one task is from §7's "completely defined".
 *
 * `docs/project-model.md` §12. The document is read HOST-side, so this asks
 * by path and sends no text: a browser that could submit a document could
 * have a verdict rendered about bytes nobody has on disk.
 *
 * @param workspaceId - the project the task belongs to.
 * @param path - the task's workspace-relative path, from the listing.
 * @param signal - abort when the selection changes.
 * @returns the report, `'refused'` when the host would not serve that path,
 *   and `undefined` when the route or the compute service could not be
 *   reached. Three answers, because a wrong path and an absent service want
 *   different things done about them.
 */
export async function fetchTaskDefinition(
  workspaceId: string,
  path: string,
  signal?: AbortSignal,
): Promise<ProjectDefinitionBody | 'refused' | undefined> {
  let response: Response
  try {
    response = await fetch(
      `${ROUTE_PREFIX}/definition?workspace=${encodeURIComponent(workspaceId)}`
      + `&path=${encodeURIComponent(path)}`,
      { ...(signal === undefined ? {} : { signal }), headers: { accept: 'application/json' } },
    )
  } catch {
    return undefined
  }
  if (response.status === 400 || response.status === 404) return 'refused'
  if (!response.ok) return undefined
  try {
    const body: unknown = await response.json()
    if (typeof body !== 'object' || body === null) return undefined
    const row = body as Record<string, unknown>
    // The digest is not optional. Without it there is no way to know which
    // document this verdict describes, and a verdict that cannot be dated is
    // exactly what §12.6 exists to keep off the screen.
    if (typeof row.digest !== 'string' || typeof row.path !== 'string') return undefined
    if (!Array.isArray(row.inputs)) return undefined
    if (typeof row.validation !== 'object' || row.validation === null) return undefined
    if (typeof row.gates !== 'object' || row.gates === null) return undefined
    return body as ProjectDefinitionBody
  } catch {
    return undefined
  }
}

/**
 * One artifact read, tagged so its text can never be confused with a reason.
 *
 * `unreadable` — the project answered and this artifact is not servable (the
 * execution is gone, or no longer owns its directory). `unreachable` — the
 * route itself could not be asked. The two read differently and want
 * different things done, exactly as everywhere else in this module.
 */
export type ArtifactResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: 'unreadable' | 'unreachable' }

/**
 * One flat audit file out of a published execution's directory.
 *
 * The route this uses is P3's, unchanged: an artifact is asked for by
 * EXECUTION ID and by a name from a fixed allow-list, never by path, and the
 * host re-checks that the execution still owns its directory before reading.
 * `config.input.yaml` has been on that allow-list since P3, which is why
 * showing what an execution actually ran needs no new transport at all.
 *
 * Answers TEXT rather than JSON: the route serves the file's bytes under its
 * own media type, and re-encoding them here would put a second reading of the
 * document in the browser.
 *
 * **Why this one returns a tagged result and its siblings return sentinels.**
 * `fetchTaskDocument` and `fetchExecutionProjection` answer `'refused'` /
 * `'unreadable'` beside an OBJECT payload, so a sentinel can never be mistaken
 * for content. Here the payload is itself a string, and the convention stops
 * being safe: the first caller written against it did
 * `typeof answer === 'string' ? answer : undefined` and rendered the word
 * "unreadable" as the executed document, diffed line-by-line against the real
 * one. Caught by the test written for exactly that case. A tag makes the
 * mistake unrepresentable instead of asking every call site to remember.
 *
 * @param workspaceId - the project the execution belongs to.
 * @param executionId - the execution whose directory to read.
 * @param name - one name from the host's artifact allow-list.
 * @param signal - abort when the selection changes.
 * @returns the text, or why there is none.
 */
export async function fetchExecutionArtifact(
  workspaceId: string,
  executionId: string,
  name: string,
  signal?: AbortSignal,
): Promise<ArtifactResult> {
  let response: Response
  try {
    response = await fetch(
      `${ROUTE_PREFIX}/artifact?workspace=${encodeURIComponent(workspaceId)}`
      + `&execution=${encodeURIComponent(executionId)}&name=${encodeURIComponent(name)}`,
      { ...(signal === undefined ? {} : { signal }) },
    )
  } catch {
    return { ok: false, reason: 'unreachable' }
  }
  // 400/404/409 are the project ANSWERING that this artifact is not servable;
  // anything else means the route itself is not there to ask.
  if (response.status === 400 || response.status === 404 || response.status === 409) {
    return { ok: false, reason: 'unreadable' }
  }
  if (!response.ok) return { ok: false, reason: 'unreachable' }
  try {
    return { ok: true, text: await response.text() }
  } catch {
    return { ok: false, reason: 'unreachable' }
  }
}

/**
 * One task document projected for display — its signal path, and the physics
 * it declares.
 *
 * `docs/project-model.md` §17. What makes this different from every other
 * reader here is that it needs NO execution: a task that has never run can
 * show its diagram and its operators. Before it, both appeared only after a
 * first run, so the one diagram the philosophy asks to be "always present on
 * screen" was missing for exactly the task somebody is still authoring.
 *
 * @param workspaceId - the project the task belongs to.
 * @param path - the task's workspace-relative path.
 * @param signal - abort when the selection changes.
 * @returns the projection, `'refused'` when the host would not serve that
 *   path, and `undefined` when the route or the gui extra could not be
 *   reached — the last of which is a normal state, not a fault.
 */
export async function fetchDocumentProjection(
  workspaceId: string,
  path: string,
  signal?: AbortSignal,
): Promise<ProjectDocumentProjectionBody | 'refused' | undefined> {
  let response: Response
  try {
    response = await fetch(
      `${ROUTE_PREFIX}/projection?workspace=${encodeURIComponent(workspaceId)}`
      + `&path=${encodeURIComponent(path)}`,
      { ...(signal === undefined ? {} : { signal }), headers: { accept: 'application/json' } },
    )
  } catch {
    return undefined
  }
  if (response.status === 400 || response.status === 404) return 'refused'
  if (!response.ok) return undefined
  try {
    const body: unknown = await response.json()
    if (typeof body !== 'object' || body === null) return undefined
    const row = body as Record<string, unknown>
    // The digest is not optional, for the reason §12.6 gives: a view that
    // cannot be dated can be shown against a document it does not describe.
    if (typeof row.digest !== 'string' || typeof row.svg !== 'string') return undefined
    if (typeof row.model !== 'object' || row.model === null) return undefined
    return body as ProjectDocumentProjectionBody
  } catch {
    return undefined
  }
}

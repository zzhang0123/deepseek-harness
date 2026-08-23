/**
 * The project home's read of one project, over the host's own route.
 *
 * `docs/project-model.md` §6.0. The console's own client
 * (`ui-console/project-api-client.ts`) asks by SESSION, because it is always
 * inside a conversation. The project home is shown exactly when no session is
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
  ProjectExecutionRow, ProjectInputRow, ProjectOverviewBody, ProjectTaskRow,
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

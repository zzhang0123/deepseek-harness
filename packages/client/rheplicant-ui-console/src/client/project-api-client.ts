/**
 * The console's read of the project, over the host's own route.
 *
 * `docs/project-model.md` §6.2, §8.1. A session log can only describe what that
 * session did; the project's full history is a directory read, and only the
 * host can do one. This is the browser half of `/rheplicant/project/executions`.
 *
 * Everything here degrades rather than fails. A composition without the route
 * plugin — a headless boot, an older harness, a test scaffold — answers 404,
 * and the header must go on showing this session's own executions rather than
 * break. `undefined` means "the project is not readable from here", which is a
 * different fact from "this project has no executions" and is rendered
 * differently.
 *
 * @module @rheplicant/dsh-rheplicant-ui-console/client/project-api-client
 */

import type { ProjectExecutionRow, ProjectExecutionsBody } from '@rheplicant/dsh-rheplicant'

/** Where the host mounts the project routes. */
const ROUTE_PREFIX = '/rheplicant/project'

/** Whether one decoded value is a usable execution row. */
function isRow(value: unknown): value is ProjectExecutionRow {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return typeof row.executionId === 'string'
    && typeof row.task === 'string'
    && typeof row.path === 'string'
    && (row.status === 'ok' || row.status === 'refused' || row.status === 'error')
}

/**
 * Every execution in this session's project, newest first.
 *
 * @param sessionId - the session whose workspace bounds the read. The host
 *   resolves the directory from this; no path is ever sent.
 * @param signal - abort when the component unmounts or the session changes.
 * @returns the project name and its rows, or `undefined` when the project
 *   cannot be read from here.
 */
export async function fetchProjectExecutions(
  sessionId: string,
  signal?: AbortSignal,
): Promise<ProjectExecutionsBody | undefined> {
  let response: Response
  try {
    response = await fetch(
      `${ROUTE_PREFIX}/executions?session=${encodeURIComponent(sessionId)}`,
      { signal, headers: { accept: 'application/json' } },
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
  const decoded = body as { project?: unknown; executions?: unknown }
  // Validate rather than cast: this crosses a process boundary, and a panel
  // that throws takes its whole slot down with it.
  if (!Array.isArray(decoded.executions)) return undefined
  return {
    project: typeof decoded.project === 'string' ? decoded.project : '',
    executions: decoded.executions.filter(isRow),
  }
}

export type { ProjectExecutionRow, ProjectExecutionsBody }


/** One execution's projection, as the host returns it. */
export interface ProjectExecutionProjection {
  readonly runs?: readonly unknown[]
  readonly gates?: readonly unknown[]
  readonly graph?: unknown
}

/**
 * Project one published execution: the runs, diagnostics and arrays a panel
 * renders, read off the tree rather than out of the session log.
 *
 * @param sessionId - the session whose workspace bounds the read.
 * @param executionId - the execution to project.
 * @param signal - abort when the selection changes or the component unmounts.
 * @returns the projection, `'unreadable'` when the project answered that this
 *   execution is gone or changed, and `undefined` when the project could not
 *   be reached at all. The three are different facts and read differently.
 */
export async function fetchExecution(
  sessionId: string,
  executionId: string,
  signal?: AbortSignal,
): Promise<ProjectExecutionProjection | 'unreadable' | undefined> {
  let response: Response
  try {
    response = await fetch(
      `${ROUTE_PREFIX}/execution?session=${encodeURIComponent(sessionId)}`
      + `&execution=${encodeURIComponent(executionId)}`,
      { signal, headers: { accept: 'application/json' } },
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
    return typeof body === 'object' && body !== null
      ? body as ProjectExecutionProjection
      : undefined
  } catch {
    return undefined
  }
}

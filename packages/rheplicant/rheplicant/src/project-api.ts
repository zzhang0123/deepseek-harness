/**
 * The browser's read-only window onto a project's executions.
 *
 * `docs/project-model.md` §6.2, §8.1. The console needs one thing the session
 * log cannot give it: the executions this session did NOT produce. That answer
 * is a directory read, and a directory read belongs to the host, so this plugin
 * puts `ctx.rheplicantProject` behind two HTTP routes the web runtime already
 * carries.
 *
 * **The workspace never crosses the wire.** A request names a SESSION; the
 * handler resolves that session's own `cwd` through `ctx.sessions` and confines
 * every read to it. A client that could name the directory could name any
 * directory, which is the whole reason `readTaskFile` refuses to resolve a task
 * against the host process's cwd either.
 *
 * Nor does a path come back: a summary carries the PROJECT-RELATIVE path, which
 * is what the header displays, and an artifact is asked for by execution id.
 * The identity triple `(marker_id, device, inode)` is captured host-side and
 * checked host-side; the browser never holds it, so it can never present a
 * stale one.
 *
 * @module @rheplicant/dsh-rheplicant/project-api
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: these load the `ctx.webServer` and `ctx.sessions` Context
// augmentations this plugin reads through.
import type {} from '@deepseek-ai/dsh-host-webserver'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-workspace'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename } from 'node:path'

import {
  ARTIFACT_MEDIA_TYPES, MARKER_NAME, ProjectReadError, type ExecutionSummary,
} from './executions.ts'
import type { ProjectExecutionRow, ProjectExecutionsBody } from './types.ts'
import { RESULTS_ROOT } from './project.ts'
import type {} from './project-runtime.ts'

/** Stable Cordis plugin name. */
export const name = 'rheplicant-project-api'

/** Services required before either route can answer. */
export const inject = ['webServer', 'rheplicantProject', 'rheplicant', 'sessions', 'workspaceRegistry']

/** Where the two routes live. */
export const ROUTE_PREFIX = '/rheplicant/project'

/** Project-relative view of an absolute published path. */
function relativePath(workspace: string, resultsPath: string): string {
  const at = resultsPath.lastIndexOf(`/${RESULTS_ROOT}/`)
  return at < 0 ? `${RESULTS_ROOT}/` : `${resultsPath.slice(at + 1)}/`
}

/** Strip an execution summary to what the browser is allowed to know. */
function row(workspace: string, summary: ExecutionSummary): ProjectExecutionRow {
  return {
    executionId: summary.executionId,
    task: summary.task,
    status: summary.status,
    path: relativePath(workspace, summary.resultsPath),
    ...(summary.sessionId === undefined ? {} : { sessionId: summary.sessionId }),
    ...(summary.transport === undefined ? {} : { transport: summary.transport }),
    ...(summary.startedAt === undefined ? {} : { startedAt: summary.startedAt }),
    ...(summary.finishedAt === undefined ? {} : { finishedAt: summary.finishedAt }),
  }
}

/**
 * One execution of this project by id, with a readable marker.
 *
 * The identity is taken from THIS listing, not from the request: the browser
 * cannot present an identity at all, so it cannot present a stale one, and the
 * check still guards the window between this list and whatever reads next.
 */
function locate(
  ctx: Context,
  workspace: string,
  executionId: string,
): ReadableExecution | undefined {
  if (executionId === '') return undefined
  const found = ctx.rheplicantProject
    .listExecutions(workspace)
    .find(summary => summary.executionId === executionId)
  // A null marker means the tree is there but unreadable, which is not the
  // same as absent — and neither is servable, so both answer the same way.
  if (found === undefined || found.markerId === null) return undefined
  return { ...found, markerId: found.markerId }
}

/** An execution whose ownership marker parsed, so its identity can be checked. */
type ReadableExecution = Omit<ExecutionSummary, 'markerId'> & { readonly markerId: string }

/** Answer with one JSON body and a no-store policy. */
function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body), 'utf8')
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(payload.byteLength),
    // A results tree changes under the browser; a cached listing would show a
    // pruned execution as present, which is the one thing it must not do.
    'cache-control': 'no-store',
  })
  res.end(payload)
}

/**
 * The workspace this request is allowed to read, or undefined.
 *
 * The single trust decision in this module: the directory comes from the
 * session record, never from the query string.
 */
function workspaceFor(ctx: Context, url: URL): string | undefined {
  const raw = url.searchParams.get('session')
  if (raw === null || raw === '') return undefined
  // `SessionId` is a branded constructor, not a cast: it validates the shape
  // before anything is looked up, so a malformed id is refused here rather
  // than coerced into a lookup that quietly misses.
  let sessionId: SessionId
  try {
    sessionId = SessionId(raw)
  } catch {
    return undefined
  }
  // An ATTACHED session knows its own directory. Measured in a real boot: a
  // session the browser has open is NOT necessarily attached in the host's
  // store, so this alone answers 404 for every ordinary page load and the
  // registry below is the path that actually runs.
  const attached = ctx.sessions.get(sessionId)?.header.cwd
  if (typeof attached === 'string' && attached !== '') return attached
  // The durable registry: the workspace that owns this session. It survives a
  // cold read, which is exactly the case the console hits when someone opens
  // an older conversation.
  for (const workspace of ctx.workspaceRegistry.list()) {
    if (workspace.sessionIds.includes(sessionId)) return workspace.path
  }
  return undefined
}

/** Parse the request line into a URL, or undefined when it is unusable. */
function requestUrl(req: IncomingMessage): URL | undefined {
  try {
    return new URL(req.url ?? '/', 'http://localhost')
  } catch {
    return undefined
  }
}

/**
 * Register the listing and artifact routes.
 * @param ctx - the plugin context, with `webServer`, `rheplicantProject` and `sessions`.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/executions`,
    handler: (req, res) => {
      const url = requestUrl(req)
      const workspace = url === undefined ? undefined : workspaceFor(ctx, url)
      if (workspace === undefined) {
        json(res, 404, { error: 'unknown session', code: 'SESSION_NOT_FOUND' })
        return
      }
      const executions = ctx.rheplicantProject
        .listExecutions(workspace)
        .map(summary => row(workspace, summary))
      json(res, 200, {
        project: basename(workspace),
        executions,
      } satisfies ProjectExecutionsBody)
    },
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/execution`,
    handler: async (req, res) => {
      const url = requestUrl(req)
      const workspace = url === undefined ? undefined : workspaceFor(ctx, url)
      if (url === undefined || workspace === undefined) {
        json(res, 404, { error: 'unknown session', code: 'SESSION_NOT_FOUND' })
        return
      }
      const found = locate(ctx, workspace, url.searchParams.get('execution') ?? '')
      if (found === undefined) {
        json(res, 404, {
          error: 'no such execution in this project',
          code: 'EXECUTION_NOT_FOUND',
        })
        return
      }
      // The identity check before the projection: `readArtifact` is the cheap
      // way to assert the directory is still the one that was listed, and its
      // marker read is what a stale or re-run tree fails.
      try {
        ctx.rheplicantProject.readArtifact(workspace, {
          resultsPath: found.resultsPath,
          markerId: found.markerId,
          device: found.device,
          inode: found.inode,
          name: MARKER_NAME,
        })
      } catch {
        json(res, 409, {
          error: 'this execution is no longer readable — refresh the list',
          code: 'IDENTITY_CHANGED',
        })
        return
      }
      try {
        const outcome = await ctx.rheplicant.readExecution(found.resultsPath, {
          transport: (url.searchParams.get('transport') ?? 'local') as never,
        })
        // The absolute path is the host's business; the browser already knows
        // this execution by its id.
        const { resultsPath: _absolute, ...projected } = outcome
        json(res, 200, projected)
      } catch (error) {
        json(res, 502, {
          error: 'the compute service could not read this execution',
          code: 'EXECUTION_UNREADABLE',
          detail: error instanceof Error ? error.message : String(error),
        })
      }
    },
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/artifact`,
    handler: (req, res) => {
      const url = requestUrl(req)
      const workspace = url === undefined ? undefined : workspaceFor(ctx, url)
      if (url === undefined || workspace === undefined) {
        json(res, 404, { error: 'unknown session', code: 'SESSION_NOT_FOUND' })
        return
      }
      const executionId = url.searchParams.get('execution') ?? ''
      const artifactName = url.searchParams.get('name') ?? ''
      if (!(artifactName in ARTIFACT_MEDIA_TYPES)) {
        json(res, 400, { error: `${artifactName} is not a readable artifact`, code: 'ARTIFACT_NOT_ALLOWED' })
        return
      }
      // The identity is taken from THIS listing, not from the request: the
      // browser cannot present an identity at all, so it cannot present a
      // stale one, and the check still guards the window between this list and
      // the read below.
      const found = locate(ctx, workspace, executionId)
      if (found === undefined) {
        json(res, 404, {
          error: `no readable execution ${executionId} in this project`,
          code: 'EXECUTION_NOT_FOUND',
        })
        return
      }
      try {
        const artifact = ctx.rheplicantProject.readArtifact(workspace, {
          resultsPath: found.resultsPath,
          markerId: found.markerId,
          device: found.device,
          inode: found.inode,
          name: artifactName,
        })
        res.writeHead(200, {
          'content-type': artifact.mediaType,
          'content-length': String(artifact.bytes.byteLength),
          'cache-control': 'no-store',
        })
        res.end(artifact.bytes)
      } catch (error) {
        const code = error instanceof ProjectReadError ? error.code : 'ARTIFACT_UNREADABLE'
        // The message names the path, which is a host path; the browser gets
        // the code and a sentence that does not.
        json(res, code === 'EXECUTION_NOT_FOUND' ? 404 : 409, {
          error: 'this execution is no longer readable — refresh the list',
          code,
        })
      }
    },
  }))
}

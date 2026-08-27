/**
 * The browser's read-only window onto a project's executions.
 *
 * `docs/project-model.md` §6.2, §8.1. The console needs one thing the session
 * log cannot give it: the executions this session did NOT produce. That answer
 * is a directory read, and a directory read belongs to the host, so this plugin
 * puts `ctx.rheplicantProject` behind HTTP routes the web runtime already
 * carries.
 *
 * **The workspace never crosses the wire.** A request names a SESSION, or (for
 * §6.0's workbench, which is shown when no session is open) a WORKSPACE by
 * the id the host minted for it. Either way the handler resolves the directory
 * from a host record and confines every read to it. A client that could name
 * the directory could name any directory, which is the whole reason
 * `readTaskFile` refuses to resolve a task against the host process's cwd
 * either.
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
import { createHash } from 'node:crypto'
import { basename, join, sep } from 'node:path'

import {
  ARTIFACT_MEDIA_TYPES, EXECUTED_DOCUMENT, MARKER_NAME, ProjectReadError,
  type ExecutionSummary,
} from './executions.ts'
import type { ProjectTaskDocumentBody } from './types.ts'
import type {
  DocumentInputReference, ProjectDefinitionBody, ProjectExecutionRow, ProjectExecutionsBody,
  ProjectDocumentProjectionBody, ProjectInputReference, ProjectOverviewBody, ProjectTaskRow,
  ProjectTriggerRow, ProjectTriggersBody, Transport,
} from './types.ts'
import { isTransport } from './types.ts'
import { decodeDocument } from './contents.ts'
import { RESULTS_ROOT, taskSegment } from './project.ts'
import { nextFireAt, readTriggers, type TriggerRecord } from './triggers.ts'
import type {} from './project-runtime.ts'

/** Stable Cordis plugin name. */
export const name = 'rheplicant-project-api'

/** Services required before any route can answer. */
export const inject = ['webServer', 'rheplicantProject', 'rheplicant', 'sessions', 'workspaceRegistry']

/** Where the project routes live. */
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
    ...(summary.taskDigest === undefined ? {} : { taskDigest: summary.taskDigest }),
    ...(summary.kinds === undefined ? {} : { kinds: summary.kinds }),
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

/**
 * Attach each task to the executions the project holds for it.
 *
 * The join key is the `results/` segment, computed by `taskSegment` rather
 * than by stripping the extension here: an execution's own `task` field is
 * that function's output (`tool-run` writes it into the sidecar), so
 * recomputing it any other way is how the two sides would come to disagree
 * about which document produced what.
 *
 * @param workspace - the project directory, which the segment is relative to.
 * @param tasks - the documents the scan found.
 * @param executions - the project's executions, already newest-first.
 * @returns one row per task, in the scan's order.
 */
function withExecutions(
  workspace: string,
  tasks: readonly { path: string; bytes: number; modifiedAt: string }[],
  executions: readonly ExecutionSummary[],
): ProjectTaskRow[] {
  // Newest-first is `listExecutions`'s contract, so the FIRST match per
  // segment is the newest and no clock is read here either.
  const bySegment = new Map<string, ExecutionSummary[]>()
  for (const execution of executions) {
    const bucket = bySegment.get(execution.task)
    if (bucket === undefined) bySegment.set(execution.task, [execution])
    else bucket.push(execution)
  }
  return tasks.map((task) => {
    const segment = taskSegment(workspace, join(workspace, task.path)).split(sep).join('/')
    const found = bySegment.get(segment) ?? []
    return {
      path: task.path,
      bytes: task.bytes,
      modifiedAt: task.modifiedAt,
      executionCount: found.length,
      // Absent, never a placeholder: "has never run" is a state the project
      // home renders differently from "ran, and here is which".
      ...(found[0] === undefined ? {} : { newestExecutionId: found[0].executionId }),
    }
  })
}

/**
 * One trigger record with its next fire derived, and nothing added.
 *
 * `nextFireAt` is the ONE derived field (design §5). It is not clamped to the
 * present: a harness that was down across a window leaves an overdue trigger,
 * and moving that instant forward to "now" would erase the evidence for §6's
 * limitation — that a schedule fires only while the harness is running. A
 * reader treats any instant at or before now as due.
 *
 * @param trigger - the record, verbatim from the file.
 * @param now - the host's reading of the clock, for a trigger that has never
 *   fired: it is due immediately, and saying so as an instant lets one rule
 *   (`nextFireAt <= now`) cover both never-fired and overdue.
 * @returns the browser-facing row.
 */
function triggerRow(trigger: TriggerRecord, now: number): ProjectTriggerRow {
  const due = nextFireAt(trigger, now)
  return {
    name: trigger.name,
    task: trigger.task,
    every: trigger.every,
    enabled: trigger.enabled,
    ...(trigger.lastFiredAt === undefined ? {} : { lastFiredAt: trigger.lastFiredAt }),
    ...(due === undefined ? {} : { nextFireAt: new Date(due).toISOString() }),
  }
}

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
 * The single trust decision in this module: the directory comes from a host
 * record, never from the query string. Two ways in, because there are two
 * callers and only one of them has a session:
 *
 * * `session=<SessionId>` — the console, which is always inside a conversation.
 * * `workspace=<WorkspaceId>` — the workbench, which by §6.0 is shown
 *   exactly when NO session is open and therefore has no session id to send.
 *
 * The second does not widen the boundary. A `WorkspaceId` is a generated uuid
 * (`@deepseek-ai/dsh-workspace`'s own type: "never the path"), and an id no
 * registry entry claims resolves to nothing — so a guessed or stale id is
 * refused rather than coerced.
 *
 * To be accurate about what this buys: it is NOT secrecy. dsh's own
 * `workspace.list` already hands the browser every workspace's canonical
 * `path`, so the client is not being kept from knowing directories. What the
 * id-only parameter buys is that THIS route cannot be turned into an arbitrary
 * host file read — its reachable set is exactly the registered workspaces,
 * by construction rather than by a validation someone has to keep correct.
 *
 * **`session=` wins when both are present**, and the order is load-bearing
 * rather than arbitrary. A session is the narrower claim — it names a
 * conversation whose directory the host already fixed — so a `workspace=`
 * appended to an otherwise legitimate console request must not be able to
 * redirect the read. Trying the workspace first made exactly that request read
 * a different project (a 404 here, but the wrong shape of answer), which is
 * what `the workspace never crosses the wire` asserts against.
 */
function workspaceFor(ctx: Context, url: URL): string | undefined {
  const raw = url.searchParams.get('session')
  if (raw === null || raw === '') return workspaceById(ctx, url)
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

/**
 * The workspace a `workspace=<WorkspaceId>` parameter names, or undefined.
 *
 * Compared, never constructed: `String(id) === named` needs no branded
 * constructor and cannot mint an id the registry never issued, so a path
 * spelled into this parameter simply matches no record and is refused.
 */
function workspaceById(ctx: Context, url: URL): string | undefined {
  const named = url.searchParams.get('workspace')
  if (named === null || named === '') return undefined
  for (const workspace of ctx.workspaceRegistry.list()) {
    if (String(workspace.id) === named) return workspace.path
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
 * One `file:` reference with the host path taken off it.
 *
 * The trust boundary at the one place in this design that is MADE of paths
 * (§12.5). A reference that resolved inside the project keeps a
 * workspace-relative path, which is what lets an Inputs row be linked. One
 * that resolved elsewhere says so and carries nothing; one that did not
 * resolve carries nothing either — rheplicant's own refusal lists every
 * directory it tried, in host-absolute form, and that is exactly what must
 * not cross.
 *
 * @param workspace - the project's absolute directory.
 * @param reference - the reference as the compute service answered it.
 * @returns the browser-facing view.
 */
function withoutHostPath(
  workspace: string,
  reference: DocumentInputReference,
): ProjectInputReference {
  const base = {
    where: reference.where,
    path: reference.path,
    format: reference.format,
    resolves: reference.resolves,
    ...(reference.malformed === undefined ? {} : { malformed: reference.malformed }),
  }
  const resolved = reference.resolvedPath
  if (!reference.resolves || resolved === null) return { ...base, inProject: false }
  // `startsWith` on the directory PLUS its separator, never on the bare
  // directory: `/p/project-notes` starts with `/p/project` and is not in it.
  const prefix = workspace.endsWith(sep) ? workspace : `${workspace}${sep}`
  if (!resolved.startsWith(prefix)) return { ...base, inProject: false }
  return { ...base, inProject: true, projectPath: resolved.slice(prefix.length).split(sep).join('/') }
}

/**
 * The transport a request names, or a 400 saying it is not one.
 *
 * The value comes off the QUERY STRING, so it is caller-supplied and must be
 * validated here rather than cast. Cast, a misspelling reached the compute
 * seam and returned "no rheplicant compute provider is registered for
 * transport 'locl'" — true, and misleading: it reads as a composition
 * problem, not a bad request.
 *
 * @param url - the parsed request URL.
 * @param res - the response, written to on refusal.
 * @returns the transport, or undefined when this function has already answered.
 */
function transportOf(url: URL, res: ServerResponse): Transport | undefined {
  const named = url.searchParams.get('transport')
  // Absent is not invalid: `local` is the default every profile ships with.
  if (named === null) return 'local'
  if (isTransport(named)) return named
  json(res, 400, {
    error: `${named} is not a rheplicant transport`,
    code: 'INVALID_TRANSPORT',
  })
  return undefined
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
    path: `${ROUTE_PREFIX}/overview`,
    handler: (req, res) => {
      const url = requestUrl(req)
      const workspace = url === undefined ? undefined : workspaceFor(ctx, url)
      if (workspace === undefined) {
        json(res, 404, { error: 'unknown project', code: 'PROJECT_NOT_FOUND' })
        return
      }
      // One body from one pair of reads, not three routes the home would have
      // to stitch: a workbench assembled from three round trips could show
      // a task whose executions were pruned between two of them.
      const executions = ctx.rheplicantProject.listExecutions(workspace)
      const contents = ctx.rheplicantProject.listContents(workspace)
      json(res, 200, {
        project: basename(workspace),
        tasks: withExecutions(workspace, contents.tasks, executions),
        inputs: contents.inputs.map(input => ({
          path: input.path,
          bytes: input.bytes,
          modifiedAt: input.modifiedAt,
          extension: input.extension,
        })),
        executions: executions.map(summary => row(workspace, summary)),
        truncated: contents.truncated,
      } satisfies ProjectOverviewBody)
    },
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/triggers`,
    handler: (req, res) => {
      const url = requestUrl(req)
      const workspace = url === undefined ? undefined : workspaceFor(ctx, url)
      if (workspace === undefined) {
        json(res, 404, { error: 'unknown project', code: 'PROJECT_NOT_FOUND' })
        return
      }
      const registry = readTriggers(workspace)
      // 200 FOR ALL THREE STATES, including `unreadable`, and the reason is
      // that the question this route answers — *what does this project's
      // registry say* — was answered. "We cannot say" is a legitimate answer
      // to it, and a 5xx would be indistinguishable on the client from the
      // route not being mounted at all: exactly the collapse of `unreadable`
      // into `absent` that design §9.2 refuses.
      const now = Date.now()
      json(res, 200, {
        project: basename(workspace),
        state: registry.state,
        triggers: registry.triggers.map(trigger => triggerRow(trigger, now)),
        // `readTriggers` names the entry and the fault, never a path — a
        // reason that leaked the host directory would undo what the whole
        // module is for.
        ...(registry.state === 'unreadable' ? { reason: registry.reason } : {}),
      } satisfies ProjectTriggersBody)
    },
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/task`,
    handler: (req, res) => {
      const url = requestUrl(req)
      const workspace = url === undefined ? undefined : workspaceFor(ctx, url)
      if (url === undefined || workspace === undefined) {
        json(res, 404, { error: 'unknown project', code: 'PROJECT_NOT_FOUND' })
        return
      }
      // The path is caller-named, so every rule that bounds it lives in
      // `readTaskDocument` — relative-only, a task extension, never inside
      // `results/`, and the hardened open. This handler adds none of its own,
      // deliberately: a second place to state the bound is a second place for
      // it to drift.
      try {
        const document = ctx.rheplicantProject.readTask(workspace, url.searchParams.get('path') ?? '')
        json(res, 200, {
          path: document.path,
          text: document.text,
          bytes: document.bytes,
          modifiedAt: document.modifiedAt,
        } satisfies ProjectTaskDocumentBody)
      } catch (error) {
        const code = error instanceof ProjectReadError ? error.code : 'ARTIFACT_UNREADABLE'
        // The message names a host path; the browser gets the code and a
        // sentence that does not.
        json(res, code === 'PATH_ESCAPES_PROJECT' || code === 'ARTIFACT_NOT_ALLOWED' ? 400 : 404, {
          error: 'this task document could not be read',
          code,
        })
      }
    },
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/projection`,
    handler: async (req, res) => {
      const url = requestUrl(req)
      const workspace = url === undefined ? undefined : workspaceFor(ctx, url)
      if (url === undefined || workspace === undefined) {
        json(res, 404, { error: 'unknown project', code: 'PROJECT_NOT_FOUND' })
        return
      }
      const transport = transportOf(url, res)
      if (transport === undefined) return
      // ONE ROUTE, TWO SOURCES (`docs/project-model.md` §28.1). Without
      // `execution=` this projects the AUTHORED task; with it, the bytes that
      // execution was actually GIVEN — `config.input.yaml`, already on P3's
      // allow-list and already read by §15's diff.
      //
      // The alternative was to keep drawing the as-run graph from the SVG the
      // run stored, and that is what made two copies of one diagram disagree
      // about their colours: `server.py`'s `_graph` renders `theme="dark"`
      // while `gui/document.py` takes `to_svg`'s `"light"` default, so on
      // either scheme one of the two was wrong. Projecting both through this
      // one route makes the renderer identical, which is also what makes the
      // comparison mean something: any difference between the two pictures is
      // then a difference in the DOCUMENTS.
      const executionId = url.searchParams.get('execution')
      let document: { readonly path: string; readonly text: string }
      if (executionId !== null && executionId !== '') {
        // The identity is taken from THIS listing, never from the request —
        // the same rule the artifact route states, for the same reason.
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
            name: EXECUTED_DOCUMENT,
          })
          // `relativePath` and not `resultsPath`: the first is what the rest
          // of this module lets the browser see, the second is a host path.
          const shown = `${relativePath(workspace, found.resultsPath)}${EXECUTED_DOCUMENT}`
          // `decodeDocument` and NOT `new TextDecoder().decode(...)`: the
          // latter substitutes invalid sequences silently, and that text would
          // then be projected AND hashed into the `digest` below — the field
          // whose whole job is to stop a diagram being shown against the wrong
          // version of a document. One policy, stated once, beside the reader
          // that established it.
          document = { path: shown, text: decodeDocument(artifact.bytes, shown) }
        } catch (error) {
          const code = error instanceof ProjectReadError ? error.code : 'ARTIFACT_UNREADABLE'
          json(res, code === 'EXECUTION_NOT_FOUND' ? 404 : 409, {
            error: 'this execution is no longer readable — refresh the list',
            code,
          })
          return
        }
      } else {
        // Read host-side through the same reader every other document route
        // uses, so the confinement is inherited rather than restated.
        try {
          document = ctx.rheplicantProject.readTask(workspace, url.searchParams.get('path') ?? '')
        } catch (error) {
          const code = error instanceof ProjectReadError ? error.code : 'ARTIFACT_UNREADABLE'
          json(res, code === 'PATH_ESCAPES_PROJECT' || code === 'ARTIFACT_NOT_ALLOWED' ? 400 : 404, {
            error: 'this task document could not be read',
            code,
          })
          return
        }
      }
      try {
        const projected = await ctx.rheplicant.projectDocument(document.text, { transport })
        json(res, 200, {
          path: document.path,
          // The same guarantee the definition route gives: a diagram shown
          // against the wrong version of a document is worse than no diagram,
          // because a diagram is believed on sight.
          digest: createHash('sha256').update(document.text).digest('hex'),
          svg: projected.svg,
          walkOrder: projected.walkOrder,
          model: projected.model,
          runs: projected.runs,
          parameters: projected.parameters,
        } satisfies ProjectDocumentProjectionBody)
      } catch (error) {
        // `rheplicant.gui` is an OPTIONAL extra, so this can be unavailable on
        // a perfectly working install. Saying so beats rendering a document
        // as though it declared no physics.
        json(res, 502, {
          error: 'this document could not be projected — the compute service may not have the gui extra',
          code: 'PROJECTION_UNAVAILABLE',
          detail: error instanceof Error ? error.message : String(error),
        })
      }
    },
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/definition`,
    handler: async (req, res) => {
      const url = requestUrl(req)
      const workspace = url === undefined ? undefined : workspaceFor(ctx, url)
      if (url === undefined || workspace === undefined) {
        json(res, 404, { error: 'unknown project', code: 'PROJECT_NOT_FOUND' })
        return
      }
      const transport = transportOf(url, res)
      if (transport === undefined) return
      // Read HOST-side, through the same reader the `/task` route uses, so
      // the confinement is inherited rather than restated — and so a browser
      // cannot submit a document of its own to be checked (§12.6).
      let document
      try {
        document = ctx.rheplicantProject.readTask(workspace, url.searchParams.get('path') ?? '')
      } catch (error) {
        const code = error instanceof ProjectReadError ? error.code : 'ARTIFACT_UNREADABLE'
        json(res, code === 'PATH_ESCAPES_PROJECT' || code === 'ARTIFACT_NOT_ALLOWED' ? 400 : 404, {
          error: 'this task document could not be read',
          code,
        })
        return
      }
      const absolute = join(workspace, document.path)
      try {
        const report = await ctx.rheplicant.definition(
          { documentText: document.text, taskPath: absolute },
          { transport },
        )
        json(res, 200, {
          path: document.path,
          // The digest of the bytes actually checked, so a verdict can never
          // be shown against a document it does not describe.
          digest: createHash('sha256').update(document.text).digest('hex'),
          inputs: report.inputs.map((reference: DocumentInputReference) => withoutHostPath(workspace, reference)),
          validation: report.validation,
          gates: report.gates,
          // Forwarded verbatim: a path out of the user's own document, and a
          // label out of the grammar. Neither is a host path.
          fields: report.fields ?? null,
          ...(report.fieldsUnavailable === undefined
            ? {}
            : { fieldsUnavailable: report.fieldsUnavailable }),
        } satisfies ProjectDefinitionBody)
      } catch (error) {
        json(res, 502, {
          error: 'the compute service could not check this task',
          code: 'DEFINITION_UNAVAILABLE',
          detail: error instanceof Error ? error.message : String(error),
        })
      }
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
      const transport = transportOf(url, res)
      if (transport === undefined) return
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
        const outcome = await ctx.rheplicant.readExecution(found.resultsPath, { transport })
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

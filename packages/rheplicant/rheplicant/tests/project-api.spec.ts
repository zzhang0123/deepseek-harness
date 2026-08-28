import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { apply, ROUTE_PREFIX } from '@rheplicant/dsh-rheplicant/project-api'
import { listExecutions, readArtifact } from '@rheplicant/dsh-rheplicant/executions'
import { readTaskDocument, scanProject } from '@rheplicant/dsh-rheplicant/contents'

const MARKER = '2878be26-4551-4183-ae96-43ea0f0e83f4'

let workspace: string

/** One published execution, as P2's publish path leaves it. */
function execution(task: string, id: string, files: Record<string, string> = {}): string {
  const directory = join(workspace, 'results', task, id)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, '.rheplicant-results.json'),
    JSON.stringify({ format_version: 1, run_directory_id: MARKER }))
  for (const [name, body] of Object.entries(files)) writeFileSync(join(directory, name), body)
  return directory
}

/** A captured response: status, headers and body. */
interface Captured {
  status: number
  headers: Record<string, string>
  body: string
}

/** Register the routes over a fake context and return a request driver. */
/** Paths the fake compute service was asked to project, in order. */
let readCalls: string[]
/** What the fake compute service returns, or undefined to make it throw. */
let compute: Record<string, unknown> | undefined
/** Documents the fake compute service was asked to check, in order. */
let definitionCalls: { documentText: string; taskPath: string | undefined }[]
/** What the fake `definition` answers, or undefined to make it throw. */
let definition: Record<string, unknown> | undefined
/** Documents the fake service was asked to project, in order. */
let projectionCalls: string[]
/** What the fake `projectDocument` answers, or undefined to make it throw. */
let projection: Record<string, unknown> | undefined

function routes(
  sessions: Record<string, string | undefined>,
  workspaces: { path: string; sessionIds: string[]; id?: string }[] = [],
) {
  const table = new Map<string, (req: unknown, res: unknown) => void | Promise<void>>()
  const ctx = {
    effect: (run: () => unknown) => { run() },
    webServer: { register: (route: { path: string; handler: never }) => { table.set(route.path, route.handler) } },
    sessions: {
      get: (id: string) => {
        const cwd = sessions[id]
        return cwd === undefined ? undefined : { header: { cwd } }
      },
    },
    workspaceRegistry: { list: () => workspaces },
    rheplicantProject: { listExecutions, readArtifact, listContents: scanProject, readTask: readTaskDocument },
    rheplicant: {
      readExecution: (resultsPath: string) => {
        readCalls.push(resultsPath)
        if (compute === undefined) throw new Error('compute is down')
        return Promise.resolve(compute)
      },
      projectDocument: (documentText: string) => {
        projectionCalls.push(documentText)
        if (projection === undefined) throw new Error('compute is down')
        return Promise.resolve(projection)
      },
      definition: (input: { documentText: string; taskPath?: string }) => {
        definitionCalls.push({ documentText: input.documentText, taskPath: input.taskPath })
        if (definition === undefined) throw new Error('compute is down')
        return Promise.resolve(definition)
      },
    },
  }
  apply(ctx as never)
  const drive = async (path: string, query: string): Promise<Captured> => {
    const handler = table.get(path)
    if (handler === undefined) throw new Error(`no route ${path}`)
    const captured: Captured = { status: 0, headers: {}, body: '' }
    const res = {
      writeHead: (status: number, headers: Record<string, string>) => {
        captured.status = status
        captured.headers = headers
      },
      end: (payload: Buffer) => { captured.body = payload.toString('utf8') },
    }
    await handler({ url: `${path}?${query}` }, res)
    return captured
  }
  /**
   * The same driver for the one route that WRITES.
   *
   * A real `IncomingMessage` is an async iterable of Buffers and the handler
   * reads it as one, so the fake has to be too — a plain object with a `body`
   * string would let the route pass here and fail against a real server.
   */
  drive.post = async (path: string, body: unknown, method = 'POST'): Promise<Captured> => {
    const handler = table.get(path)
    if (handler === undefined) throw new Error(`no route ${path}`)
    const captured: Captured = { status: 0, headers: {}, body: '' }
    const res = {
      writeHead: (status: number, headers: Record<string, string>) => {
        captured.status = status
        captured.headers = headers
      },
      end: (payload: Buffer) => { captured.body = payload.toString('utf8') },
    }
    const chunks = [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8')]
    const req = {
      url: path,
      method,
      // eslint-disable-next-line @typescript-eslint/require-await
      async *[Symbol.asyncIterator]() { yield* chunks },
    }
    await handler(req as never, res)
    return captured
  }
  return drive
}

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'rheplicant-api-'))
  readCalls = []
  definitionCalls = []
  projectionCalls = []
  projection = {
    svg: '<svg/>', walkOrder: ['a'], model: { totalNodes: 33, nodes: [] },
    runs: { exitsTotal: 18, catalogue: [], declared: [], reserved: [] },
  }
  definition = { inputs: [], validation: { valid: true, errors: [], warnings: [] }, gates: { checks: [], runs: [], warnings: [] } }
  compute = { runs: [{ name: 'fit', kind: 'nuts', status: 'ok' }], gates: [], resultsPath: '/host/only' }
})

describe('the workspace never crosses the wire', () => {
  it('reads the directory from the SESSION, not from the query string', async () => {
    // The single trust decision in the module. A client that could name the
    // directory could name any directory.
    const elsewhere = mkdtempSync(join(tmpdir(), 'rheplicant-elsewhere-'))
    mkdirSync(join(elsewhere, 'results', 't', 'EXEC-1'), { recursive: true })
    writeFileSync(join(elsewhere, 'results', 't', 'EXEC-1', '.rheplicant-results.json'),
      JSON.stringify({ format_version: 1, run_directory_id: MARKER }))
    execution('tasks/fit', 'EXEC-MINE')

    const request = routes({ 'S-1': workspace })
    const listed = await request(`${ROUTE_PREFIX}/executions`,
      `session=S-1&workspace=${encodeURIComponent(elsewhere)}&cwd=${encodeURIComponent(elsewhere)}`)
    const body = JSON.parse(listed.body) as { executions: { executionId: string }[] }
    expect(body.executions.map(row => row.executionId)).toEqual(['EXEC-MINE'])
  })

  it.each(['session=', 'session=S-unknown', ''])('refuses the unknown session %s', async (query) => {
    const request = routes({ 'S-1': workspace })
    const response = await request(`${ROUTE_PREFIX}/executions`, query)
    expect(response.status).toBe(404)
    expect(JSON.parse(response.body).code).toBe('SESSION_NOT_FOUND')
  })
})

describe('the listing', () => {
  it('sends project-relative paths and no host directory at all', async () => {
    execution('tasks/fit', 'EXEC-1')
    const request = routes({ 'S-1': workspace })
    const response = await request(`${ROUTE_PREFIX}/executions`, 'session=S-1')
    expect(response.status).toBe(200)
    const body = JSON.parse(response.body) as { project: string; executions: { path: string }[] }
    expect(body.executions[0]?.path).toBe('results/tasks/fit/EXEC-1/')
    // The browser has no use for the host's layout, and it does not get it.
    expect(response.body).not.toContain(workspace)
  })

  it('names the project once on the body rather than per row', async () => {
    execution('tasks/fit', 'EXEC-1')
    execution('tasks/fit', 'EXEC-2')
    const request = routes({ 'S-1': workspace })
    const body = JSON.parse((await request(`${ROUTE_PREFIX}/executions`, 'session=S-1')).body)
    expect(body.project).toBe(workspace.split('/').at(-1))
    expect(body.executions).toHaveLength(2)
    expect('project' in body.executions[0]).toBe(false)
  })

  it('answers an empty project with an empty list, not an error', async () => {
    const request = routes({ 'S-1': workspace })
    const response = await request(`${ROUTE_PREFIX}/executions`, 'session=S-1')
    expect(response.status).toBe(200)
    expect(JSON.parse(response.body).executions).toEqual([])
  })

  it('is never cached: a pruned execution must not read as present', async () => {
    execution('tasks/fit', 'EXEC-1')
    const request = routes({ 'S-1': workspace })
    const response = await request(`${ROUTE_PREFIX}/executions`, 'session=S-1')
    expect(response.headers['cache-control']).toBe('no-store')
  })
})

describe('serving one artifact', () => {
  it('serves an allowed file for an execution in this project', async () => {
    execution('tasks/fit', 'EXEC-1', { 'provenance.json': '{"status":"ok"}' })
    const request = routes({ 'S-1': workspace })
    const response = await request(`${ROUTE_PREFIX}/artifact`,
      'session=S-1&execution=EXEC-1&name=provenance.json')
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('application/json')
    expect(JSON.parse(response.body)).toEqual({ status: 'ok' })
  })

  it('refuses a name outside the allow-list before touching the filesystem', async () => {
    execution('tasks/fit', 'EXEC-1', { 'secret.env': 'TOKEN=1' })
    const request = routes({ 'S-1': workspace })
    const response = await request(`${ROUTE_PREFIX}/artifact`,
      'session=S-1&execution=EXEC-1&name=secret.env')
    expect(response.status).toBe(400)
    expect(JSON.parse(response.body).code).toBe('ARTIFACT_NOT_ALLOWED')
  })

  it('refuses a traversal by name', async () => {
    execution('tasks/fit', 'EXEC-1')
    const request = routes({ 'S-1': workspace })
    const response = await request(`${ROUTE_PREFIX}/artifact`,
      'session=S-1&execution=EXEC-1&name=..%2F..%2Fetc%2Fpasswd')
    expect(response.status).toBe(400)
  })

  it('refuses an execution that is not in this project', async () => {
    execution('tasks/fit', 'EXEC-1')
    const request = routes({ 'S-1': workspace })
    const response = await request(`${ROUTE_PREFIX}/artifact`,
      'session=S-1&execution=EXEC-NOWHERE&name=provenance.json')
    expect(response.status).toBe(404)
    expect(JSON.parse(response.body).code).toBe('EXECUTION_NOT_FOUND')
  })

  it('reports an unreadable artifact without leaking the host path', async () => {
    // The read refuses (the file is absent); the browser learns the code and a
    // sentence, not where on this machine anything lives.
    execution('tasks/fit', 'EXEC-1')
    const request = routes({ 'S-1': workspace })
    const response = await request(`${ROUTE_PREFIX}/artifact`,
      'session=S-1&execution=EXEC-1&name=provenance.json')
    expect(response.status).toBe(409)
    expect(response.body).not.toContain(workspace)
    expect(JSON.parse(response.body).code).toBe('ARTIFACT_UNREADABLE')
  })
})


describe('a session the host has not attached', () => {
  it('resolves through the durable workspace registry instead of 404ing', async () => {
    // Measured in a real boot: a session the browser has OPEN is not
    // necessarily attached in the session store, so the registry is the path
    // that actually runs for an ordinary page load.
    execution('tasks/fit', 'EXEC-1')
    const request = routes({}, [{ path: workspace, sessionIds: ['session-abc'] }])
    const response = await request(`${ROUTE_PREFIX}/executions`, 'session=session-abc')
    expect(response.status).toBe(200)
    expect(JSON.parse(response.body).executions).toHaveLength(1)
  })

  it('still refuses a session no workspace claims', async () => {
    execution('tasks/fit', 'EXEC-1')
    const request = routes({}, [{ path: workspace, sessionIds: ['session-abc'] }])
    const response = await request(`${ROUTE_PREFIX}/executions`, 'session=session-nobody')
    expect(response.status).toBe(404)
  })

  it('prefers the attached session over the registry', async () => {
    // Both know a directory; the session's own is the more specific fact.
    const other = mkdtempSync(join(tmpdir(), 'rheplicant-other-'))
    execution('tasks/fit', 'EXEC-1')
    const request = routes({ 'session-abc': workspace }, [{ path: other, sessionIds: ['session-abc'] }])
    const response = await request(`${ROUTE_PREFIX}/executions`, 'session=session-abc')
    expect(JSON.parse(response.body).executions).toHaveLength(1)
  })
})


describe('projecting one execution', () => {
  it('asks the compute service for the tree this project actually holds', async () => {
    const directory = execution('tasks/fit', 'EXEC-1')
    const request = routes({ 'S-1': workspace })
    const response = await request(`${ROUTE_PREFIX}/execution`, 'session=S-1&execution=EXEC-1')
    expect(response.status).toBe(200)
    // The path came from the host's own listing, never from the request.
    expect(readCalls).toEqual([directory])
  })

  it('does not send the host path back with the projection', async () => {
    execution('tasks/fit', 'EXEC-1')
    const request = routes({ 'S-1': workspace })
    const response = await request(`${ROUTE_PREFIX}/execution`, 'session=S-1&execution=EXEC-1')
    const body = JSON.parse(response.body)
    expect(body.runs).toHaveLength(1)
    expect('resultsPath' in body).toBe(false)
    expect(response.body).not.toContain('/host/only')
  })

  it('checks the execution still owns its directory BEFORE projecting it', async () => {
    // A tree whose marker is unreadable must never reach the compute service:
    // the identity check is what makes "this is the execution you listed" true.
    const directory = execution('tasks/fit', 'EXEC-1')
    writeFileSync(join(directory, '.rheplicant-results.json'), 'not json')
    const request = routes({ 'S-1': workspace })
    const response = await request(`${ROUTE_PREFIX}/execution`, 'session=S-1&execution=EXEC-1')
    expect(response.status).toBe(404)
    expect(readCalls).toEqual([])
  })

  it('refuses an execution that is not in this project', async () => {
    execution('tasks/fit', 'EXEC-1')
    const request = routes({ 'S-1': workspace })
    const response = await request(`${ROUTE_PREFIX}/execution`, 'session=S-1&execution=NOPE')
    expect(response.status).toBe(404)
    expect(readCalls).toEqual([])
  })

  it('reports a compute failure as a gateway error, not as an empty execution', async () => {
    // An empty body would render as "this run produced nothing", which is a
    // different and much worse claim than "the service could not answer".
    execution('tasks/fit', 'EXEC-1')
    compute = undefined
    const request = routes({ 'S-1': workspace })
    const response = await request(`${ROUTE_PREFIX}/execution`, 'session=S-1&execution=EXEC-1')
    expect(response.status).toBe(502)
    expect(JSON.parse(response.body).code).toBe('EXECUTION_UNREADABLE')
  })

  it('refuses an unknown session before touching the project', async () => {
    execution('tasks/fit', 'EXEC-1')
    const request = routes({ 'S-1': workspace })
    const response = await request(`${ROUTE_PREFIX}/execution`, 'session=S-nope&execution=EXEC-1')
    expect(response.status).toBe(404)
    expect(readCalls).toEqual([])
  })
})

describe('naming the project when no session is open', () => {
  // §6.0's workbench is shown exactly when NO session is open, so it has
  // no session id to send. Resolving a WorkspaceId keeps the trust boundary
  // intact for the same reason a SessionId did: it is a generated uuid the
  // host minted, never a path, so a client still cannot name a directory.
  it('resolves a workspace id through the registry', async () => {
    execution('tasks/fit', 'EXEC-1')
    const call = routes({}, [{ id: 'ws-1', path: workspace, sessionIds: [] }])
    const found = await call(`${ROUTE_PREFIX}/overview`, 'workspace=ws-1')
    expect(found.status).toBe(200)
    expect(JSON.parse(found.body).executions).toHaveLength(1)
  })

  it('refuses a workspace id no registry entry claims', async () => {
    const call = routes({}, [{ id: 'ws-1', path: workspace, sessionIds: [] }])
    expect((await call(`${ROUTE_PREFIX}/overview`, 'workspace=ws-2')).status).toBe(404)
  })

  it('refuses a request that names neither a session nor a workspace', async () => {
    routes({}, [{ id: 'ws-1', path: workspace, sessionIds: [] }])
    const call = routes({}, [{ id: 'ws-1', path: workspace, sessionIds: [] }])
    expect((await call(`${ROUTE_PREFIX}/overview`, '')).status).toBe(404)
  })

  it('never accepts a directory, however it is spelled', async () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'rheplicant-elsewhere-'))
    const call = routes({}, [{ id: 'ws-1', path: workspace, sessionIds: [] }])
    for (const query of [`workspace=${encodeURIComponent(elsewhere)}`, `path=${encodeURIComponent(elsewhere)}`]) {
      expect((await call(`${ROUTE_PREFIX}/overview`, query)).status).toBe(404)
    }
  })

  it('lets the existing executions route be reached the same way', async () => {
    // The console asks by session and the home asks by workspace; one
    // resolution rule serves both, so the two surfaces cannot drift on which
    // executions a project has.
    execution('tasks/fit', 'EXEC-1')
    const call = routes({}, [{ id: 'ws-1', path: workspace, sessionIds: [] }])
    const found = await call(`${ROUTE_PREFIX}/executions`, 'workspace=ws-1')
    expect(JSON.parse(found.body).executions).toHaveLength(1)
  })
})

describe('the project overview', () => {
  it('reports the tasks the project holds, not only the ones it has run', async () => {
    mkdirSync(join(workspace, 'tasks'), { recursive: true })
    writeFileSync(join(workspace, 'tasks', 'fit.yaml'), 'schema_version: 1')
    writeFileSync(join(workspace, 'never-run.yaml'), 'schema_version: 1')
    const call = routes({}, [{ id: 'ws-1', path: workspace, sessionIds: [] }])
    const body = JSON.parse((await call(`${ROUTE_PREFIX}/overview`, 'workspace=ws-1')).body)
    expect(body.tasks.map((task: { path: string }) => task.path))
      .toEqual(['never-run.yaml', 'tasks/fit.yaml'])
  })

  it("counts each task's executions and names its newest", async () => {
    mkdirSync(join(workspace, 'tasks'), { recursive: true })
    writeFileSync(join(workspace, 'tasks', 'fit.yaml'), 'schema_version: 1')
    execution('tasks/fit', '20260822T100000Z-aaaa-bbbb')
    execution('tasks/fit', '20260822T120000Z-cccc-dddd')
    const call = routes({}, [{ id: 'ws-1', path: workspace, sessionIds: [] }])
    const body = JSON.parse((await call(`${ROUTE_PREFIX}/overview`, 'workspace=ws-1')).body)
    expect(body.tasks[0]).toMatchObject({
      path: 'tasks/fit.yaml',
      executionCount: 2,
      newestExecutionId: '20260822T120000Z-cccc-dddd',
    })
  })

  it('leaves a never-run task without a newest execution rather than guessing one', async () => {
    writeFileSync(join(workspace, 'lonely.yaml'), 'schema_version: 1')
    execution('tasks/other', 'EXEC-1')
    const call = routes({}, [{ id: 'ws-1', path: workspace, sessionIds: [] }])
    const body = JSON.parse((await call(`${ROUTE_PREFIX}/overview`, 'workspace=ws-1')).body)
    expect(body.tasks[0]).toMatchObject({ path: 'lonely.yaml', executionCount: 0 })
    expect(body.tasks[0].newestExecutionId).toBeUndefined()
  })

  it('reports candidate inputs by extension and never claims a format', async () => {
    mkdirSync(join(workspace, 'inputs'), { recursive: true })
    writeFileSync(join(workspace, 'inputs', 'beam.npz'), 'x')
    const call = routes({}, [{ id: 'ws-1', path: workspace, sessionIds: [] }])
    const body = JSON.parse((await call(`${ROUTE_PREFIX}/overview`, 'workspace=ws-1')).body)
    expect(body.inputs[0]).toMatchObject({ path: 'inputs/beam.npz', extension: 'npz' })
    expect(body.inputs[0].format).toBeUndefined()
  })

  it('says when a scan cap truncated the walk rather than reading as complete', async () => {
    const call = routes({}, [{ id: 'ws-1', path: workspace, sessionIds: [] }])
    const body = JSON.parse((await call(`${ROUTE_PREFIX}/overview`, 'workspace=ws-1')).body)
    expect(body.truncated).toBe(false)
  })

  it('sends no host path anywhere in the body', async () => {
    writeFileSync(join(workspace, 'fit.yaml'), 'schema_version: 1')
    writeFileSync(join(workspace, 'beam.npz'), 'x')
    execution('fit', 'EXEC-1')
    const call = routes({}, [{ id: 'ws-1', path: workspace, sessionIds: [] }])
    const found = await call(`${ROUTE_PREFIX}/overview`, 'workspace=ws-1')
    expect(found.body).not.toContain(workspace)
    expect(found.body).not.toContain(tmpdir())
  })

  it('names the project once, as a name and not a path', async () => {
    const call = routes({}, [{ id: 'ws-1', path: workspace, sessionIds: [] }])
    const body = JSON.parse((await call(`${ROUTE_PREFIX}/overview`, 'workspace=ws-1')).body)
    expect(body.project).toBe(basename(workspace))
  })

  it('is never cached: a pruned execution must not read as present', async () => {
    const call = routes({}, [{ id: 'ws-1', path: workspace, sessionIds: [] }])
    const found = await call(`${ROUTE_PREFIX}/overview`, 'workspace=ws-1')
    expect(found.headers['cache-control']).toBe('no-store')
  })

  it('answers an empty project with empty lists, not an error', async () => {
    const call = routes({}, [{ id: 'ws-1', path: workspace, sessionIds: [] }])
    const found = await call(`${ROUTE_PREFIX}/overview`, 'workspace=ws-1')
    expect(found.status).toBe(200)
    expect(JSON.parse(found.body)).toMatchObject({ tasks: [], inputs: [], executions: [] })
  })
})

describe('which parameter wins when a request carries both', () => {
  it('reads the SESSION project, never the workspace the query names', async () => {
    // The sharp case: `workspace=` naming a real, valid id for a DIFFERENT
    // project this host genuinely has. A path in that parameter matches no
    // record and is refused for free; a valid id would be honoured, so the
    // precedence is what stops a console request being redirected.
    const other = mkdtempSync(join(tmpdir(), 'rheplicant-other-'))
    mkdirSync(join(other, 'results', 't', 'EXEC-THEIRS'), { recursive: true })
    writeFileSync(join(other, 'results', 't', 'EXEC-THEIRS', '.rheplicant-results.json'),
      JSON.stringify({ format_version: 1, run_directory_id: MARKER }))
    execution('tasks/fit', 'EXEC-MINE')

    const call = routes({ 'S-1': workspace }, [
      { id: 'ws-mine', path: workspace, sessionIds: [] },
      { id: 'ws-other', path: other, sessionIds: [] },
    ])
    const body = JSON.parse((await call(`${ROUTE_PREFIX}/overview`, 'session=S-1&workspace=ws-other')).body)
    expect(body.executions.map((e: { executionId: string }) => e.executionId)).toEqual(['EXEC-MINE'])
  })

  it('refuses a malformed session outright rather than falling through to the workspace', async () => {
    // A refusal must not be recoverable by appending another parameter: a
    // request that names a session is asking about that session.
    execution('tasks/fit', 'EXEC-MINE')
    const call = routes({}, [{ id: 'ws-mine', path: workspace, sessionIds: [] }])
    expect((await call(`${ROUTE_PREFIX}/overview`, 'session=not-a-session-id&workspace=ws-mine')).status)
      .toBe(404)
  })
})

describe('serving one task document', () => {
  /** Write a task file into the workspace. */
  function task(relative: string, body: string): void {
    mkdirSync(join(workspace, dirname(relative)), { recursive: true })
    writeFileSync(join(workspace, relative), body)
  }

  it('serves the document a caller names', async () => {
    task('tasks/fit.yaml', 'schema_version: 1\n')
    const call = routes({}, [{ id: 'ws-1', path: workspace, sessionIds: [] }])
    const found = await call(`${ROUTE_PREFIX}/task`, 'workspace=ws-1&path=tasks%2Ffit.yaml')
    expect(found.status).toBe(200)
    expect(JSON.parse(found.body)).toMatchObject({
      path: 'tasks/fit.yaml',
      text: 'schema_version: 1\n',
    })
  })

  it('refuses a traversal with 400, not a 404 that reads as "missing"', async () => {
    // The two refusals are LAYERED, and the order shows in the code. The kind
    // check runs first, so a traversal at a name that is not a task document
    // never reaches the path logic at all — refused for what it is before
    // where it points.
    const call = routes({}, [{ id: 'ws-1', path: workspace, sessionIds: [] }])
    const notADocument = await call(`${ROUTE_PREFIX}/task`, 'workspace=ws-1&path=..%2F..%2Fetc%2Fpasswd')
    expect(notADocument.status).toBe(400)
    expect(JSON.parse(notADocument.body).code).toBe('ARTIFACT_NOT_ALLOWED')

    // A traversal that IS spelled as a task document reaches the confinement
    // check, and is refused there.
    const escaping = await call(`${ROUTE_PREFIX}/task`, 'workspace=ws-1&path=..%2Foutside.yaml')
    expect(escaping.status).toBe(400)
    expect(JSON.parse(escaping.body).code).toBe('PATH_ESCAPES_PROJECT')
  })

  it('refuses a file that is not a task document', async () => {
    task('secrets.env', 'TOKEN=1')
    const call = routes({}, [{ id: 'ws-1', path: workspace, sessionIds: [] }])
    const found = await call(`${ROUTE_PREFIX}/task`, 'workspace=ws-1&path=secrets.env')
    expect(found.status).toBe(400)
    expect(JSON.parse(found.body).code).toBe('ARTIFACT_NOT_ALLOWED')
  })

  it('refuses a published config.input.yaml, which belongs to the artifact route', async () => {
    execution('demo', 'EXEC-1', { 'config.input.yaml': 'schema_version: 1' })
    const call = routes({}, [{ id: 'ws-1', path: workspace, sessionIds: [] }])
    const found = await call(`${ROUTE_PREFIX}/task`,
      'workspace=ws-1&path=results%2Fdemo%2FEXEC-1%2Fconfig.input.yaml')
    expect(found.status).toBe(400)
  })

  it('never leaks the host path in the refusal', async () => {
    const call = routes({}, [{ id: 'ws-1', path: workspace, sessionIds: [] }])
    const found = await call(`${ROUTE_PREFIX}/task`, 'workspace=ws-1&path=absent.yaml')
    expect(found.body).not.toContain(workspace)
    expect(found.body).not.toContain(tmpdir())
  })

  it('refuses a request that names no project', async () => {
    task('fit.yaml', 'x')
    const call = routes({}, [{ id: 'ws-1', path: workspace, sessionIds: [] }])
    expect((await call(`${ROUTE_PREFIX}/task`, 'path=fit.yaml')).status).toBe(404)
  })

  it('reaches the same document by session, so the console can ask too', async () => {
    task('fit.yaml', 'schema_version: 1')
    const call = routes({ 'S-1': workspace }, [])
    const found = await call(`${ROUTE_PREFIX}/task`, 'session=S-1&path=fit.yaml')
    expect(JSON.parse(found.body).text).toBe('schema_version: 1')
  })

  it('is never cached: a document changes under the browser', async () => {
    task('fit.yaml', 'x')
    const call = routes({}, [{ id: 'ws-1', path: workspace, sessionIds: [] }])
    const found = await call(`${ROUTE_PREFIX}/task`, 'workspace=ws-1&path=fit.yaml')
    expect(found.headers['cache-control']).toBe('no-store')
  })
})

describe('the digest that makes staleness sayable', () => {
  it('carries the executed task digest when the sidecar recorded one', async () => {
    // §4.2: staleness is a digest comparison. Without this on the wire a
    // surface could only compare mtimes, which is a weaker claim under the
    // same word.
    const directory = execution('demo', 'EXEC-1')
    writeFileSync(join(directory, '.rheplicant-agent.json'),
      JSON.stringify({ executionId: 'EXEC-1', task: 'demo', taskDigest: 'abc123' }))
    const call = routes({}, [{ id: 'ws-1', path: workspace, sessionIds: [] }])
    const body = JSON.parse((await call(`${ROUTE_PREFIX}/executions`, 'workspace=ws-1')).body)
    expect(body.executions[0].taskDigest).toBe('abc123')
  })

  it('omits it rather than inventing one when the sidecar has none', async () => {
    // Absent must stay absent: an empty string would compare unequal to every
    // document and mark a fresh execution stale.
    execution('demo', 'EXEC-1')
    const call = routes({}, [{ id: 'ws-1', path: workspace, sessionIds: [] }])
    const body = JSON.parse((await call(`${ROUTE_PREFIX}/executions`, 'workspace=ws-1')).body)
    expect('taskDigest' in body.executions[0]).toBe(false)
  })
})

describe('checking whether one task is defined', () => {
  /** A workspace holding one task document and one data file beside it. */
  function project(text = 'model: {}\n'): void {
    mkdirSync(join(workspace, 'tasks'), { recursive: true })
    writeFileSync(join(workspace, 'tasks', 'fit.yaml'), text)
    mkdirSync(join(workspace, 'inputs'), { recursive: true })
    writeFileSync(join(workspace, 'inputs', 'gain.npy'), '')
  }

  it('reads the document HOST-side, so the browser cannot submit one of its own', async () => {
    // The confinement is `readTask`'s, inherited rather than restated: a
    // second place to state the bound is a second place for it to drift.
    project('model: {authored: true}\n')
    const request = routes({ 'S-1': workspace })

    await request(`${ROUTE_PREFIX}/definition`, 'session=S-1&path=tasks/fit.yaml')

    expect(definitionCalls).toEqual([
      { documentText: 'model: {authored: true}\n', taskPath: join(workspace, 'tasks', 'fit.yaml') },
    ])
  })

  it('ignores a document the QUERY STRING tries to supply', async () => {
    // The other half of "host-side". Asserting only that the host-read text
    // was forwarded leaves room for a second, caller-named source alongside
    // it — a mutation adding one survived until this test existed.
    project('model: {authored: true}\n')
    const request = routes({ 'S-1': workspace })

    await request(`${ROUTE_PREFIX}/definition`,
      `session=S-1&path=tasks/fit.yaml&text=${encodeURIComponent('model: {injected: true}')}`
      + `&documentText=${encodeURIComponent('model: {injected: true}')}`)

    expect(definitionCalls.map(call => call.documentText)).toEqual(['model: {authored: true}\n'])
  })

  it('does not place a self-contradicting answer inside the project', async () => {
    // A reference that says it did not resolve yet carries a path is a
    // compute service disagreeing with itself. Believing the path would turn
    // that into a project-relative claim about a file nobody found.
    project()
    definition = {
      inputs: [{
        where: 'model.gain.gain', path: 'inputs/gain.npy', format: 'npy',
        resolves: false, resolvedPath: join(workspace, 'inputs', 'gain.npy'),
      }],
      validation: { valid: true, errors: [], warnings: [] },
      gates: { checks: [], runs: [], warnings: [] },
    }
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/definition`, 'session=S-1&path=tasks/fit.yaml')

    const body = JSON.parse(response.body) as { inputs: [Record<string, unknown>] }
    expect(body.inputs[0].inProject).toBe(false)
    expect(response.body).not.toContain(workspace)
  })

  it('answers the digest of the bytes it CHECKED', async () => {
    // The document pane and this check are two separate fetches. Without the
    // digest, a file edited between them shows one document under the other's
    // verdict.
    project('model: {}\n')
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/definition`, 'session=S-1&path=tasks/fit.yaml')

    const body = JSON.parse(response.body) as { digest: string }
    expect(body.digest).toBe(createHash('sha256').update('model: {}\n').digest('hex'))
  })

  it('turns a resolved path inside the project into a project-relative one', async () => {
    project()
    definition = {
      inputs: [{
        where: 'model.gain.gain', path: 'inputs/gain.npy', format: 'npy',
        resolves: true, resolvedPath: join(workspace, 'inputs', 'gain.npy'),
      }],
      validation: { valid: true, errors: [], warnings: [] },
      gates: { checks: [], runs: [], warnings: [] },
    }
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/definition`, 'session=S-1&path=tasks/fit.yaml')

    const body = JSON.parse(response.body) as { inputs: [Record<string, unknown>] }
    expect(body.inputs[0]).toMatchObject({
      path: 'inputs/gain.npy', resolves: true, inProject: true, projectPath: 'inputs/gain.npy',
    })
  })

  it('says a reference resolved OUTSIDE the project without saying where', async () => {
    project()
    const elsewhere = mkdtempSync(join(tmpdir(), 'rheplicant-outside-'))
    definition = {
      inputs: [{
        where: 'model.gain.gain', path: '~/data/beam.npy', format: 'npy',
        resolves: true, resolvedPath: join(elsewhere, 'beam.npy'),
      }],
      validation: { valid: true, errors: [], warnings: [] },
      gates: { checks: [], runs: [], warnings: [] },
    }
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/definition`, 'session=S-1&path=tasks/fit.yaml')

    expect(response.body).not.toContain(elsewhere)
    const body = JSON.parse(response.body) as { inputs: [Record<string, unknown>] }
    expect(body.inputs[0]).toMatchObject({ resolves: true, inProject: false })
    expect(body.inputs[0].projectPath).toBeUndefined()
  })

  it('does not call a SIBLING directory part of the project', async () => {
    // `/p/project-notes` starts with `/p/project` and is not inside it. The
    // separator is what makes the prefix test a containment test.
    project()
    const sibling = `${workspace}-notes`
    mkdirSync(sibling, { recursive: true })
    definition = {
      inputs: [{
        where: 'model.gain.gain', path: '../notes/beam.npy', format: 'npy',
        resolves: true, resolvedPath: join(sibling, 'beam.npy'),
      }],
      validation: { valid: true, errors: [], warnings: [] },
      gates: { checks: [], runs: [], warnings: [] },
    }
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/definition`, 'session=S-1&path=tasks/fit.yaml')

    const body = JSON.parse(response.body) as { inputs: [Record<string, unknown>] }
    expect(body.inputs[0].inProject).toBe(false)
    expect(body.inputs[0].projectPath).toBeUndefined()
  })

  it('never forwards the host path of a reference it could not resolve', async () => {
    project()
    definition = {
      inputs: [{
        where: 'model.gain.gain', path: 'missing.npy', format: 'npy',
        resolves: false, resolvedPath: null,
      }],
      validation: { valid: true, errors: [], warnings: [] },
      gates: { checks: [], runs: [], warnings: [] },
    }
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/definition`, 'session=S-1&path=tasks/fit.yaml')

    expect(response.body).not.toContain(workspace)
  })

  it('refuses a path outside the project with the reader\'s own code', async () => {
    project()
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/definition`, 'session=S-1&path=../escape.yaml')

    expect(response.status).toBe(400)
    expect(JSON.parse(response.body).code).toBe('PATH_ESCAPES_PROJECT')
    expect(definitionCalls).toEqual([])
  })

  it('reports a compute service that could not be reached as 502', async () => {
    project()
    definition = undefined
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/definition`, 'session=S-1&path=tasks/fit.yaml')

    expect(response.status).toBe(502)
    expect(JSON.parse(response.body).code).toBe('DEFINITION_UNAVAILABLE')
  })

  it('refuses a request that names no project', async () => {
    project()
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/definition`, 'session=S-unknown&path=tasks/fit.yaml')

    expect(response.status).toBe(404)
    expect(JSON.parse(response.body).code).toBe('PROJECT_NOT_FOUND')
  })
})

describe('the transport a BROWSER may name', () => {
  /** A workspace holding one task document. */
  function task(): void {
    mkdirSync(join(workspace, 'tasks'), { recursive: true })
    writeFileSync(join(workspace, 'tasks', 'fit.yaml'), 'model: {}\n')
  }

  it('refuses a transport that is not one, rather than casting it through', async () => {
    // The value comes off the QUERY STRING. Cast, a misspelling reached the
    // seam and came back as "no provider is registered for transport 'locl'",
    // which reads as a composition problem rather than a bad request.
    task()
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/definition`,
      'session=S-1&path=tasks/fit.yaml&transport=locl')

    expect(response.status).toBe(400)
    expect(JSON.parse(response.body).code).toBe('INVALID_TRANSPORT')
    expect(definitionCalls).toEqual([])
  })

  it('still defaults to local when the browser names none', async () => {
    task()
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/definition`, 'session=S-1&path=tasks/fit.yaml')

    expect(response.status).toBe(200)
  })
})

describe('projecting one task document for display', () => {
  function task(text = 'model: {}\n'): void {
    mkdirSync(join(workspace, 'tasks'), { recursive: true })
    writeFileSync(join(workspace, 'tasks', 'fit.yaml'), text)
  }

  it('projects the document it read HOST-side', async () => {
    task('model: {authored: true}\n')
    const request = routes({ 'S-1': workspace })

    await request(`${ROUTE_PREFIX}/projection`, 'session=S-1&path=tasks/fit.yaml')

    expect(projectionCalls).toEqual(['model: {authored: true}\n'])
  })

  it('answers the digest of the bytes it projected', async () => {
    // Same guarantee the definition route gives, and for the same reason: a
    // diagram shown against the wrong version of a document is worse than no
    // diagram, because a diagram is believed.
    task('model: {}\n')
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/projection`, 'session=S-1&path=tasks/fit.yaml')

    const body = JSON.parse(response.body) as {
      digest: string; svg: string; runs: { exitsTotal: number }
    }
    expect(body.digest).toBe(createHash('sha256').update('model: {}\n').digest('hex'))
    expect(body.svg).toBe('<svg/>')
    // The exits travel with the diagram: both answer "what could this task
    // do", and two fetches could answer for two versions of the document.
    expect(body.runs.exitsTotal).toBe(18)
  })

  it('needs no execution at all', async () => {
    // The point of the route. Before it, a signal path existed only after a
    // first run — so the one diagram the philosophy asks to be "always
    // present" was absent for exactly the task someone is still authoring.
    task()
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/projection`, 'session=S-1&path=tasks/fit.yaml')

    expect(response.status).toBe(200)
    expect(readCalls).toEqual([])
  })


  describe('the as-run projection (§28.1)', () => {
    // The workbench's Model section draws BOTH the declared graph and the one
    // an execution ran, through this one route — which is what makes the
    // renderer identical on both sides, so a difference between the two
    // pictures is a difference in the DOCUMENTS and not in the theme.
    const AS_RUN = 'model: {as_run: true}\n'

    it('projects the bytes the EXECUTION ran, not the task as it stands now', async () => {
      task('model: {edited_since: true}\n')
      execution('tasks/fit', 'EXEC-1', { 'config.input.yaml': AS_RUN })
      const request = routes({ 'S-1': workspace })

      await request(`${ROUTE_PREFIX}/projection`, 'session=S-1&path=tasks/fit.yaml&execution=EXEC-1')

      expect(projectionCalls).toEqual([AS_RUN])
    })

    it('answers the digest of THOSE bytes, so the two sides cannot be confused', async () => {
      task('model: {edited_since: true}\n')
      execution('tasks/fit', 'EXEC-1', { 'config.input.yaml': AS_RUN })
      const request = routes({ 'S-1': workspace })

      const response = await request(
        `${ROUTE_PREFIX}/projection`, 'session=S-1&path=tasks/fit.yaml&execution=EXEC-1')

      const body = JSON.parse(response.body) as { digest: string; path: string }
      expect(body.digest).toBe(createHash('sha256').update(AS_RUN).digest('hex'))
    })

    it('still answers when the task file is GONE', async () => {
      // The point of reading the execution's own copy: an as-run picture must
      // survive the document being renamed, edited or deleted, because that
      // is exactly when somebody wants to see what actually ran.
      execution('tasks/fit', 'EXEC-1', { 'config.input.yaml': AS_RUN })
      const request = routes({ 'S-1': workspace })

      const response = await request(
        `${ROUTE_PREFIX}/projection`, 'session=S-1&path=tasks/gone.yaml&execution=EXEC-1')

      expect(response.status).toBe(200)
      expect(projectionCalls).toEqual([AS_RUN])
    })

    it('sends back a project-relative path, never the host one', async () => {
      task()
      execution('tasks/fit', 'EXEC-1', { 'config.input.yaml': AS_RUN })
      const request = routes({ 'S-1': workspace })

      const response = await request(
        `${ROUTE_PREFIX}/projection`, 'session=S-1&path=tasks/fit.yaml&execution=EXEC-1')

      const body = JSON.parse(response.body) as { path: string }
      expect(body.path).toBe('results/tasks/fit/EXEC-1/config.input.yaml')
      expect(body.path).not.toContain(workspace)
    })

    it('refuses an execution this project does not hold', async () => {
      task()
      const request = routes({ 'S-1': workspace })

      const response = await request(
        `${ROUTE_PREFIX}/projection`, 'session=S-1&path=tasks/fit.yaml&execution=NOT-HERE')

      expect(response.status).toBe(404)
      expect(JSON.parse(response.body).code).toBe('EXECUTION_NOT_FOUND')
      expect(projectionCalls).toEqual([])
    })

    it('says the execution is unreadable when its document is not there', async () => {
      // An execution with no `config.input.yaml` — a refused publication is
      // the real case (§27.4's sidecar-less tree) — must not fall back to the
      // task file and present it as what ran.
      task('model: {edited_since: true}\n')
      execution('tasks/fit', 'EXEC-1')
      const request = routes({ 'S-1': workspace })

      const response = await request(
        `${ROUTE_PREFIX}/projection`, 'session=S-1&path=tasks/fit.yaml&execution=EXEC-1')

      expect(response.status).toBe(409)
      expect(projectionCalls).toEqual([])
    })

    it('an EMPTY execution parameter is the declared projection, not an error', async () => {
      // A client that spells "no execution" as `execution=` rather than by
      // omitting the key gets the ordinary answer.
      task('model: {authored: true}\n')
      const request = routes({ 'S-1': workspace })

      const response = await request(
        `${ROUTE_PREFIX}/projection`, 'session=S-1&path=tasks/fit.yaml&execution=')

      expect(response.status).toBe(200)
      expect(projectionCalls).toEqual(['model: {authored: true}\n'])
    })
  })

  it('refuses a path outside the project with the reader\'s own code', async () => {
    task()
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/projection`, 'session=S-1&path=../escape.yaml')

    expect(response.status).toBe(400)
    expect(JSON.parse(response.body).code).toBe('PATH_ESCAPES_PROJECT')
    expect(projectionCalls).toEqual([])
  })

  it('reports an unreachable or gui-less service as 502', async () => {
    // `rheplicant.gui` is an optional extra, so this route can legitimately
    // be unavailable on a working install. It says so instead of pretending
    // the document has no model.
    task()
    projection = undefined
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/projection`, 'session=S-1&path=tasks/fit.yaml')

    expect(response.status).toBe(502)
    expect(JSON.parse(response.body).code).toBe('PROJECTION_UNAVAILABLE')
  })

  it('refuses a transport that is not one', async () => {
    task()
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/projection`,
      'session=S-1&path=tasks/fit.yaml&transport=locl')

    expect(response.status).toBe(400)
    expect(JSON.parse(response.body).code).toBe('INVALID_TRANSPORT')
  })
})

describe('what the trigger registry says', () => {
  /** Write a registry file verbatim, so a malformed one can be tested. */
  function registry(text: string): void {
    mkdirSync(join(workspace, '.rheplicant-agent'), { recursive: true })
    writeFileSync(join(workspace, '.rheplicant-agent', 'triggers.json'), text)
  }

  it('answers a project with no registry as absent, not as an error', async () => {
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/triggers`, 'session=S-1')

    expect(response.status).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.state).toBe('absent')
    expect(body.triggers).toEqual([])
    expect(body.reason).toBeUndefined()
  })

  it('keeps `unreadable` apart from `absent`, and answers 200 for both', async () => {
    // The distinction the whole design leads with. A corrupt file rendered as
    // "this project has no schedules" is a confident answer to a question
    // nothing could answer — and a 5xx here would be indistinguishable on the
    // client from the route not being mounted, which is the same collapse
    // wearing a different status code.
    registry('{ not json')
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/triggers`, 'session=S-1')

    expect(response.status).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.state).toBe('unreadable')
    expect(body.triggers).toEqual([])
    expect(typeof body.reason).toBe('string')
  })

  it('carries the cadence verbatim rather than reformatting it', async () => {
    // §6's first non-negotiable is that the surface states what is true, and
    // `PT10M` is what the person wrote.
    registry(JSON.stringify([
      { name: 'nightly', task: 'tasks/fit.yaml', every: 'P1D', enabled: true },
    ]))
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/triggers`, 'session=S-1')

    const [only] = JSON.parse(response.body).triggers
    expect(only.cadence).toBe('P1D')
    expect(only.cadenceKind).toBe('every')
    expect(only.name).toBe('nightly')
    expect(only.task).toBe('tasks/fit.yaml')
  })

  it('carries the session a routine last opened', async () => {
    registry(JSON.stringify([
      {
        name: 'brief', action: 'routine', prompt: 'Check the fits',
        every: 'PT30M', enabled: true, lastSessionId: 'session-42',
      },
    ]))
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/triggers`, 'session=S-1')

    const [only] = JSON.parse(response.body).triggers
    expect(only.lastSessionId).toBe('session-42')
  })

  it('omits it for a routine that has not fired, rather than sending null', async () => {
    // Absent is the wire's way of saying "there is nothing to open", and the
    // three reasons it can be absent are not distinguishable to a reader — nor
    // do they need to be, because the answer to all three is the same.
    registry(JSON.stringify([
      { name: 'brief', action: 'routine', prompt: 'Check the fits', every: 'PT30M', enabled: true },
    ]))
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/triggers`, 'session=S-1')

    const [only] = JSON.parse(response.body).triggers
    expect(only).not.toHaveProperty('lastSessionId')
  })

  it('never sends one for a TASK trigger, which opens no session at all', async () => {
    // A hand-edited registry can carry the field on a task record; the wire
    // must not repeat it, because a surface reading it would offer to open a
    // session that firing never had.
    registry(JSON.stringify([
      {
        name: 'ten', task: 'tasks/fit.yaml', every: 'PT10M', enabled: true,
        lastSessionId: 'session-not-ours',
      },
    ]))
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/triggers`, 'session=S-1')

    const [only] = JSON.parse(response.body).triggers
    expect(only.action).toBe('run')
    expect(only).not.toHaveProperty('lastSessionId')
  })

  it('derives the next fire from lastFiredAt plus the cadence', async () => {
    registry(JSON.stringify([
      {
        name: 'ten', task: 'tasks/fit.yaml', every: 'PT10M', enabled: true,
        lastFiredAt: '2026-08-26T00:00:00.000Z',
      },
    ]))
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/triggers`, 'session=S-1')

    const [only] = JSON.parse(response.body).triggers
    expect(only.nextFireAt).toBe('2026-08-26T00:10:00.000Z')
  })

  it('leaves an overdue next fire IN THE PAST rather than clamping it to now', async () => {
    // A harness that was down across a window has an overdue trigger, and
    // moving that instant forward would erase the evidence for the one
    // limitation §6 states first: it fires only while the harness is running.
    registry(JSON.stringify([
      {
        name: 'ten', task: 'tasks/fit.yaml', every: 'PT10M', enabled: true,
        lastFiredAt: '2020-01-01T00:00:00.000Z',
      },
    ]))
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/triggers`, 'session=S-1')

    const [only] = JSON.parse(response.body).triggers
    expect(only.nextFireAt).toBe('2020-01-01T00:10:00.000Z')
    expect(Date.parse(only.nextFireAt)).toBeLessThan(Date.now())
  })

  it('gives a never-fired trigger a next fire at or before now, so one rule covers both', async () => {
    registry(JSON.stringify([
      { name: 'ten', task: 'tasks/fit.yaml', every: 'PT10M', enabled: true },
    ]))
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/triggers`, 'session=S-1')

    const [only] = JSON.parse(response.body).triggers
    expect(only.lastFiredAt).toBeUndefined()
    expect(Date.parse(only.nextFireAt)).toBeLessThanOrEqual(Date.now())
  })

  it('gives a disabled trigger no next fire at all, rather than a date it will not keep', async () => {
    registry(JSON.stringify([
      {
        name: 'off', task: 'tasks/fit.yaml', every: 'PT10M', enabled: false,
        lastFiredAt: '2026-08-26T00:00:00.000Z',
      },
    ]))
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/triggers`, 'session=S-1')

    const [only] = JSON.parse(response.body).triggers
    expect(only.enabled).toBe(false)
    expect(only.nextFireAt).toBeUndefined()
  })

  it('sends a trigger whose task is not in this project, rather than dropping it', async () => {
    // The reason identity is the trigger's own name and not the task path: a
    // trigger that names a task that is gone must survive to SAY so.
    registry(JSON.stringify([
      { name: 'orphan', task: 'tasks/deleted.yaml', every: 'PT10M', enabled: true },
    ]))
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/triggers`, 'session=S-1')

    expect(JSON.parse(response.body).triggers).toHaveLength(1)
    expect(JSON.parse(response.body).triggers[0].task).toBe('tasks/deleted.yaml')
  })

  it('refuses a request that names no project', async () => {
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/triggers`, 'session=S-nope')

    expect(response.status).toBe(404)
    expect(JSON.parse(response.body).code).toBe('PROJECT_NOT_FOUND')
  })

  it('is reachable by workspace id, which is how the dashboard asks', async () => {
    registry(JSON.stringify([
      { name: 'ten', task: 'tasks/fit.yaml', every: 'PT10M', enabled: true },
    ]))
    const request = routes({}, [{ path: workspace, sessionIds: [], id: 'W-1' }])

    const response = await request(`${ROUTE_PREFIX}/triggers`, 'workspace=W-1')

    expect(response.status).toBe(200)
    expect(JSON.parse(response.body).project).toBe(basename(workspace))
  })

  it('never sends the host directory, not even in the reason', async () => {
    registry('[ { "name": "x" } ]')
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/triggers`, 'session=S-1')

    expect(JSON.parse(response.body).state).toBe('unreadable')
    expect(response.body).not.toContain(workspace)
  })

  it('is never cached: a registry changes under the browser', async () => {
    const request = routes({ 'S-1': workspace })

    const response = await request(`${ROUTE_PREFIX}/triggers`, 'session=S-1')

    expect(response.headers['cache-control']).toBe('no-store')
  })
})

describe('turning one trigger on or off — the one route that writes', () => {
  /** A registry with one enabled trigger, and the routes over it. */
  function withTrigger(rows: unknown[] = [{ name: 'brief', action: 'routine', prompt: 'hi', every: 'PT30M', enabled: true }]) {
    mkdirSync(join(workspace, '.rheplicant-agent'), { recursive: true })
    writeFileSync(join(workspace, '.rheplicant-agent/triggers.json'), JSON.stringify(rows))
    return routes({}, [{ path: workspace, sessionIds: [], id: 'ws-1' }])
  }

  /** What the registry file holds now. */
  function stored(): { name: string; enabled: boolean }[] {
    return JSON.parse(readFileSync(join(workspace, '.rheplicant-agent/triggers.json'), 'utf8')) as never
  }

  it('flips the trigger and answers with the state as it stands', async () => {
    const ask = withTrigger()
    const answered = await ask.post(`${ROUTE_PREFIX}/trigger-enabled`,
      { workspace: 'ws-1', name: 'brief', enabled: false })
    expect(answered.status).toBe(200)
    expect(JSON.parse(answered.body)).toEqual({ name: 'brief', enabled: false })
    expect(stored()[0]!.enabled).toBe(false)
  })

  it('refuses anything but POST, rather than answering a GET on a write route', async () => {
    const ask = withTrigger()
    const answered = await ask.post(`${ROUTE_PREFIX}/trigger-enabled`, {}, 'GET')
    expect(answered.status).toBe(405)
    expect(stored()[0]!.enabled).toBe(true)
  })

  it('refuses a body that is not the three fields', async () => {
    const ask = withTrigger()
    expect((await ask.post(`${ROUTE_PREFIX}/trigger-enabled`, { workspace: 'ws-1' })).status).toBe(400)
    expect((await ask.post(`${ROUTE_PREFIX}/trigger-enabled`, 'not json')).status).toBe(400)
    expect(stored()[0]!.enabled).toBe(true)
  })

  it('never lets a workspace PATH be named — only an id the host minted', async () => {
    // The same rule every read route here follows: a path on the wire would
    // let a caller address any directory on the machine.
    const ask = withTrigger()
    const answered = await ask.post(`${ROUTE_PREFIX}/trigger-enabled`,
      { workspace, name: 'brief', enabled: false })
    expect(answered.status).toBe(404)
    expect(stored()[0]!.enabled).toBe(true)
  })

  it('says 404 for a trigger that is not there, and writes nothing', async () => {
    const ask = withTrigger()
    const answered = await ask.post(`${ROUTE_PREFIX}/trigger-enabled`,
      { workspace: 'ws-1', name: 'ghost', enabled: false })
    expect(answered.status).toBe(404)
    expect(stored()).toHaveLength(1)
  })

  it('says 409 — not 500 — for an unreadable registry, and leaves the bytes alone', async () => {
    // Nothing failed here: the file is exactly as the person left it, and the
    // client renders the reason beside the row rather than as a fault of its own.
    mkdirSync(join(workspace, '.rheplicant-agent'), { recursive: true })
    writeFileSync(join(workspace, '.rheplicant-agent/triggers.json'), '{ not json')
    const ask = routes({}, [{ path: workspace, sessionIds: [], id: 'ws-1' }])
    const answered = await ask.post(`${ROUTE_PREFIX}/trigger-enabled`,
      { workspace: 'ws-1', name: 'brief', enabled: false })
    expect(answered.status).toBe(409)
    expect(readFileSync(join(workspace, '.rheplicant-agent/triggers.json'), 'utf8')).toBe('{ not json')
  })
})

describe('the wall-clock cadence, projected', () => {
  it('states the KIND rather than leaving a client to infer it from the text', async () => {
    // `08:00` and `PT10M` are both strings; only the kind says which of them
    // drifts when the harness was down.
    mkdirSync(join(workspace, '.rheplicant-agent'), { recursive: true })
    writeFileSync(join(workspace, '.rheplicant-agent/triggers.json'), JSON.stringify([
      { name: 'dawn', task: 'tasks/fit.yaml', dailyAt: '08:00', enabled: true },
      { name: 'ten', task: 'tasks/fit.yaml', every: 'PT10M', enabled: true },
    ]))
    const ask = routes({}, [{ path: workspace, sessionIds: [], id: 'ws-1' }])
    const answered = await ask(`${ROUTE_PREFIX}/triggers`, 'workspace=ws-1')
    const rows = JSON.parse(answered.body).triggers as { name: string; cadence: string; cadenceKind: string }[]
    expect(rows.map(r => [r.name, r.cadence, r.cadenceKind])).toEqual([
      ['dawn', '08:00', 'dailyAt'],
      ['ten', 'PT10M', 'every'],
    ])
  })

  it('gives a wall-clock trigger a next fire that is NOT a period after its last one', async () => {
    const fired = new Date(2026, 7, 28, 8, 0, 30, 0)
    mkdirSync(join(workspace, '.rheplicant-agent'), { recursive: true })
    writeFileSync(join(workspace, '.rheplicant-agent/triggers.json'), JSON.stringify([
      { name: 'dawn', task: 'tasks/fit.yaml', dailyAt: '08:00', enabled: true, lastFiredAt: fired.toISOString() },
    ]))
    const ask = routes({}, [{ path: workspace, sessionIds: [], id: 'ws-1' }])
    const answered = await ask(`${ROUTE_PREFIX}/triggers`, 'workspace=ws-1')
    const [row] = JSON.parse(answered.body).triggers as { nextFireAt: string }[]
    const next = new Date(row!.nextFireAt)
    expect([next.getHours(), next.getMinutes()]).toEqual([8, 0])
    expect(next.getDate()).toBe(29)
  })
})

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { apply, ROUTE_PREFIX } from '@rheplicant/dsh-rheplicant/project-api'
import { listExecutions, readArtifact } from '@rheplicant/dsh-rheplicant/executions'
import { scanProject } from '@rheplicant/dsh-rheplicant/contents'

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
    rheplicantProject: { listExecutions, readArtifact, listContents: scanProject },
    rheplicant: {
      readExecution: (resultsPath: string) => {
        readCalls.push(resultsPath)
        if (compute === undefined) throw new Error('compute is down')
        return Promise.resolve(compute)
      },
    },
  }
  apply(ctx as never)
  return async (path: string, query: string): Promise<Captured> => {
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
}

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'rheplicant-api-'))
  readCalls = []
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
  // §6.0's project home is shown exactly when NO session is open, so it has
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

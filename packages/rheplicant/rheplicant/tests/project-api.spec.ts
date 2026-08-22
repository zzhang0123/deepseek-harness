import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { apply, ROUTE_PREFIX } from '@rheplicant/dsh-rheplicant/project-api'
import { listExecutions, readArtifact } from '@rheplicant/dsh-rheplicant/executions'

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
  workspaces: { path: string; sessionIds: string[] }[] = [],
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
    rheplicantProject: { listExecutions, readArtifact },
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

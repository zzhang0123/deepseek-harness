import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchExecutionArtifact, fetchProjectOverview, fetchTaskDefinition,
} from '../src/client/project-overview-client.ts'

/** A complete, well-formed body, which each test then damages one way. */
function body(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    project: 'rhino-2026',
    tasks: [{ path: 'tasks/fit.yaml', bytes: 120, modifiedAt: '2026-08-22T12:00:00Z', executionCount: 2 }],
    inputs: [{ path: 'inputs/beam.npz', bytes: 4096, modifiedAt: '2026-08-22T12:00:00Z', extension: 'npz' }],
    executions: [{ executionId: 'E1', task: 'tasks/fit', status: 'ok', path: 'results/tasks/fit/E1/' }],
    truncated: false,
    ...over,
  }
}

/** Stand in for the host route with one response. */
function answer(status: number, payload: unknown): void {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  })))
}

beforeEach(() => { vi.unstubAllGlobals() })
afterEach(() => { vi.unstubAllGlobals() })

describe('what it sends', () => {
  it('names the workspace by id and never sends a path', async () => {
    answer(200, body())
    await fetchProjectOverview('ws-1')
    const [url] = (globalThis.fetch as unknown as { mock: { calls: [string][] } }).mock.calls[0]!
    expect(url).toBe('/rheplicant/project/overview?workspace=ws-1')
  })

  it('encodes an id rather than splicing it into the query raw', async () => {
    answer(200, body())
    await fetchProjectOverview('ws 1&session=other')
    const [url] = (globalThis.fetch as unknown as { mock: { calls: [string][] } }).mock.calls[0]!
    expect(url).toBe('/rheplicant/project/overview?workspace=ws%201%26session%3Dother')
  })
})

describe('a body it can use', () => {
  it('decodes tasks, inputs and executions', async () => {
    answer(200, body())
    const found = await fetchProjectOverview('ws-1')
    expect(found).toMatchObject({
      project: 'rhino-2026',
      truncated: false,
    })
    expect(found?.tasks).toHaveLength(1)
    expect(found?.inputs).toHaveLength(1)
    expect(found?.executions).toHaveLength(1)
  })

  it('drops a row it cannot read rather than the whole listing', async () => {
    answer(200, body({
      tasks: [
        { path: 'good.yaml', bytes: 1, modifiedAt: 'x', executionCount: 0 },
        { nonsense: true },
      ],
    }))
    const found = await fetchProjectOverview('ws-1')
    expect(found?.tasks.map(task => task.path)).toEqual(['good.yaml'])
  })

  it('carries a truncation flag through rather than smoothing it away', async () => {
    answer(200, body({ truncated: true }))
    expect((await fetchProjectOverview('ws-1'))?.truncated).toBe(true)
  })

  it('treats a missing truncation flag as false, but only because the host always sends it', async () => {
    const partial = body()
    delete partial.truncated
    answer(200, partial)
    expect((await fetchProjectOverview('ws-1'))?.truncated).toBe(false)
  })
})

describe('a project it cannot read', () => {
  it.each([404, 409, 500])('answers undefined for %i, never an empty project', async (status) => {
    answer(status, { error: 'nope' })
    expect(await fetchProjectOverview('ws-1')).toBeUndefined()
  })

  it('answers undefined when the route is not there at all', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no server'))))
    expect(await fetchProjectOverview('ws-1')).toBeUndefined()
  })

  it('answers undefined for a body that is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true, status: 200, json: () => Promise.reject(new Error('not json')),
    })))
    expect(await fetchProjectOverview('ws-1')).toBeUndefined()
  })

  it.each([
    ['tasks', { tasks: 'not an array' }],
    ['inputs', { inputs: null }],
    ['executions', { executions: 7 }],
  ])('answers undefined when %s is not a list', async (_name, damage) => {
    answer(200, body(damage))
    expect(await fetchProjectOverview('ws-1')).toBeUndefined()
  })
})

describe('asking whether one task is defined', () => {
  /** A complete definition body, which each test then damages one way. */
  function definition(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      path: 'tasks/fit.yaml',
      digest: 'abc123',
      inputs: [{
        where: 'model.gain.gain', path: 'inputs/gain.npy', format: 'npy',
        resolves: true, inProject: true, projectPath: 'inputs/gain.npy',
      }],
      validation: { valid: true, errors: [], warnings: [] },
      gates: { checks: [], runs: [], warnings: [] },
      ...over,
    }
  }

  it('names the workspace and the task, both encoded', async () => {
    answer(200, definition())
    await fetchTaskDefinition('ws 1', 'tasks/a b.yaml')
    const [url] = (globalThis.fetch as unknown as { mock: { calls: [string][] } }).mock.calls[0]!
    expect(url).toBe('/rheplicant/project/definition?workspace=ws%201&path=tasks%2Fa%20b.yaml')
  })

  it('decodes a well-formed answer', async () => {
    answer(200, definition())
    const found = await fetchTaskDefinition('ws-1', 'tasks/fit.yaml')
    expect(found).toMatchObject({ digest: 'abc123' })
  })

  it('reports a refused path differently from an unreachable route', async () => {
    // "The path is wrong" and "we could not ask" send someone to different
    // places, so the caller gets to tell them apart.
    answer(400, { code: 'PATH_ESCAPES_PROJECT' })
    expect(await fetchTaskDefinition('ws-1', '../escape.yaml')).toBe('refused')
    answer(502, { code: 'DEFINITION_UNAVAILABLE' })
    expect(await fetchTaskDefinition('ws-1', 'tasks/fit.yaml')).toBeUndefined()
  })

  it('refuses a body missing the digest rather than trusting a verdict it cannot date', async () => {
    // Without the digest there is no way to know which document the verdict
    // describes, which is the one thing §12.6 exists to prevent.
    answer(200, definition({ digest: undefined }))
    expect(await fetchTaskDefinition('ws-1', 'tasks/fit.yaml')).toBeUndefined()
  })

  it('refuses a body whose inputs are not a list', async () => {
    answer(200, definition({ inputs: 'lots' }))
    expect(await fetchTaskDefinition('ws-1', 'tasks/fit.yaml')).toBeUndefined()
  })
})

describe('reading one execution artifact', () => {
  /** Stand in for the artifact route, which answers BYTES rather than JSON. */
  function serveText(status: number, body: string): void {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(body),
    })))
  }

  it('asks by execution id and artifact name, both encoded', async () => {
    serveText(200, 'a: 1\n')
    await fetchExecutionArtifact('ws 1', 'E 1', 'config.input.yaml')
    const [url] = (globalThis.fetch as unknown as { mock: { calls: [string][] } }).mock.calls[0]!
    expect(url).toBe(
      '/rheplicant/project/artifact?workspace=ws%201&execution=E%201&name=config.input.yaml',
    )
  })

  it('returns the bytes as text', async () => {
    serveText(200, 'schema_version: 1\n')
    expect(await fetchExecutionArtifact('ws-1', 'E1', 'config.input.yaml'))
      .toEqual({ ok: true, text: 'schema_version: 1\n' })
  })

  it('tells a gone execution apart from an unreachable route', async () => {
    // The same three-way answer every other reader here gives, for the same
    // reason: "pruned" and "we could not ask" want different things done.
    serveText(404, '{}')
    expect(await fetchExecutionArtifact('ws-1', 'E1', 'config.input.yaml'))
      .toEqual({ ok: false, reason: 'unreadable' })
    serveText(409, '{}')
    expect(await fetchExecutionArtifact('ws-1', 'E1', 'config.input.yaml'))
      .toEqual({ ok: false, reason: 'unreadable' })
    serveText(500, '{}')
    expect(await fetchExecutionArtifact('ws-1', 'E1', 'config.input.yaml'))
      .toEqual({ ok: false, reason: 'unreachable' })
  })

  it('tags the result, so a reason can never be read as the file\'s text', () => {
    // The failure that produced this shape: the payload here is a STRING, so
    // the sentinel convention the sibling readers use (safe beside an object
    // payload) let the word "unreadable" be rendered as the document and
    // diffed against the real one. A tag makes that unrepresentable.
    const answer: Awaited<ReturnType<typeof fetchExecutionArtifact>> =
      { ok: false, reason: 'unreadable' }
    // @ts-expect-error `text` does not exist on the failure arm — the point.
    expect(answer.text).toBeUndefined()
  })
})

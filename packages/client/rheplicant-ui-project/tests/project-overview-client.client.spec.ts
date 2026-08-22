import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchProjectOverview } from '../src/client/project-overview-client.ts'

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

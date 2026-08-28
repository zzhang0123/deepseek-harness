import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchExecutionArtifact, fetchProjectOverview, fetchProjectTriggers, fetchTaskDefinition,
  setTriggerEnabled,
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

describe('reading one project\'s trigger registry', () => {
  /** A well-formed registry answer, which each test then damages one way. */
  function triggers(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      project: 'rhino-2026',
      state: 'ok',
      triggers: [{
        name: 'nightly', action: 'run', task: 'tasks/fit.yaml', cadence: 'P1D', cadenceKind: 'every',
        enabled: true, nextFireAt: '2026-08-27T00:00:00.000Z',
      }],
      ...over,
    }
  }

  it('names the workspace by id and never sends a path', async () => {
    answer(200, triggers())
    await fetchProjectTriggers('ws-1')
    const [url] = (globalThis.fetch as unknown as { mock: { calls: [string][] } }).mock.calls[0]!
    expect(url).toBe('/rheplicant/project/triggers?workspace=ws-1')
  })

  it('decodes the registry with its cadence and next fire intact', async () => {
    answer(200, triggers())
    const found = await fetchProjectTriggers('ws-1')
    expect(found?.state).toBe('ok')
    expect(found?.triggers[0]).toMatchObject({ name: 'nightly', cadence: 'P1D', cadenceKind: 'every' })
  })

  it('keeps `absent` and `unreadable` apart, with the reason', async () => {
    answer(200, triggers({ state: 'absent', triggers: [] }))
    expect(await fetchProjectTriggers('ws-1')).toMatchObject({ state: 'absent' })

    answer(200, triggers({ state: 'unreadable', triggers: [], reason: 'the file is not valid JSON' }))
    expect(await fetchProjectTriggers('ws-1')).toMatchObject({
      state: 'unreadable', reason: 'the file is not valid JSON',
    })
  })

  it('supplies a reason when the host reported none, so the state is never bare', async () => {
    answer(200, triggers({ state: 'unreadable', triggers: [] }))
    expect(await fetchProjectTriggers('ws-1')).toMatchObject({ reason: 'the host did not say why' })
  })

  it('makes the WHOLE answer unreadable when one row cannot be read', async () => {
    // Deliberately unlike `fetchProjectOverview`, which drops an unreadable
    // task. One missing task is a shorter listing; one missing trigger is a
    // schedule silently doing less than the person asked for.
    answer(200, triggers({
      triggers: [
        { name: 'nightly', action: 'run', task: 'tasks/fit.yaml', cadence: 'P1D', cadenceKind: 'every', enabled: true },
        { name: 'broken' },
      ],
    }))
    const found = await fetchProjectTriggers('ws-1')
    expect(found?.state).toBe('unreadable')
    expect(found?.triggers).toEqual([])
  })

  it('reads a ROUTINE row, which carries a prompt where a run carries a task', async () => {
    answer(200, triggers({
      triggers: [{ name: 'brief', action: 'routine', prompt: 'Check the fits', cadence: 'PT30M', cadenceKind: 'every', enabled: true }],
    }))
    const found = await fetchProjectTriggers('ws-1')
    expect(found?.state).toBe('ok')
    expect(found?.triggers[0]).toMatchObject({ action: 'routine', prompt: 'Check the fits' })
  })

  it('reads the session a routine last opened, when the host sends one', async () => {
    answer(200, triggers({
      triggers: [{
        name: 'brief', action: 'routine', prompt: 'Check the fits',
        cadence: 'PT30M', cadenceKind: 'every', enabled: true, lastSessionId: 'session-42',
      }],
    }))
    const found = await fetchProjectTriggers('ws-1')
    expect(found?.state).toBe('ok')
    expect(found?.triggers[0]).toMatchObject({ lastSessionId: 'session-42' })
  })

  it('accepts a row without one — absent is the ordinary case, not a defect', async () => {
    // A task trigger opens no session; a routine that has not fired has none
    // yet; a composition with no agent never will. Requiring the field would
    // refuse every registry that has not run.
    answer(200, triggers({
      triggers: [{ name: 'brief', action: 'routine', prompt: 'x', cadence: 'PT30M', cadenceKind: 'every', enabled: true }],
    }))
    expect((await fetchProjectTriggers('ws-1'))?.state).toBe('ok')
  })

  it('REFUSES a row whose session id is not a string', async () => {
    // The value is handed straight to the host's `sessions.open`, so a number
    // here is a host this build does not understand — and one bad row makes the
    // whole answer unreadable rather than a shorter list.
    answer(200, triggers({
      triggers: [{
        name: 'brief', action: 'routine', prompt: 'x',
        cadence: 'PT30M', cadenceKind: 'every', enabled: true, lastSessionId: 7,
      }],
    }))
    const found = await fetchProjectTriggers('ws-1')
    expect(found?.state).toBe('unreadable')
    expect(found?.triggers).toEqual([])
  })

  it('REFUSES a row with no action, rather than guessing which kind it is', async () => {
    // The registry FILE may omit `action` — that default exists so registries
    // written before routines keep working without a migration. The wire has no
    // files to migrate, so the host always states it, and guessing here would
    // render a routine as a task run. Measured in a real boot 2026-08-27: this
    // is the shape that made the dashboard say "the host sent a trigger this
    // build cannot read", which was the check working.
    answer(200, triggers({
      triggers: [{ name: 'nightly', task: 'tasks/fit.yaml', cadence: 'P1D', cadenceKind: 'every', enabled: true }],
    }))
    expect(await fetchProjectTriggers('ws-1')).toMatchObject({ state: 'unreadable' })
  })

  it('refuses an action this build does not know, for the same reason as a state', async () => {
    answer(200, triggers({
      triggers: [{ name: 'x', action: 'deploy', task: 't.yaml', cadence: 'P1D', cadenceKind: 'every', enabled: true }],
    }))
    expect(await fetchProjectTriggers('ws-1')).toMatchObject({ state: 'unreadable' })
  })

  it('refuses a routine with no prompt and a run with no task', async () => {
    answer(200, triggers({ triggers: [{ name: 'x', action: 'routine', cadence: 'PT30M', cadenceKind: 'every', enabled: true }] }))
    expect(await fetchProjectTriggers('ws-1')).toMatchObject({ state: 'unreadable' })
    answer(200, triggers({ triggers: [{ name: 'x', action: 'run', cadence: 'P1D', cadenceKind: 'every', enabled: true }] }))
    expect(await fetchProjectTriggers('ws-1')).toMatchObject({ state: 'unreadable' })
  })

  it('answers undefined for a state this build does not know', async () => {
    // Not "absent": every other answer here is a claim about what will fire,
    // and this build cannot make one about a word it has never seen.
    answer(200, triggers({ state: 'paused' }))
    expect(await fetchProjectTriggers('ws-1')).toBeUndefined()
  })

  it('answers undefined when the route is not there to ask', async () => {
    answer(404, { error: 'unknown project' })
    expect(await fetchProjectTriggers('ws-1')).toBeUndefined()
  })

  it('answers undefined rather than throwing when the fetch itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    expect(await fetchProjectTriggers('ws-1')).toBeUndefined()
  })
})

describe('turning one trigger on or off — the only write this client makes', () => {
  it('POSTs the project, the name and the state', async () => {
    answer(200, { name: 'brief', enabled: false })
    await setTriggerEnabled('ws-1', 'brief', false)
    const [url, init] = (globalThis.fetch as unknown as {
      mock: { calls: [string, { method: string; body: string }][] }
    }).mock.calls[0]!
    expect(url).toBe('/rheplicant/project/trigger-enabled')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ workspace: 'ws-1', name: 'brief', enabled: false })
  })

  it('answers with the state as it now STANDS, not with what was asked', async () => {
    // The host re-reads before writing, so a toggle landing on a registry
    // someone else just edited comes back with the truth.
    answer(200, { name: 'brief', enabled: true })
    expect(await setTriggerEnabled('ws-1', 'brief', false)).toEqual({ ok: true, enabled: true })
  })

  it('carries the host\'s sentence through on a refusal, rather than a code', async () => {
    // The board renders this beside the row that failed, and there is nothing
    // useful a person does with `registry_unreadable` that they do not do with
    // the reason itself.
    answer(409, { error: 'the registry cannot be read — the file is not valid JSON', code: 'registry_unreadable' })
    expect(await setTriggerEnabled('ws-1', 'brief', false)).toEqual({
      ok: false, reason: 'the registry cannot be read — the file is not valid JSON',
    })
  })

  it('supplies a sentence when the host sent none, so the switch is never bare', async () => {
    answer(404, {})
    expect(await setTriggerEnabled('ws-1', 'ghost', false)).toMatchObject({ ok: false })
  })

  it('reports a network failure rather than silently doing nothing', async () => {
    // A swallowed failure leaves the switch showing a state nothing confirmed.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    expect(await setTriggerEnabled('ws-1', 'brief', false)).toMatchObject({ ok: false })
  })

  it('refuses a 200 whose shape it does not recognise', async () => {
    // Assuming success would settle the switch into a state nothing confirmed —
    // the same rule the registry decoder applies to an unknown `state`.
    answer(200, { name: 'brief' })
    expect(await setTriggerEnabled('ws-1', 'brief', false)).toMatchObject({ ok: false })
  })
})

describe('the wall-clock cadence on the wire', () => {
  it('reads a dailyAt row and keeps its kind', async () => {
    answer(200, {
      project: 'p', state: 'ok',
      triggers: [{ name: 'dawn', action: 'run', task: 't.yaml', cadence: '08:00', cadenceKind: 'dailyAt', enabled: true }],
    })
    const found = await fetchProjectTriggers('ws-1')
    expect(found?.triggers[0]).toMatchObject({ cadence: '08:00', cadenceKind: 'dailyAt' })
  })

  it('REFUSES a row with no cadenceKind, rather than guessing which it is', async () => {
    // The two kinds differ in whether they DRIFT, which is the property a
    // person picks between. Guessing would render a wall clock as an interval.
    answer(200, {
      project: 'p', state: 'ok',
      triggers: [{ name: 'dawn', action: 'run', task: 't.yaml', cadence: '08:00', enabled: true }],
    })
    expect(await fetchProjectTriggers('ws-1')).toMatchObject({ state: 'unreadable' })
  })

  it('refuses a cadenceKind this build does not know', async () => {
    answer(200, {
      project: 'p', state: 'ok',
      triggers: [{ name: 'x', action: 'run', task: 't.yaml', cadence: '* * * * *', cadenceKind: 'cron', enabled: true }],
    })
    expect(await fetchProjectTriggers('ws-1')).toMatchObject({ state: 'unreadable' })
  })
})

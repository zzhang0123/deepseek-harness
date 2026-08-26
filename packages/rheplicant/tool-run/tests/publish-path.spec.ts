/**
 * The guard that did not exist.
 *
 * `publish.ts`'s module comment said the tool's publish sequence was guarded by
 * `integration-tests/{emit,assembled}.spec.ts`. Measured 2026-08-26: **both of
 * those drive the inline `document:` branch**, which publishes nothing at all —
 * so the `task:` sequence, the one a convergence onto `publishTaskRun` would
 * change, had no coverage anywhere in either repository.
 *
 * This is that coverage: the whole sequence a task run performs, against a fake
 * compute seam and a real temporary project. No Python, no network, so it runs
 * in the ordinary suite rather than in the integration set that needs a live
 * service.
 *
 * What it pins is the OBSERVABLE sequence — where the tree is asked to land,
 * what the sidecar says, what the durable event carries, what the model is
 * told — rather than the shape of the code that produces it. That is what makes
 * it a guard for a refactor instead of a copy of one.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { apply } from '@rheplicant/dsh-rheplicant-tool-run'
import { SIDECAR_NAME } from '@rheplicant/dsh-rheplicant/project'

/** The document bytes every task file in this spec holds. */
const TASK_TEXT = 'schema_version: 1\nruns:\n  - name: sim\n    kind: forward\n'

let workspace: string
/** Every `rheplicant.run` call the tool made, in order. */
let runs: { input: Record<string, unknown>; opts: Record<string, unknown> }[]
/** What the fake seam answers. */
let outcome: Record<string, unknown>
/** Durable events the tool appended: `[type, data, opts]`. */
let appended: [string, Record<string, unknown>, unknown][]

/**
 * A fresh project that looks like a git working tree, holding one task.
 *
 * The directory is CANONICALISED, because that is the shape production has: a
 * session's `cwd` arrives already resolved. `mkdtemp` does not — on macOS it
 * answers `/var/folders/…` for a directory that really lives at
 * `/private/var/folders/…` — and the difference is not cosmetic here. See the
 * non-canonical case below, which pins what happens when the two spellings meet.
 */
function project(): void {
  workspace = realpathSync(mkdtempSync(join(tmpdir(), 'rheplicant-publish-')))
  mkdirSync(join(workspace, '.git'), { recursive: true })
  mkdirSync(join(workspace, 'tasks'), { recursive: true })
  writeFileSync(join(workspace, 'tasks', 'fit.yaml'), TASK_TEXT, 'utf8')
}

/** sha256 of the task bytes — what `taskDigest` must equal. */
function digest(): string {
  return createHash('sha256').update(TASK_TEXT).digest('hex')
}

/** The registered tool, over a fake context and a fake compute seam. */
function tool(jobs?: { start: (spec: Record<string, unknown>) => string }): {
  call: (args: Record<string, unknown>, withAgent?: boolean) => Promise<Record<string, unknown>>
} {
  let defined: { execute: (args: unknown, exec: unknown) => Promise<Record<string, unknown>> } | undefined
  const ctx = {
    tools: { register: (definition: unknown) => { defined = definition as never } },
    rheplicant: {
      run: (input: Record<string, unknown>, opts: Record<string, unknown>) => {
        runs.push({ input, opts })
        // The service writes its own tree; the sidecar lands beside it.
        const at = opts.outputsDir
        if (typeof at === 'string') mkdirSync(at, { recursive: true })
        return Promise.resolve(outcome)
      },
    },
    get: (name: string) => (name === 'jobs' ? jobs : undefined),
  } as never
  apply(ctx, { defaultTransport: 'local' })
  if (defined === undefined) throw new Error('the plugin registered no tool')
  const registered = defined
  return {
    call: (args, withAgent = true) => registered.execute(args, {
      signal: new AbortController().signal,
      ...(withAgent
        ? {
            agent: {
              session: {
                header: { cwd: workspace, id: 'S-1' },
                append: (type: string, data: Record<string, unknown>, opts: unknown) => {
                  appended.push([type, data, opts])
                },
              },
            },
          }
        : {}),
    }),
  }
}

/** The one published tree under `results/`, or undefined when nothing published. */
function publishedAt(): string | undefined {
  const at = runs[0]?.opts.outputsDir
  return typeof at === 'string' ? at : undefined
}

/** The sidecar the run left, parsed. */
function sidecar(directory: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(directory, SIDECAR_NAME), 'utf8')) as Record<string, unknown>
}

beforeEach(() => {
  project()
  runs = []
  appended = []
  outcome = { runs: [{ name: 'sim', kind: 'forward', status: 'ok' }], gates: [] }
})

describe('where a task run publishes', () => {
  it('lands under results/<task segment>/<execution id>', async () => {
    const { call } = tool()
    const result = await call({ task: 'tasks/fit.yaml' })

    const at = publishedAt()
    expect(at).toBeDefined()
    expect(at).toContain(join('results', 'tasks', 'fit'))
    // The directory is named by the SAME id the model is told about, which is
    // the whole of how a transcript line finds its tree again.
    expect(at?.endsWith(String(result.executionId))).toBe(true)
  })

  it('mints an id whose digest half is the AUTHORED document', async () => {
    const { call } = tool()
    const result = await call({ task: 'tasks/fit.yaml' })

    expect(result.taskDigest).toBe(digest())
    expect(String(result.executionId)).toContain(digest().slice(0, 8))
  })

  it('carries the WORKSPACE-RELATIVE task path back, never the host path', async () => {
    const { call } = tool()
    const result = await call({ task: 'tasks/fit.yaml' })

    expect(result.taskPath).toBe('tasks/fit.yaml')
  })

  it('sends the file BYTES to the seam, not a parsed document', async () => {
    // The digest describes exact bytes, so the bytes must reach the service
    // unparsed — a second parser here would be a second owner of the grammar.
    const { call } = tool()
    await call({ task: 'tasks/fit.yaml' })

    expect(runs[0]?.input.documentText).toBe(TASK_TEXT)
    expect(runs[0]?.input.document).toBeUndefined()
  })

  it('publishes NOTHING for an inline document, which has no task file', async () => {
    const { call } = tool()
    await call({ document: { schema_version: 1 } })

    expect(runs[0]?.opts.outputsDir).toBeUndefined()
    expect(existsSync(join(workspace, 'results'))).toBe(false)
  })
})

describe('what the sidecar records', () => {
  it('describes the execution, the document it ran, and the conversation', async () => {
    const { call } = tool()
    const result = await call({ task: 'tasks/fit.yaml' })

    const facts = sidecar(publishedAt() as string)
    expect(facts).toMatchObject({
      executionId: result.executionId,
      task: join('tasks', 'fit'),
      taskDigest: digest(),
      transport: 'local',
      sessionId: 'S-1',
    })
    expect(typeof facts.startedAt).toBe('string')
    expect(typeof facts.finishedAt).toBe('string')
  })

  it('cannot be reached without a session at all, which is why the seam takes a workspace', async () => {
    // A TOOL call always has a conversation, and a task path is only ever
    // resolved inside that conversation's own directory — there is no
    // `process.cwd()` fallback. So the session-free execution the trigger loop
    // produces is unreachable from here by construction, and
    // `publishTaskRun` taking the workspace as an argument is not an
    // over-generalisation: it is the only way that case can exist.
    const { call } = tool()
    await expect(call({ task: 'tasks/fit.yaml' }, false))
      .rejects.toThrow(/no working directory/)
  })

  it('takes `kinds` off the OUTCOME, so a partial run is described as partial', async () => {
    // The document declared one run; this outcome reports two. The sidecar
    // describes what HAPPENED, not what was asked for.
    outcome = {
      runs: [
        { name: 'sim', kind: 'forward', status: 'ok' },
        { name: 'fit', kind: 'nuts', status: 'ok' },
      ],
      gates: [],
    }
    const { call } = tool()
    await call({ task: 'tasks/fit.yaml' })

    expect(sidecar(publishedAt() as string).kinds).toEqual(['forward', 'nuts'])
  })

  it('keeps repeats rather than deduping them', async () => {
    outcome = {
      runs: [
        { name: 'a', kind: 'forward', status: 'ok' },
        { name: 'b', kind: 'forward', status: 'ok' },
      ],
      gates: [],
    }
    const { call } = tool()
    await call({ task: 'tasks/fit.yaml' })

    expect(sidecar(publishedAt() as string).kinds).toEqual(['forward', 'forward'])
  })

  it('omits `kinds` when nothing ran, rather than writing an empty list', async () => {
    outcome = { runs: [], gates: [] }
    const { call } = tool()
    await call({ task: 'tasks/fit.yaml' })

    expect(sidecar(publishedAt() as string).kinds).toBeUndefined()
  })

  it('follows the outcome to the SIBLING directory a refused run actually wrote', async () => {
    // A refused or errored run publishes beside the directory that was asked
    // for, and the sidecar must land in the tree that exists.
    const { call } = tool()
    await call({ task: 'tasks/fit.yaml' })
    const asked = publishedAt() as string
    const elsewhere = `${asked}-refused`

    runs = []
    appended = []
    mkdirSync(elsewhere, { recursive: true })
    outcome = { runs: [], gates: [], resultsPath: elsewhere }
    const second = tool()
    await second.call({ task: 'tasks/fit.yaml' })

    expect(existsSync(join(elsewhere, SIDECAR_NAME))).toBe(true)
  })
})

describe('the managed .gitignore', () => {
  it('is written BEFORE the first tree lands, and announced once', async () => {
    const { call } = tool()
    const result = await call({ task: 'tasks/fit.yaml' })

    expect(result.gitignoreWritten).toBe(join(workspace, '.gitignore'))
    const body = readFileSync(join(workspace, '.gitignore'), 'utf8')
    expect(body).toContain('/results/')
  })

  it('is not announced again on the next run', async () => {
    const { call } = tool()
    await call({ task: 'tasks/fit.yaml' })
    runs = []
    const second = await call({ task: 'tasks/fit.yaml' })

    expect(second.gitignoreWritten).toBeUndefined()
  })

  it('is never written for an inline document, which publishes nothing', async () => {
    const { call } = tool()
    await call({ document: { schema_version: 1 } })

    expect(existsSync(join(workspace, '.gitignore'))).toBe(false)
  })
})

describe('the durable event', () => {
  it('is appended once, carrying the execution identity', async () => {
    const { call } = tool()
    const result = await call({ task: 'tasks/fit.yaml' })

    expect(appended).toHaveLength(1)
    const [type, data, opts] = appended[0] as [string, Record<string, unknown>, { ignorable?: boolean }]
    expect(type).toBe('rheplicant/run')
    expect(data).toMatchObject({
      transport: 'local',
      executionId: result.executionId,
      taskDigest: digest(),
      taskPath: 'tasks/fit.yaml',
    })
    // Purely informational downstream: a reader may skip it without corrupting
    // the model conversation.
    expect(opts.ignorable).toBe(true)
  })

  it('takes the document from the service echo, because a task call holds only bytes', async () => {
    // Parsing YAML in the tool would put a second owner on the grammar.
    outcome = { runs: [], gates: [], document: { schema_version: 1, echoed: true } }
    const { call } = tool()
    await call({ task: 'tasks/fit.yaml' })

    expect(appended[0]?.[1].document).toMatchObject({ echoed: true })
  })

  it('records an empty mapping when the service echoed nothing', async () => {
    // "No document recorded" is true, and reads that way on screen.
    const { call } = tool()
    await call({ task: 'tasks/fit.yaml' })

    expect(appended[0]?.[1].document).toEqual({})
  })

  it('is not appended at all when no agent owns the call', async () => {
    // Code Mode: an inline run with no conversation to anchor the event to.
    // The `task:` form cannot reach here — it needs a session directory to
    // resolve the path against — so the inline form is the only way to observe
    // this branch.
    const { call } = tool()
    await call({ document: { schema_version: 1 } }, false)

    expect(appended).toEqual([])
  })
})

describe('the background form', () => {
  it('promises the execution id before the run starts, and publishes under it', async () => {
    // The contract that forced `PublishRequest.executionId` to exist: the id is
    // returned the moment the job is dispatched, so it must be minted first.
    let started: (() => { done: Promise<unknown> }) | undefined
    const { call } = tool({
      start: (spec: Record<string, unknown>) => {
        started = spec.run as never
        return 'JOB-1'
      },
    })

    const result = await call({ task: 'tasks/fit.yaml', run_in_background: true })
    expect(result).toMatchObject({ jobId: 'JOB-1' })
    expect(typeof result.executionId).toBe('string')

    // Nothing has run yet — the id was promised, not observed.
    expect(runs).toEqual([])

    await started?.().done
    expect(publishedAt()?.endsWith(String(result.executionId))).toBe(true)
    expect(sidecar(publishedAt() as string).executionId).toBe(result.executionId)
    expect(appended).toHaveLength(1)
  })

  it('refuses when no jobs service is mounted, rather than running in the foreground', async () => {
    const { call } = tool()
    await expect(call({ task: 'tasks/fit.yaml', run_in_background: true }))
      .rejects.toThrow(/background jobs are unavailable/)
  })
})

describe('what the model is told', () => {
  it('gets the outcome, the identity, and nothing about host paths', async () => {
    const { call } = tool()
    const result = await call({ task: 'tasks/fit.yaml' })

    expect(result).toMatchObject({ taskPath: 'tasks/fit.yaml', taskDigest: digest() })
    expect(JSON.stringify(result)).not.toContain(join(workspace, 'results'))
  })

  it('refuses a transport that is not one, before reaching the seam', async () => {
    const { call } = tool()
    await expect(call({ task: 'tasks/fit.yaml', transport: 'locl' }))
      .rejects.toThrow(/not a rheplicant transport/)
    expect(runs).toEqual([])
  })

  it('refuses both `task` and `document` in one call', async () => {
    const { call } = tool()
    await expect(call({ task: 'tasks/fit.yaml', document: { schema_version: 1 } }))
      .rejects.toThrow(/exactly one/)
  })

  it('refuses a task path that escapes the project', async () => {
    const { call } = tool()
    await expect(call({ task: '../escape.yaml' })).rejects.toThrow(/outside the session directory/)
    expect(runs).toEqual([])
  })
})

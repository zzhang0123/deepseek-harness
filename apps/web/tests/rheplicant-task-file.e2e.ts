// Web e2e scenario: `rheplicant_run(task: …)` on the booted web composition.
// A task is a FILE (`docs/project-model.md` §4.3), so this pins the host half
// of that contract end to end: the file is resolved against the SESSION's own
// working directory, its exact bytes travel unparsed as `documentText`, the
// call earns an `ExecutionId` and a `taskDigest`, and the durable
// `rheplicant/run` event carries both — while a path that escapes the session
// directory, lexically or through a symlink, is refused.
//
// No browser and no model call. The compute half is a stub provider rather
// than the real Python service: this lane must not depend on a machine-local
// interpreter with rheplicant installed, and the Python half of the contract
// (documentText parses, and answers the same as the equivalent inline
// document) is pinned by rheplicant-agent's own
// `python/tests/test_document_input.py`. What a stub cannot fake is exactly
// what this scenario is about — which bytes reached the seam, and which paths
// were refused before they ever got there.
import { createHash } from 'node:crypto'
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { CallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { ComputeRuntime } from '@rheplicant/dsh-rheplicant'
import type {
  DefinitionReport,
  ComputeInput, ComputeProvider, GatesReport, RunOutcome, SchemaDocument, SignalPathGraph, ValidationReport,
} from '@rheplicant/dsh-rheplicant'
import * as toolRun from '@rheplicant/dsh-rheplicant-tool-run'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'

const SESSION = SessionId('rheplicant-task-file-web-e2e')

// The task file's exact bytes. Trailing newline included on purpose: the
// digest and the transported text must be the file, not a tidied copy of it.
const TASK_YAML = 'schema_version: 1\nruntime:\n  seed: 20260822\nruns:\n  - {name: simulate, kind: forward}\n'
const TASK_RELATIVE = join('tasks', 'probe.yaml')
const TASK_DIGEST = createHash('sha256').update(Buffer.from(TASK_YAML, 'utf8')).digest('hex')

// `<UTC compact>-<first 8 of taskDigest>-<6 random>` (§4.1).
const EXECUTION_ID = /^\d{8}T\d{6}Z-[0-9a-f]{8}-[0-9a-z]{6}$/

/** The document the stub reports having parsed, standing in for the service's echo. */
const PARSED_ECHO = { schema_version: 1, runtime: { seed: 20260822 }, runs: [{ name: 'simulate', kind: 'forward' }] }

/** One `rheplicant/run` event's payload, as this scenario reads it. */
interface RunEventData {
  readonly executionId?: string
  readonly taskDigest?: string
  readonly taskPath?: string
  readonly document: unknown
}

/** Records what reached the seam, and answers a fixed successful outcome. */
class CapturingProvider implements ComputeProvider {
  readonly seen: ComputeInput[] = []

  validate(input: ComputeInput): Promise<ValidationReport> {
    this.seen.push(input)
    return Promise.resolve({ valid: true, errors: [] })
  }

  gates(input: ComputeInput): Promise<GatesReport> {
    this.seen.push(input)
    return Promise.resolve({ checks: [], runs: [], warnings: [] })
  }

  run(input: ComputeInput): Promise<RunOutcome> {
    this.seen.push(input)
    return Promise.resolve({
      runs: [{ name: 'simulate', kind: 'forward', status: 'ok' }],
      tookMs: 1,
      // Only a `documentText` call gets the parsed echo back, exactly as the
      // real service behaves — the host must never re-parse YAML itself.
      ...(input.documentText === undefined ? {} : { document: PARSED_ECHO }),
    })
  }

  // P4c added `readExecution` to the seam: a published tree projected into the
  // same wire shape a run returns. This scenario never publishes, so the stub
  // refuses rather than inventing an outcome that would look like a real one.
  readExecution(resultsPath: string): Promise<RunOutcome> {
    return Promise.reject(new Error(`this scenario publishes nothing; ${resultsPath} does not exist`))
  }

  // §12 added `definition` to the seam: §7's four criteria, answered from one
  // document at once. This scenario checks the RUN path, so the stub answers a
  // defined task rather than refusing — a refusal here would be an assertion
  // about definedness that this test is not making.
  definition(input: ComputeInput): Promise<DefinitionReport> {
    this.seen.push(input)
    return Promise.resolve({
      inputs: [],
      validation: { valid: true, errors: [] },
      gates: { checks: [], runs: [], warnings: [] },
    })
  }

  schema(): Promise<SchemaDocument> {
    return Promise.resolve({ schemaVersion: '1', jsonSchema: {}, exits: [], operators: [], transforms: [] })
  }

  graph(): Promise<SignalPathGraph | null> {
    return Promise.resolve(null)
  }
}

describe('web e2e: a rheplicant task file is the run input, confined to the session directory', () => {
  let scaffold: WebScaffold
  let agent: Agent
  let provider: CapturingProvider

  /** Run `rheplicant_run` once with the given arguments. */
  async function runTool(callId: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    return scaffold.ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId(callId),
      name: 'rheplicant_run',
      arguments: args,
      agent,
    })
  }

  /** The rendered text of one tool result, joined. */
  function textOf(result: ToolExecutionResult): string {
    return result.content.map(block => (block.type === 'text' ? block.text : '')).join('')
  }

  /** Every `rheplicant/run` event on the live session, in order. */
  function runEvents(): RunEventData[] {
    return agent.session.events
      .filter(event => event.type === 'rheplicant/run')
      .map(event => event.data as unknown as RunEventData)
  }

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    provider = new CapturingProvider()
    new ComputeRuntime(scaffold.ctx).registerProvider(['local'], provider)
    await scaffold.ctx.plugin(toolRun, { defaultTransport: 'local' })

    // The task file lives INSIDE the workspace the session runs in — that is
    // the whole point of the confinement rule, so the fixture respects it.
    const taskPath = join(scaffold.workspaceCwd, TASK_RELATIVE)
    mkdirSync(dirname(taskPath), { recursive: true })
    writeFileSync(taskPath, TASK_YAML)
    // A file outside the workspace, plus a symlink to it from inside: the two
    // escape routes a lexical check alone would not both catch.
    writeFileSync(join(scaffold.workspaceCwd, '..', 'outside-task.yaml'), TASK_YAML)
    symlinkSync(join(scaffold.workspaceCwd, '..', 'outside-task.yaml'), join(scaffold.workspaceCwd, 'tasks', 'linked.yaml'))

    const handle = await scaffold.ctx.agents.create({
      sessionId: SESSION,
      meta: { cwd: scaffold.workspaceCwd },
    })
    agent = handle.agent
  }, 120_000)

  afterAll(async () => {
    await scaffold?.close()
  })

  it('sends the task file\'s exact bytes and mints an execution identity', async () => {
    const result = await runTool('rheplicant-task-file-run', { task: TASK_RELATIVE })
    expect(result.isError).toBe(false)

    // The bytes travelled unparsed, and they are the file's own — not a
    // re-serialization of something the host parsed.
    expect(provider.seen).toHaveLength(1)
    expect(provider.seen[0]?.documentText).toBe(TASK_YAML)
    // P2 added `taskPath` beside the bytes so the bootstrap entry can name the
    // document's own directory (`source_name` must equal `source_path`). It is
    // an absolute host path into the scaffold's temp workspace, so it is
    // asserted by shape rather than by value.
    expect(provider.seen[0]?.taskPath).toMatch(/\/tasks\/probe\.yaml$/)

    const rendered = textOf(result)
    const executionId = rendered.match(/execution (\S+)/)?.[1]
    if (executionId === undefined) throw new Error(`rheplicant_run reported no execution id: ${rendered}`)
    expect(executionId).toMatch(EXECUTION_ID)
    // The digest half of the id is the digest of the AUTHORED bytes.
    expect(executionId).toContain(TASK_DIGEST.slice(0, 8))

    const events = runEvents()
    expect(events).toHaveLength(1)
    expect(events[0]?.executionId).toBe(executionId)
    expect(events[0]?.taskDigest).toBe(TASK_DIGEST)
    expect(events[0]?.taskPath).toBe(TASK_RELATIVE)
    // The host holds bytes, not a mapping, so the recorded document is the
    // copy the compute service echoed back after parsing.
    expect(events[0]?.document).toEqual(PARSED_ECHO)
  }, 60_000)

  it('mints a fresh execution id for every run of the same task file', async () => {
    const first = runEvents().at(-1)?.executionId
    const result = await runTool('rheplicant-task-file-rerun', { task: TASK_RELATIVE })
    expect(result.isError).toBe(false)
    const second = runEvents().at(-1)?.executionId

    expect(second).toMatch(EXECUTION_ID)
    // Same task, same bytes, same second — only the random suffix separates
    // them, and it must (§4.1: the loser of a collision would overwrite the
    // winner's results tree).
    expect(second).not.toBe(first)
    expect(runEvents().at(-1)?.taskDigest).toBe(TASK_DIGEST)
  }, 60_000)

  it('refuses a task path that walks out of the session directory', async () => {
    const before = provider.seen.length
    const result = await runTool('rheplicant-task-file-escape', { task: '../outside-task.yaml' })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('outside the session directory')
    // Refused BEFORE anything reached the seam — no read, no run.
    expect(provider.seen).toHaveLength(before)
  }, 60_000)

  it('refuses a task path that reaches out through a symlink', async () => {
    const before = provider.seen.length
    const result = await runTool('rheplicant-task-file-symlink', { task: 'tasks/linked.yaml' })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('outside the session directory')
    expect(provider.seen).toHaveLength(before)
  }, 60_000)

  it('refuses an absolute task path outside the session directory', async () => {
    const before = provider.seen.length
    const result = await runTool('rheplicant-task-file-absolute', { task: '/etc/hosts' })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('outside the session directory')
    expect(provider.seen).toHaveLength(before)
  }, 60_000)

  it('refuses a call that names both a task and an inline document, and one that names neither', async () => {
    const both = await runTool('rheplicant-task-file-both', { task: TASK_RELATIVE, document: {} })
    expect(both.isError).toBe(true)
    expect(textOf(both)).toContain('both were given')

    const neither = await runTool('rheplicant-task-file-neither', {})
    expect(neither.isError).toBe(true)
    expect(textOf(neither)).toContain('neither was given')
  }, 60_000)

  it('still accepts an inline document, and gives it an execution id too', async () => {
    const result = await runTool('rheplicant-task-file-inline', { document: { runs: [] } })
    expect(result.isError).toBe(false)
    expect(provider.seen.at(-1)).toEqual({ document: { runs: [] } })

    const latest = runEvents().at(-1)
    expect(latest?.executionId).toMatch(EXECUTION_ID)
    // A scratch run has a digest (of what the model authored) but no task.
    expect(latest?.taskDigest).toMatch(/^[0-9a-f]{64}$/)
    expect(latest?.taskPath).toBeUndefined()
  }, 60_000)
})

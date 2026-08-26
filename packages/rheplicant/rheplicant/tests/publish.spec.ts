import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { publishTaskRun } from '@rheplicant/dsh-rheplicant/publish'
import { SIDECAR_NAME } from '@rheplicant/dsh-rheplicant/project'
import type { ComputeRuntime } from '@rheplicant/dsh-rheplicant'
import type { RunOutcome } from '@rheplicant/dsh-rheplicant/types'

let workspace: string
beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'rheplicant-publish-'))
  mkdirSync(join(workspace, 'tasks'), { recursive: true })
  writeFileSync(join(workspace, 'tasks', 'demo.yaml'), 'schema_version: 1\n')
})

/**
 * A seam that records what it was asked and answers with one outcome. The real
 * one is exercised end to end by the boot; what matters here is the SEQUENCE
 * around it, which is the part a trigger will reuse.
 */
function seam(outcome: Partial<RunOutcome> = {}): {
  runtime: ComputeRuntime
  calls: { input: unknown; opts: unknown }[]
} {
  const calls: { input: unknown; opts: unknown }[] = []
  const runtime = {
    run: (input: unknown, opts: unknown) => {
      calls.push({ input, opts })
      // The real service CREATES the tree it publishes into, and the sidecar is
      // written beside a tree that already exists. A fake that skipped this
      // would test a sequence that cannot happen.
      const landed = (outcome.resultsPath ?? (opts as { outputsDir: string }).outputsDir)
      mkdirSync(landed, { recursive: true })
      return Promise.resolve({ runs: [], ...outcome } as RunOutcome)
    },
  } as unknown as ComputeRuntime
  return { runtime, calls }
}

/** The sidecar the run left behind, parsed. */
function sidecar(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(path, SIDECAR_NAME), 'utf8')) as Record<string, unknown>
}

describe('publishing a task run without a conversation', () => {
  it('takes the workspace as an ARGUMENT, and publishes under it', async () => {
    // The whole point of the extraction: the project a run belongs to is not a
    // fact about a chat, and a caller with no chat must still be able to say it.
    const { runtime, calls } = seam()
    const published = await publishTaskRun(runtime, {
      workspace, task: 'tasks/demo.yaml', transport: 'local',
    })
    // Against the CANONICAL workspace: on macOS `mkdtemp` hands back
    // `/var/folders/…` for a directory whose real path is
    // `/private/var/folders/…`, and comparing the two spellings is the exact
    // bug `TaskFile.root` exists to prevent.
    const root = realpathSync(workspace)
    expect(published.publishedTo?.startsWith(join(root, 'results'))).toBe(true)
    expect((calls[0]?.opts as { outputsDir: string }).outputsDir)
      .toBe(join(root, 'results', 'tasks/demo', published.executionId))
  })

  it('records NO sessionId when no conversation caused the run', async () => {
    // Absent, not empty. `project-model.md` §11 removed session as an
    // addressing dimension, so an execution without one is the general case
    // with an optional fact missing — not a special kind of execution.
    const { runtime } = seam()
    const published = await publishTaskRun(runtime, {
      workspace, task: 'tasks/demo.yaml', transport: 'local',
    })
    expect(sidecar(published.publishedTo as string).sessionId).toBeUndefined()
  })

  it('records the sessionId when one is supplied, as provenance', async () => {
    const { runtime } = seam()
    const published = await publishTaskRun(runtime, {
      workspace, task: 'tasks/demo.yaml', transport: 'local', sessionId: 'S-1',
    })
    expect(sidecar(published.publishedTo as string).sessionId).toBe('S-1')
  })

  it('records the kinds off the OUTCOME, not off the document', async () => {
    // A run that refused partway published fewer entries than the document
    // declared, and the sidecar describes what happened.
    const { runtime } = seam({
      runs: [
        { name: 'a', kind: 'forward', status: 'ok' },
        { name: 'b', kind: 'nuts', status: 'failed' },
      ],
    })
    const published = await publishTaskRun(runtime, {
      workspace, task: 'tasks/demo.yaml', transport: 'local',
    })
    expect(sidecar(published.publishedTo as string).kinds).toEqual(['forward', 'nuts'])
  })

  it('writes the sidecar where the tree ACTUALLY landed', async () => {
    // A refused run publishes under a sibling carrying a `.refused-` suffix,
    // and the sidecar has to follow the directory that exists.
    const elsewhere = join(realpathSync(workspace), 'results', 'tasks/demo', 'EXEC.refused-x')
    mkdirSync(elsewhere, { recursive: true })
    const { runtime } = seam({ resultsPath: elsewhere })
    const published = await publishTaskRun(runtime, {
      workspace, task: 'tasks/demo.yaml', transport: 'local',
    })
    expect(published.publishedTo).toBe(elsewhere)
    expect(sidecar(elsewhere).executionId).toBe(published.executionId)
  })

  it('ensures `results/` is ignored before the first tree lands, in a repository', async () => {
    execFileSync('git', ['init', '-q'], { cwd: workspace })
    const { runtime } = seam()
    const published = await publishTaskRun(runtime, {
      workspace, task: 'tasks/demo.yaml', transport: 'local',
    })
    expect(published.ignoreWritten).toBe(join(realpathSync(workspace), '.gitignore'))
    expect(readFileSync(join(realpathSync(workspace), '.gitignore'), 'utf8')).toContain('results/')
  })

  it('writes NOTHING outside a repository, which is §9.1\'s contract', async () => {
    // "It does nothing at all when the workspace is not a git repository." A
    // project that is not under version control has nothing to tell git about,
    // and creating a `.gitignore` there would be a file the user did not ask
    // for in a directory they own.
    const { runtime } = seam()
    const published = await publishTaskRun(runtime, {
      workspace, task: 'tasks/demo.yaml', transport: 'local',
    })
    expect(published.ignoreWritten).toBeUndefined()
    expect(existsSync(join(realpathSync(workspace), '.gitignore'))).toBe(false)
  })

  it('refuses a task outside the project rather than reading it', async () => {
    // The confinement root is the PROJECT here, where the tool's was the
    // session directory. Same refusal, more honest root.
    const { runtime } = seam()
    await expect(publishTaskRun(runtime, {
      workspace, task: '../escape.yaml', transport: 'local',
    })).rejects.toThrow()
  })

  it('passes the abort signal through, so a caller can stop a run', async () => {
    const { runtime, calls } = seam()
    const controller = new AbortController()
    await publishTaskRun(runtime, {
      workspace, task: 'tasks/demo.yaml', transport: 'local', signal: controller.signal,
    })
    expect((calls[0]?.opts as { signal: AbortSignal }).signal).toBe(controller.signal)
  })

  it('mints a fresh execution id per call, so two runs of one task never collide', async () => {
    const { runtime } = seam()
    const first = await publishTaskRun(runtime, { workspace, task: 'tasks/demo.yaml', transport: 'local' })
    const second = await publishTaskRun(runtime, { workspace, task: 'tasks/demo.yaml', transport: 'local' })
    expect(first.executionId).not.toBe(second.executionId)
  })
})

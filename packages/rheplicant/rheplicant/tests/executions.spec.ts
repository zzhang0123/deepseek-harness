import { execFileSync } from 'node:child_process'
import { lstatSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  ARTIFACT_MEDIA_TYPES,
  MARKER_NAME,
  ProjectReadError,
  listExecutions,
  readArtifact,
  type ArtifactRequest,
} from '@rheplicant/dsh-rheplicant/executions'
import { SIDECAR_NAME } from '@rheplicant/dsh-rheplicant/project'

const MARKER = '2878be26-4551-4183-ae96-43ea0f0e83f4'
const OTHER_MARKER = '11111111-2222-3333-4444-555555555555'

let workspace: string
beforeEach(() => { workspace = mkdtempSync(join(tmpdir(), 'rheplicant-executions-')) })

/** Write one published execution the way P2's publish path leaves it. */
function execution(task: string, name: string, options: {
  marker?: string | null
  sidecar?: Record<string, unknown>
  files?: Record<string, string>
} = {}): string {
  const directory = join(workspace, 'results', task, name)
  mkdirSync(directory, { recursive: true })
  const marker = options.marker === undefined ? MARKER : options.marker
  if (marker !== null) {
    writeFileSync(join(directory, MARKER_NAME),
      JSON.stringify({ format_version: 1, run_directory_id: marker }))
  }
  if (options.sidecar) {
    writeFileSync(join(directory, SIDECAR_NAME), JSON.stringify(options.sidecar))
  }
  for (const [name_, body] of Object.entries(options.files ?? {})) {
    writeFileSync(join(directory, name_), body)
  }
  return directory
}

/** The identity a caller presents, taken the way a listing would take it. */
function request(directory: string, name: string, overrides: Partial<ArtifactRequest> = {}): ArtifactRequest {
  const identity = lstatSync(directory)
  return {
    resultsPath: directory,
    markerId: MARKER,
    device: identity.dev,
    inode: identity.ino,
    name,
    ...overrides,
  }
}

describe('listExecutions', () => {
  it('reports an execution with the identity a later read must present', () => {
    const directory = execution('tasks/demo', 'EXEC-1')
    const [found] = listExecutions(workspace)
    expect(found).toMatchObject({
      executionId: 'EXEC-1',
      task: 'tasks/demo',
      status: 'ok',
      resultsPath: directory,
      markerId: MARKER,
    })
    expect(found?.device).toBe(lstatSync(directory).dev)
    expect(found?.inode).toBe(lstatSync(directory).ino)
  })

  it('is empty for a project that has never published', () => {
    expect(listExecutions(workspace)).toEqual([])
  })

  it('skips the publication lock, which is a SIBLING of the executions', () => {
    execution('tasks/demo', 'EXEC-1')
    // Exactly what the lease writes, one level up from the execution.
    writeFileSync(join(workspace, 'results', 'tasks/demo', '.rheplicant-lock-abc.lock'), '')
    expect(listExecutions(workspace).map(row => row.executionId)).toEqual(['EXEC-1'])
  })

  it('reads a failed execution\'s status off its renamed directory', () => {
    execution('tasks/demo', 'EXEC-1.refused-20260822T183401.404995Z-14508')
    execution('tasks/demo', 'EXEC-2.error-20260822T183402.404995Z-14509')
    expect(listExecutions(workspace).map(row => [row.executionId, row.status])).toEqual([
      ['EXEC-2', 'error'],
      ['EXEC-1', 'refused'],
    ])
  })

  it('keeps two same-named tasks in different directories apart', () => {
    execution('a/demo', '20260822T100000Z-aaaaaaaa-aaaaaa')
    execution('b/demo', '20260822T110000Z-bbbbbbbb-bbbbbb')
    expect(listExecutions(workspace).map(row => row.task)).toEqual(['b/demo', 'a/demo'])
  })

  it('orders newest first, which the id\'s leading UTC stamp already encodes', () => {
    execution('t', '20260822T090000Z-aaaaaaaa-aaaaaa')
    execution('t', '20260822T170000Z-bbbbbbbb-bbbbbb')
    execution('t', '20260822T120000Z-cccccccc-cccccc')
    expect(listExecutions(workspace).map(row => row.executionId)).toEqual([
      '20260822T170000Z-bbbbbbbb-bbbbbb',
      '20260822T120000Z-cccccccc-cccccc',
      '20260822T090000Z-aaaaaaaa-aaaaaa',
    ])
  })

  it('lifts the session-side facts from our sidecar when it is there', () => {
    execution('t', 'EXEC-1', {
      sidecar: { executionId: 'EXEC-1', task: 't', sessionId: 'S-9', transport: 'local', taskDigest: 'abc' },
    })
    expect(listExecutions(workspace)[0]).toMatchObject({ sessionId: 'S-9', transport: 'local', taskDigest: 'abc' })
  })

  it('still reports an execution whose sidecar was never written', () => {
    // The tree is upstream's; our annotation is best-effort and its absence
    // must not hide a real execution.
    execution('t', 'EXEC-1')
    const [found] = listExecutions(workspace)
    expect(found?.executionId).toBe('EXEC-1')
    expect('sessionId' in (found ?? {})).toBe(false)
  })

  it('ignores a directory that carries no marker, so a stray folder is not an execution', () => {
    mkdirSync(join(workspace, 'results', 'tasks', 'notes'), { recursive: true })
    expect(listExecutions(workspace)).toEqual([])
  })

  it('reports an execution whose marker is malformed, with a null marker id', () => {
    // Present but unreadable is a real state: the execution exists and should
    // be listed, but nothing can be served from it (see readArtifact).
    execution('t', 'EXEC-1', { marker: null })
    writeFileSync(join(workspace, 'results', 't', 'EXEC-1', MARKER_NAME), 'not json')
    expect(listExecutions(workspace)[0]).toMatchObject({ executionId: 'EXEC-1', markerId: null })
  })
})

describe('readArtifact', () => {
  it('serves an allowed artifact with its media type', () => {
    const directory = execution('t', 'EXEC-1', { files: { 'provenance.json': '{"ok":true}' } })
    const artifact = readArtifact(workspace, request(directory, 'provenance.json'))
    expect(artifact.bytes.toString('utf8')).toBe('{"ok":true}')
    expect(artifact.mediaType).toBe('application/json')
  })

  it('refuses a name outside the allow-list', () => {
    const directory = execution('t', 'EXEC-1', { files: { 'secret.env': 'TOKEN=1' } })
    expect(() => readArtifact(workspace, request(directory, 'secret.env')))
      .toThrow(expect.objectContaining({ code: 'ARTIFACT_NOT_ALLOWED' }))
  })

  it.each(['../../../etc/passwd', 'runs/../../escape', '/etc/passwd'])(
    'refuses the traversal %s by name, before any path is built', (name) => {
      const directory = execution('t', 'EXEC-1')
      expect(() => readArtifact(workspace, request(directory, name)))
        .toThrow(expect.objectContaining({ code: 'ARTIFACT_NOT_ALLOWED' }))
    })

  it('refuses an execution path outside the project\'s results tree', () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'rheplicant-elsewhere-'))
    writeFileSync(join(elsewhere, MARKER_NAME),
      JSON.stringify({ format_version: 1, run_directory_id: MARKER }))
    writeFileSync(join(elsewhere, 'provenance.json'), '{}')
    expect(() => readArtifact(workspace, request(elsewhere, 'provenance.json')))
      .toThrow(expect.objectContaining({ code: 'PATH_ESCAPES_PROJECT' }))
  })

  it('refuses a relative execution path', () => {
    expect(() => readArtifact(workspace, { ...request(execution('t', 'E'), 'provenance.json'), resultsPath: 'results/t/E' }))
      .toThrow(expect.objectContaining({ code: 'PATH_ESCAPES_PROJECT' }))
  })

  it('refuses when the directory\'s inode no longer matches the one listed', () => {
    // The tree was pruned and a new run reused the name: same path, different
    // directory. Inode is what catches it.
    const directory = execution('t', 'EXEC-1', { files: { 'provenance.json': '{}' } })
    const stale = request(directory, 'provenance.json')
    rmSync(directory, { recursive: true })
    execution('t', 'EXEC-1', { files: { 'provenance.json': '{}' } })
    expect(() => readArtifact(workspace, stale))
      .toThrow(expect.objectContaining({ code: 'IDENTITY_CHANGED' }))
  })

  it('refuses when the marker changed, which inode reuse alone would miss', () => {
    const directory = execution('t', 'EXEC-1', { files: { 'provenance.json': '{}' } })
    expect(() => readArtifact(workspace, request(directory, 'provenance.json', { markerId: OTHER_MARKER })))
      .toThrow(expect.objectContaining({ code: 'IDENTITY_CHANGED' }))
  })

  it('refuses a symlink standing where the execution directory should be', () => {
    const real = execution('t', 'EXEC-1', { files: { 'provenance.json': '{}' } })
    const link = join(workspace, 'results', 't', 'LINK')
    symlinkSync(real, link)
    const identity = lstatSync(link)
    expect(() => readArtifact(workspace, {
      resultsPath: link, markerId: MARKER, device: identity.dev, inode: identity.ino, name: 'provenance.json',
    })).toThrow(expect.objectContaining({ code: 'IDENTITY_CHANGED' }))
  })

  it('refuses a symlinked ARTIFACT rather than following it out of the tree', () => {
    const outside = join(mkdtempSync(join(tmpdir(), 'rheplicant-outside-')), 'secret')
    writeFileSync(outside, 'TOKEN=1')
    const directory = execution('t', 'EXEC-1')
    symlinkSync(outside, join(directory, 'provenance.json'))
    expect(() => readArtifact(workspace, request(directory, 'provenance.json')))
      .toThrow(expect.objectContaining({ code: 'ARTIFACT_UNREADABLE' }))
  })

  it('refuses a directory standing where an artifact should be', () => {
    const directory = execution('t', 'EXEC-1')
    mkdirSync(join(directory, 'provenance.json'))
    expect(() => readArtifact(workspace, request(directory, 'provenance.json')))
      .toThrow(expect.objectContaining({ code: 'ARTIFACT_UNREADABLE' }))
  })

  it('refuses a FIFO instead of blocking forever waiting for a writer', () => {
    // This is what O_NONBLOCK buys: without it the open never returns, and the
    // failure mode is a hung read rather than a refusal. If this test ever
    // times out instead of failing, that flag is what to look at.
    const directory = execution('t', 'EXEC-1')
    execFileSync('mkfifo', [join(directory, 'provenance.json')])
    expect(() => readArtifact(workspace, request(directory, 'provenance.json')))
      .toThrow(expect.objectContaining({ code: 'ARTIFACT_UNREADABLE' }))
  })

  it('says the execution is gone rather than failing obscurely', () => {
    const directory = execution('t', 'EXEC-1', { files: { 'provenance.json': '{}' } })
    const stale = request(directory, 'provenance.json')
    rmSync(directory, { recursive: true })
    expect(() => readArtifact(workspace, stale))
      .toThrow(expect.objectContaining({ code: 'EXECUTION_NOT_FOUND' }))
  })

  it('is a ProjectReadError, so a caller can branch on the code', () => {
    const directory = execution('t', 'EXEC-1')
    try {
      readArtifact(workspace, request(directory, 'nope.json'))
      expect.unreachable('the read should have refused')
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectReadError)
    }
  })

  it('serves both self-describing files, which is what makes a tree readable alone', () => {
    const directory = execution('t', 'EXEC-1', { sidecar: { executionId: 'EXEC-1' } })
    expect(readArtifact(workspace, request(directory, MARKER_NAME)).mediaType).toBe('application/json')
    expect(readArtifact(workspace, request(directory, SIDECAR_NAME)).mediaType).toBe('application/json')
  })

  it('allows exactly the audit surface, and nothing that could hold a secret', () => {
    expect(Object.keys(ARTIFACT_MEDIA_TYPES).sort()).toEqual([
      '.rheplicant-agent.json',
      '.rheplicant-results.json',
      'config.input.yaml',
      'config.resolved.yaml',
      'diagnostics.json',
      'products.json',
      'provenance.json',
      'report.json',
      'report.txt',
    ])
  })
})

describe('the mounted seam', () => {
  it('registers as ctx.rheplicantProject and answers from the real tree', async () => {
    // The cordis row is only real if the service actually lands on the context;
    // asserting the module exports a class would prove nothing about mounting.
    const { Context } = await import('@deepseek-ai/cordis')
    const ProjectRuntime = (await import('@rheplicant/dsh-rheplicant/project-runtime')).default
    const ctx = new Context()
    const mounted = await ctx.plugin(ProjectRuntime)
    try {
      expect(ctx.rheplicantProject).toBeInstanceOf(ProjectRuntime)
      const directory = execution('tasks/demo', 'EXEC-1', { files: { 'diagnostics.json': '{"status":"ok"}' } })
      const [found] = ctx.rheplicantProject.listExecutions(workspace)
      expect(found).toMatchObject({ executionId: 'EXEC-1', task: 'tasks/demo', resultsPath: directory })
      const artifact = ctx.rheplicantProject.readArtifact(workspace, {
        resultsPath: found?.resultsPath as string,
        markerId: found?.markerId as string,
        device: found?.device as number,
        inode: found?.inode as number,
        name: 'diagnostics.json',
      })
      expect(JSON.parse(artifact.bytes.toString('utf8'))).toEqual({ status: 'ok' })
    } finally {
      await mounted.dispose()
    }
  })
})

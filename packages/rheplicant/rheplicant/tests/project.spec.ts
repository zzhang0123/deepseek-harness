import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  SIDECAR_NAME,
  ensureResultsIgnored,
  executionDirectory,
  taskSegment,
  writeSidecar,
} from '@rheplicant/dsh-rheplicant/project'

/** A fresh directory that looks like a git working tree. */
function repository(): string {
  const root = mkdtempSync(join(tmpdir(), 'rheplicant-project-'))
  mkdirSync(join(root, '.git'))
  return root
}

let workspace: string
beforeEach(() => { workspace = repository() })

describe('taskSegment', () => {
  it('keeps the task\'s relative path and drops only its extension', () => {
    expect(taskSegment(workspace, join(workspace, 'tasks', 'demo_small.yaml')))
      .toBe(join('tasks', 'demo_small'))
    expect(taskSegment(workspace, join(workspace, 'demo.yaml'))).toBe('demo')
  })

  it('keeps two same-named tasks in different directories apart', () => {
    // Collapsing to a basename would file their executions together and make
    // the tree lie about which document produced what.
    expect(taskSegment(workspace, join(workspace, 'a', 'demo.yaml')))
      .not.toBe(taskSegment(workspace, join(workspace, 'b', 'demo.yaml')))
  })

  it('does not mistake a dot in a DIRECTORY name for an extension', () => {
    expect(taskSegment(workspace, join(workspace, 'a.b', 'c'))).toBe(join('a.b', 'c'))
  })
})

describe('executionDirectory', () => {
  it('places one execution under results/<task>/<id>', () => {
    expect(executionDirectory(workspace, join(workspace, 'tasks', 'a.yaml'), 'EXEC-1'))
      .toBe(join(workspace, 'results', 'tasks', 'a', 'EXEC-1'))
  })
})

describe('ensureResultsIgnored', () => {
  it('adds a managed block without disturbing what the user wrote', () => {
    writeFileSync(join(workspace, '.gitignore'), 'node_modules/\n', 'utf8')
    expect(ensureResultsIgnored(workspace)).toBe(join(workspace, '.gitignore'))
    const body = readFileSync(join(workspace, '.gitignore'), 'utf8')
    expect(body.startsWith('node_modules/\n')).toBe(true)
    expect(body).toContain('/results/')
  })

  it('creates the file when the project has none', () => {
    expect(ensureResultsIgnored(workspace)).toBe(join(workspace, '.gitignore'))
    expect(readFileSync(join(workspace, '.gitignore'), 'utf8')).toContain('/results/')
  })

  it('is idempotent, so a second execution announces nothing and duplicates nothing', () => {
    ensureResultsIgnored(workspace)
    const after = readFileSync(join(workspace, '.gitignore'), 'utf8')
    expect(ensureResultsIgnored(workspace)).toBeUndefined()
    expect(readFileSync(join(workspace, '.gitignore'), 'utf8')).toBe(after)
  })

  it('does nothing at all outside a git repository', () => {
    const plain = mkdtempSync(join(tmpdir(), 'rheplicant-plain-'))
    expect(ensureResultsIgnored(plain)).toBeUndefined()
    expect(existsSync(join(plain, '.gitignore'))).toBe(false)
  })
})

describe('writeSidecar', () => {
  const facts = {
    executionId: 'EXEC-1',
    task: 'tasks/a',
    taskPath: '/w/tasks/a.yaml',
    taskDigest: 'abc',
    transport: 'local',
    startedAt: '2026-08-22T19:00:00.000Z',
    finishedAt: '2026-08-22T19:00:02.000Z',
  }

  it('records the one fact upstream does not: which session produced this', () => {
    const tree = join(workspace, 'results', 'tasks', 'a', 'EXEC-1')
    const wrote = writeSidecar(tree, { ...facts, sessionId: 'S-9' })
    expect(wrote).toBe(join(tree, SIDECAR_NAME))
    const written = JSON.parse(readFileSync(wrote as string, 'utf8'))
    expect(written).toMatchObject({ formatVersion: 1, executionId: 'EXEC-1', sessionId: 'S-9' })
  })

  it('omits an absent sessionId rather than recording null', () => {
    const tree = join(workspace, 'results', 'tasks', 'a', 'EXEC-2')
    const written = JSON.parse(readFileSync(writeSidecar(tree, facts) as string, 'utf8'))
    expect('sessionId' in written).toBe(false)
  })

  it('never fails a run that succeeded, even when the tree cannot be annotated', () => {
    // A file where the directory should be: mkdir fails, and so must not throw.
    const blocked = join(workspace, 'blocked')
    writeFileSync(blocked, 'not a directory', 'utf8')
    expect(writeSidecar(join(blocked, 'EXEC-1'), facts)).toBeUndefined()
  })
})

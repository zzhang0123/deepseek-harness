import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  INPUT_EXTENSIONS,
  MAX_SCAN_ENTRIES,
  TASK_EXTENSIONS,
  scanProject,
} from '@rheplicant/dsh-rheplicant/contents'
import { MARKER_NAME } from '@rheplicant/dsh-rheplicant/executions'

let workspace: string
beforeEach(() => { workspace = mkdtempSync(join(tmpdir(), 'rheplicant-contents-')) })

/** Write one file, creating its parents, and return its absolute path. */
function file(relative: string, body = 'x'): string {
  const target = join(workspace, relative)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, body)
  return target
}

/** The listed task paths, which is what almost every assertion is about. */
function taskPaths(): string[] {
  return scanProject(workspace).tasks.map(task => task.path)
}

/** The listed input paths. */
function inputPaths(): string[] {
  return scanProject(workspace).inputs.map(input => input.path)
}

describe('scanProject — what it finds', () => {
  it('finds a task document anywhere in the project, not only under tasks/', () => {
    file('demo.yaml')
    file('tasks/fit.yml')
    file('studies/2026/beam.yaml')
    expect(taskPaths()).toEqual(['demo.yaml', 'studies/2026/beam.yaml', 'tasks/fit.yml'])
  })

  it('reports paths workspace-relative with POSIX separators', () => {
    file('a/b/c.yaml')
    expect(taskPaths()).toEqual(['a/b/c.yaml'])
  })

  it('sorts by path so the listing is stable across directory-read order', () => {
    file('z.yaml')
    file('a.yaml')
    file('m.yaml')
    expect(taskPaths()).toEqual(['a.yaml', 'm.yaml', 'z.yaml'])
  })

  it('carries each file size and modification time', () => {
    file('demo.yaml', 'hello')
    const [task] = scanProject(workspace).tasks
    expect(task?.bytes).toBe(5)
    expect(task?.modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('finds a data file for every extension the input set names', () => {
    for (const extension of INPUT_EXTENSIONS) file(`data/sample.${extension}`)
    expect(inputPaths()).toHaveLength(INPUT_EXTENSIONS.size)
  })

  it('reports an input by its extension and never by a claimed format', () => {
    file('data/beam.npz')
    const [input] = scanProject(workspace).inputs
    expect(input?.extension).toBe('npz')
    expect(input).not.toHaveProperty('format')
  })

  it('classifies each extension into exactly one list', () => {
    for (const extension of TASK_EXTENSIONS) expect(INPUT_EXTENSIONS.has(extension)).toBe(false)
  })

  it('answers empty for a project that holds neither', () => {
    file('README.md')
    file('notes.org')
    expect(scanProject(workspace)).toMatchObject({ tasks: [], inputs: [], truncated: false })
  })

  it('answers empty rather than throwing for a workspace that does not exist', () => {
    expect(scanProject(join(workspace, 'absent'))).toMatchObject({ tasks: [], inputs: [] })
  })
})

describe('scanProject — what it refuses to walk', () => {
  it("skips the results tree: a published execution's config.input.yaml is not a task", () => {
    const published = join(workspace, 'results', 'demo', '20260822T120000Z-abc-def')
    mkdirSync(published, { recursive: true })
    writeFileSync(join(published, MARKER_NAME), '{}')
    writeFileSync(join(published, 'config.input.yaml'), 'x')
    writeFileSync(join(published, 'config.resolved.yaml'), 'x')
    file('demo.yaml')
    expect(taskPaths()).toEqual(['demo.yaml'])
  })

  it('walks a nested directory that merely happens to be named results', () => {
    file('studies/results/keep.yaml')
    expect(taskPaths()).toEqual(['studies/results/keep.yaml'])
  })

  it('skips dot-directories, which is what keeps .git and .venv out', () => {
    file('.git/config.yaml')
    file('.venv/lib/thing.yaml')
    file('.dsh/profiles/p.yaml')
    expect(taskPaths()).toEqual([])
  })

  it('skips node_modules and __pycache__', () => {
    file('node_modules/pkg/schema.yaml')
    file('python/__pycache__/x.yaml')
    expect(taskPaths()).toEqual([])
  })

  it('never follows a directory symlink out of the project', () => {
    const outside = mkdtempSync(join(tmpdir(), 'rheplicant-outside-'))
    writeFileSync(join(outside, 'secret.yaml'), 'x')
    symlinkSync(outside, join(workspace, 'link'))
    expect(taskPaths()).toEqual([])
  })

  it('never serves a symlinked file, even one pointing inside the project', () => {
    file('real.yaml')
    symlinkSync(join(workspace, 'real.yaml'), join(workspace, 'alias.yaml'))
    expect(taskPaths()).toEqual(['real.yaml'])
  })

  it('stops at the depth cap instead of walking an unbounded tree', () => {
    file('a/b/c/d/e/f/g/h/i/j/k/deep.yaml')
    expect(taskPaths()).toEqual([])
  })
})

describe('scanProject — the caps are announced, never silent', () => {
  it('reports truncated: false when the whole tree fit', () => {
    file('one.yaml')
    expect(scanProject(workspace).truncated).toBe(false)
  })

  it('reports truncated: true once the entry cap stops the walk', () => {
    for (let index = 0; index <= MAX_SCAN_ENTRIES; index += 1) {
      file(`bulk/f${index}.yaml`)
    }
    const found = scanProject(workspace)
    expect(found.truncated).toBe(true)
    expect(found.tasks.length).toBeLessThanOrEqual(MAX_SCAN_ENTRIES)
  })

  it('still returns what it did find when it truncates', () => {
    for (let index = 0; index <= MAX_SCAN_ENTRIES; index += 1) {
      file(`bulk/f${index}.yaml`)
    }
    expect(scanProject(workspace).tasks.length).toBeGreaterThan(0)
  })
})

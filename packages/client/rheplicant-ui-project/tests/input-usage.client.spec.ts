import { describe, expect, it } from 'vitest'
import { taskInputUsage } from '../src/client/input-usage.ts'
import type { ProjectDefinitionBody, ProjectInputRow } from '@rheplicant/dsh-rheplicant'

/** The project's listed data files. */
const LISTED: readonly ProjectInputRow[] = [
  { path: 'inputs/gain.npy', bytes: 8, modifiedAt: '', extension: 'npy' },
  { path: 'inputs/beam.npz', bytes: 8, modifiedAt: '', extension: 'npz' },
]

/** A definition body carrying the given references. */
function report(inputs: ProjectDefinitionBody['inputs']): ProjectDefinitionBody {
  return {
    path: 'tasks/fit.yaml',
    digest: 'abc',
    inputs,
    validation: { valid: true, errors: [], warnings: [] },
    gates: { checks: [], runs: [], warnings: [] },
    fields: { undecided: [], excludes: [] },
  }
}

/** One reference, defaulting to a resolved in-project one. */
function reference(over: Partial<ProjectDefinitionBody['inputs'][number]> = {}) {
  return {
    where: 'model.gain.gain',
    path: 'inputs/gain.npy',
    format: 'npy',
    resolves: true,
    inProject: true,
    projectPath: 'inputs/gain.npy',
    ...over,
  }
}

/**
 * The same reference with no `projectPath` KEY at all.
 *
 * How the route actually reports an outside or unresolved reference: the
 * field is omitted, never sent as `undefined`. Modelling it as a present
 * `undefined` would test a shape the wire does not produce — and under the
 * checkout's `exactOptionalPropertyTypes` it does not even typecheck.
 */
function withoutProjectPath(
  ref: ProjectDefinitionBody['inputs'][number],
): ProjectDefinitionBody['inputs'][number] {
  const { projectPath: _omitted, ...rest } = ref
  return rest
}

describe('with nothing to go on', () => {
  it('claims nothing at all when the task has not been checked', () => {
    // Silence and "this task uses none of them" are different statements, and
    // a panel that made the second while meaning the first would be lying.
    const usage = taskInputUsage(LISTED, undefined)
    expect(usage.known).toBe(false)
    expect(usage.used.size).toBe(0)
  })
})

describe('references this listing can show', () => {
  it('marks the rows the task actually reads', () => {
    const usage = taskInputUsage(LISTED, report([reference()]))
    expect(usage.known).toBe(true)
    expect([...usage.used]).toEqual(['inputs/gain.npy'])
  })

  it('says so plainly when a checked task reads none of them', () => {
    const usage = taskInputUsage(LISTED, report([]))
    expect(usage.known).toBe(true)
    expect(usage.used.size).toBe(0)
  })
})

describe('references this listing cannot show', () => {
  it('names a resolved file the listing does not carry', () => {
    // `INPUT_EXTENSIONS` is a FILTER, not a complete list: a `.dat` resolves
    // perfectly well and never appears as a row. A panel that only marked
    // matching rows would under-report what the task reads.
    const usage = taskInputUsage(LISTED, report([
      reference({ path: 'inputs/cal.dat', projectPath: 'inputs/cal.dat' }),
    ]))
    expect(usage.unlisted).toEqual(['inputs/cal.dat'])
    expect(usage.used.size).toBe(0)
  })

  it('counts a reference that resolved outside the project without naming it', () => {
    // The route withheld the path on purpose (§12.5); this layer must not
    // invent one to display.
    const usage = taskInputUsage(LISTED, report([
      withoutProjectPath(reference({ path: '~/data/beam.npy', inProject: false })),
    ]))
    expect(usage.outside).toBe(1)
    expect(usage.unlisted).toEqual([])
  })

  it('does not mark a row for an outside reference that still carries a path', () => {
    // `inProject` is what decides, not the presence of a path. A body saying
    // "outside" while carrying a project-relative path is contradicting
    // itself, and believing the path would put a mark on the wrong row — the
    // same class of self-contradiction the route already refuses host-side.
    const usage = taskInputUsage(LISTED, report([
      reference({ inProject: false, projectPath: 'inputs/gain.npy' }),
    ]))
    expect(usage.used.size).toBe(0)
    expect(usage.outside).toBe(1)
  })

  it('counts a reference that did not resolve, and leaves the detail to the checklist', () => {
    // Reported once, where it belongs. Repeating the filenames here would
    // give one fault two voices that could disagree.
    const usage = taskInputUsage(LISTED, report([
      withoutProjectPath(reference({ path: 'inputs/gone.npy', resolves: false, inProject: false })),
    ]))
    expect(usage.unresolved).toBe(1)
    expect(usage.used.size).toBe(0)
    expect(usage.unlisted).toEqual([])
  })
})

describe('a document that reads one file twice', () => {
  it('marks the row once and does not double-count', () => {
    const usage = taskInputUsage(LISTED, report([
      reference({ where: 'model.gain.gain' }),
      reference({ where: 'resources.arrays.same' }),
    ]))
    expect([...usage.used]).toEqual(['inputs/gain.npy'])
  })

  it('names an unlisted file once however often it is referenced', () => {
    const twice = reference({ path: 'inputs/cal.dat', projectPath: 'inputs/cal.dat' })
    const usage = taskInputUsage(LISTED, report([twice, { ...twice, where: 'elsewhere' }]))
    expect(usage.unlisted).toEqual(['inputs/cal.dat'])
  })
})

import { describe, expect, it } from 'vitest'
import { taskMaturity, type MaturityInput } from '../src/client/task-maturity.ts'

/** A task with one clean published execution behind it. */
function input(over: Partial<MaturityInput> = {}): MaturityInput {
  return {
    task: { path: 'tasks/fit.yaml', bytes: 400, modifiedAt: 'x', executionCount: 1, newestExecutionId: 'E1' },
    newest: {
      executionId: 'E1', task: 'tasks/fit', status: 'ok',
      path: 'results/tasks/fit/E1/', taskDigest: 'digest-of-fit',
    },
    view: { executionId: 'E1', runs: [{ name: 'fit', kind: 'nuts', status: 'ok' }] },
    documentDigest: 'digest-of-fit',
    ...over,
  }
}

/** One stage by id. */
function stage(id: string, over: Partial<MaturityInput> = {}) {
  return taskMaturity(input(over)).find(found => found.id === id)
}

describe('the stages a task has', () => {
  it('reports the four the tree can actually answer', () => {
    // Validate is absent on purpose: a validate that ran without publishing
    // leaves nothing on disk, so a stage for it would sit permanently blank
    // and read as "never validated" rather than "not recorded here".
    expect(taskMaturity(input()).map(s => s.id))
      .toEqual(['document', 'runs', 'gates', 'diagnostics'])
  })
})

describe('a task that has never run', () => {
  const never = { newest: undefined, view: undefined, task: {
    path: 'lonely.yaml', bytes: 10, modifiedAt: 'x', executionCount: 0,
  } } as Partial<MaturityInput>

  it('still reports its document, which exists whether or not it ran', () => {
    expect(stage('document', never)).toMatchObject({ state: 'ok' })
  })

  it('leaves the run stage IDLE, not failed', () => {
    // "Has not run" and "ran badly" are different facts about a task.
    expect(stage('runs', never)?.state).toBe('idle')
  })

  it('says so rather than reporting zero of zero', () => {
    expect(stage('runs', never)?.detail).toMatch(/never run/i)
  })

  it('leaves gates and diagnostics idle too, with nothing to judge', () => {
    expect(stage('gates', never)?.state).toBe('idle')
    expect(stage('diagnostics', never)?.state).toBe('idle')
  })
})

describe('runs', () => {
  it('counts how many of the newest execution\'s runs succeeded', () => {
    const found = stage('runs', {
      view: { executionId: 'E1', runs: [
        { name: 'a', kind: 'forward', status: 'ok' },
        { name: 'b', kind: 'nuts', status: 'ok' },
      ] },
    })
    expect(found).toMatchObject({ state: 'ok' })
    expect(found?.detail).toMatch(/2\s*\/\s*2/)
  })

  it('is an error when a run failed', () => {
    expect(stage('runs', {
      view: { executionId: 'E1', runs: [
        { name: 'a', kind: 'forward', status: 'ok' },
        { name: 'b', kind: 'nuts', status: 'failed' },
      ] },
    })?.state).toBe('error')
  })

  it('is an error when the PUBLICATION was refused, even with runs ok', () => {
    // The two status axes stay apart: a run can succeed and its publication
    // still be refused, and a maturity rail that showed only the first would
    // call a task healthy whose results are not on disk.
    expect(stage('runs', {
      newest: { executionId: 'E1', task: 't', status: 'refused', path: 'p/' },
    })?.state).toBe('error')
  })

  it('says the results could not be read rather than claiming zero runs', () => {
    const found = stage('runs', { view: { executionId: 'E1', problem: 'unreadable' } })
    expect(found?.state).toBe('warn')
    expect(found?.detail).toMatch(/could not be read/i)
  })
})

describe('gates', () => {
  it('is idle when the execution recorded no findings at all', () => {
    expect(stage('gates')?.state).toBe('idle')
  })

  it('is an error when any finding refuses', () => {
    expect(stage('gates', {
      view: { executionId: 'E1', runs: [], gates: [
        { check: 'C13', severity: 'refuse', where: 'base', message: 'unidentifiable' },
      ] },
    })?.state).toBe('error')
  })

  it('is a warning when findings only warn', () => {
    expect(stage('gates', {
      view: { executionId: 'E1', runs: [], gates: [
        { check: 'C19', severity: 'warn', where: 'base', message: 'prior sensitivity' },
      ] },
    })?.state).toBe('warn')
  })

  it('is ok when every finding is merely a report', () => {
    expect(stage('gates', {
      view: { executionId: 'E1', runs: [], gates: [
        { check: 'C12', severity: 'report', where: 'base', message: 'linear' },
      ] },
    })?.state).toBe('ok')
  })
})

describe('diagnostics', () => {
  it('is ok when every diagnosed run converged', () => {
    expect(stage('diagnostics', {
      view: { executionId: 'E1', runs: [
        { name: 'fit', kind: 'nuts', status: 'ok', diagnostics: { converged: true, rhat: 1.0 } },
      ] },
    })?.state).toBe('ok')
  })

  it('is a warning when a run did not converge', () => {
    expect(stage('diagnostics', {
      view: { executionId: 'E1', runs: [
        { name: 'fit', kind: 'nuts', status: 'ok', diagnostics: { converged: false, rhat: 1.4 } },
      ] },
    })?.state).toBe('warn')
  })

  it('is idle when nothing was diagnosed, not ok', () => {
    // Nothing to believe is not the same as nothing to worry about.
    expect(stage('diagnostics', {
      view: { executionId: 'E1', runs: [{ name: 'sim', kind: 'forward', status: 'ok' }] },
    })?.state).toBe('idle')
  })
})

describe('staleness — the one signal that needs a digest', () => {
  it('is not stale when the document still digests to what ran', () => {
    expect(stage('document')?.stale).toBe(false)
  })

  it('IS stale once the document has been edited since it ran', () => {
    expect(stage('document', { documentDigest: 'edited-since' })?.stale).toBe(true)
  })

  it('says so on the run stage too, where someone reads the verdict', () => {
    expect(stage('runs', { documentDigest: 'edited-since' })?.stale).toBe(true)
  })

  it('claims NOTHING when the execution recorded no digest', () => {
    // Absent must not read as "different". An older execution whose sidecar
    // predates the field would otherwise be reported stale forever.
    expect(stage('document', {
      newest: { executionId: 'E1', task: 't', status: 'ok', path: 'p/' },
    })?.stale).toBeUndefined()
  })

  it('claims nothing when the document itself could not be digested', () => {
    expect(stage('document', { documentDigest: undefined })?.stale).toBeUndefined()
  })

  it('claims nothing when the task has never run', () => {
    expect(stage('document', { newest: undefined, view: undefined })?.stale).toBeUndefined()
  })
})

describe('a task that has run and whose newest execution was never loaded', () => {
  // §28.5. The workbench's ORDINARY state: `ProjectHome` supplies `view` only
  // for the execution somebody selected, so a task with published executions
  // and no selection reaches here with `newest` set and `view` absent. Before
  // this, all three evidence stages fell through to their empty-collection
  // branches and asserted facts about the tree — three panels under a Tasks
  // row saying "3 executions".
  const unread = { view: undefined } as Partial<MaturityInput>

  it('does not claim the tree recorded no runs', () => {
    expect(stage('runs', unread)?.detail).not.toMatch(/no runs recorded/i)
  })

  it('does not claim the tree recorded no findings', () => {
    expect(stage('gates', unread)?.detail).not.toMatch(/no findings recorded/i)
  })

  it('does not claim nothing was diagnosed', () => {
    expect(stage('diagnostics', unread)?.detail).not.toMatch(/nothing diagnosed/i)
  })

  it('says the newest was not read, in all three', () => {
    for (const id of ['runs', 'gates', 'diagnostics']) {
      expect(stage(id, unread)?.detail).toMatch(/not read/i)
    }
  })

  it('stays IDLE rather than warning — nobody asked, so nothing is wrong', () => {
    // `idle` is not `ok` (§11) and it is not `warn` either: a stage nobody
    // fetched has no verdict, and painting one amber invents a concern.
    for (const id of ['runs', 'gates', 'diagnostics']) {
      expect(stage(id, unread)?.state).toBe('idle')
    }
  })

  it('still reports the document, which is read off the tree row', () => {
    expect(stage('document', unread)).toMatchObject({ state: 'ok' })
  })

  it('still reports a REFUSED publication, which the tree row carries', () => {
    // The publication axis is above the unread guard on purpose: it comes off
    // `newest.status`, which is known whether or not anyone fetched the view.
    const found = stage('runs', {
      view: undefined,
      newest: {
        executionId: 'E1', task: 'tasks/fit', status: 'refused',
        path: 'results/tasks/fit/E1.refused-ab/', taskDigest: 'digest-of-fit',
      },
    })
    expect(found).toMatchObject({ state: 'error' })
    expect(found?.detail).toMatch(/refused/i)
  })

  it('an EMPTY view is still a real answer, and reads as one', () => {
    // The distinction the guard exists for: `view: undefined` is "nobody
    // looked", `view.runs: []` is "we looked and there were none".
    const found = stage('runs', { view: { executionId: 'E1', runs: [] } })
    expect(found?.detail).toMatch(/no runs recorded/i)
  })
})

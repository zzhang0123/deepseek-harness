import { describe, expect, it } from 'vitest'
import { groupByTask } from '../src/client/loop-tasks.ts'
import type { LoopContribution } from '../src/client/loop-contract.ts'

const DOC = { schema_version: 1 } as never
const REPORT = { valid: true, errors: [] } as never
const GATES = { checks: [], runs: [], warnings: [] } as never
const OUTCOME = { runs: [] } as never

function validate(seq: number, taskPath?: string): LoopContribution {
  return { kind: 'validate', seq, document: DOC, transport: 'local', report: REPORT,
    ...(taskPath === undefined ? {} : { taskPath }) }
}
function gates(seq: number, taskPath?: string): LoopContribution {
  return { kind: 'gates', seq, document: DOC, transport: 'local', report: GATES,
    ...(taskPath === undefined ? {} : { taskPath }) }
}
function run(seq: number, taskPath?: string, executionId?: string): LoopContribution {
  return { kind: 'run', seq, document: DOC, transport: 'local', outcome: OUTCOME,
    ...(taskPath === undefined ? {} : { taskPath }),
    ...(executionId === undefined ? {} : { executionId }) }
}

describe('a conversation that touched one task', () => {
  it('is one group carrying its whole loop', () => {
    const tasks = groupByTask([validate(1, 'a.yaml'), gates(2, 'a.yaml'), run(3, 'a.yaml')])
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.taskPath).toBe('a.yaml')
    expect(tasks[0]?.validate?.seq).toBe(1)
    expect(tasks[0]?.run?.seq).toBe(3)
  })
})

describe('a conversation that touched several tasks', () => {
  it('never puts one task\'s validate beside another task\'s run', () => {
    // THE BUG. The old fold kept "the latest of each kind" with no task
    // discrimination, so a session that validated A and then ran B rendered
    // A's Validate beside B's Run as one coherent loop — a loop fabricated
    // out of unrelated work.
    const tasks = groupByTask([validate(1, 'a.yaml'), run(2, 'b.yaml')])
    expect(tasks).toHaveLength(2)
    const byTask = new Map(tasks.map(task => [task.taskPath, task]))
    expect(byTask.get('a.yaml')?.validate?.seq).toBe(1)
    expect(byTask.get('a.yaml')?.run).toBeUndefined()
    expect(byTask.get('b.yaml')?.run?.seq).toBe(2)
    expect(byTask.get('b.yaml')?.validate).toBeUndefined()
  })

  it('orders the groups by most recent activity, so the live one leads', () => {
    const tasks = groupByTask([run(1, 'old.yaml'), run(5, 'fresh.yaml'), validate(3, 'middle.yaml')])
    expect(tasks.map(task => task.taskPath)).toEqual(['fresh.yaml', 'middle.yaml', 'old.yaml'])
  })

  it('keeps the latest of each kind WITHIN one task', () => {
    const tasks = groupByTask([validate(1, 'a.yaml'), validate(4, 'a.yaml')])
    expect(tasks[0]?.validate?.seq).toBe(4)
  })
})

describe('work that is not filed under a task', () => {
  it('is its own group, and says it is not a task', () => {
    // An inline document has no path to group by. One bucket is the best
    // available answer and is honest; folding it into a named task would
    // attribute scratch work to a file that never ran it.
    const tasks = groupByTask([run(1), run(2)])
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.taskPath).toBeUndefined()
  })

  it('never merges with a named task', () => {
    const tasks = groupByTask([run(1, 'a.yaml'), run(2)])
    expect(tasks).toHaveLength(2)
  })
})

describe('the executions', () => {
  it('are collected per task, oldest first', () => {
    const tasks = groupByTask([run(1, 'a.yaml', 'E1'), run(3, 'a.yaml', 'E2'), run(2, 'b.yaml', 'E3')])
    const a = tasks.find(task => task.taskPath === 'a.yaml')
    expect(a?.executions.map(entry => entry.executionId)).toEqual(['E1', 'E2'])
  })

  it('omit a run with no execution id, which predates execution identity', () => {
    const tasks = groupByTask([run(1, 'a.yaml')])
    expect(tasks[0]?.executions).toEqual([])
    expect(tasks[0]?.run).toBeDefined()
  })
})

describe('a conversation with no rheplicant work at all', () => {
  it('is no groups, which is a different thing from an empty loop', () => {
    expect(groupByTask([])).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  groupExecutionsByTask,
  taskSegmentOf,
  countByStatus,
} from '@deepseek-ai/dsh-client-rheplicant-ui-project/src/client/home-selectors.ts'
import type { ProjectExecutionRow } from '@rheplicant/dsh-rheplicant'

/** One execution row, as the overview route sends it. */
function execution(
  executionId: string,
  task: string,
  status: ProjectExecutionRow['status'] = 'ok',
): ProjectExecutionRow {
  return { executionId, task, status, path: `results/${task}/${executionId}/` }
}

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [1, '1 B'],
    [999, '999 B'],
    [1024, '1.0 kB'],
    [1536, '1.5 kB'],
    [1024 * 1024, '1.0 MB'],
    [1024 * 1024 * 1024, '1.0 GB'],
  ])('renders %i as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected)
  })

  it('renders a size it cannot believe as an em dash rather than NaN', () => {
    expect(formatBytes(Number.NaN)).toBe('—')
    expect(formatBytes(-1)).toBe('—')
  })
})

describe('taskSegmentOf', () => {
  it('drops the extension, which is what links a task to its executions', () => {
    expect(taskSegmentOf('tasks/fit.yaml')).toBe('tasks/fit')
    expect(taskSegmentOf('demo.yml')).toBe('demo')
  })

  it('keeps the whole relative path, because two demo.yaml are two tasks', () => {
    expect(taskSegmentOf('a/demo.yaml')).not.toBe(taskSegmentOf('b/demo.yaml'))
  })

  it('leaves a dot in a DIRECTORY name alone', () => {
    expect(taskSegmentOf('v1.2/run')).toBe('v1.2/run')
  })
})

describe('groupExecutionsByTask', () => {
  it('groups by task and keeps the incoming (newest-first) order inside a group', () => {
    const grouped = groupExecutionsByTask([
      execution('E3', 'tasks/fit'),
      execution('E2', 'tasks/beam'),
      execution('E1', 'tasks/fit'),
    ])
    expect(grouped.map(group => group.task)).toEqual(['tasks/fit', 'tasks/beam'])
    expect(grouped[0]?.executions.map(row => row.executionId)).toEqual(['E3', 'E1'])
  })

  it('answers an empty list for a project that has never run', () => {
    expect(groupExecutionsByTask([])).toEqual([])
  })
})

describe('countByStatus', () => {
  it('counts the three outcomes separately, because they mean different things', () => {
    expect(countByStatus([
      execution('E1', 't', 'ok'),
      execution('E2', 't', 'refused'),
      execution('E3', 't', 'ok'),
      execution('E4', 't', 'error'),
    ])).toEqual({ ok: 2, refused: 1, error: 1 })
  })

  it('reports zeros rather than absent keys, so a caller never checks for one', () => {
    expect(countByStatus([])).toEqual({ ok: 0, refused: 0, error: 0 })
  })
})

import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  groupExecutionsByTask,
  taskPathForSegment,
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

describe('which task an execution belongs to', () => {
  /**
   * The bug a user hit: arriving in the workbench from the dashboard with an
   * execution chosen, and still being asked which task it was.
   *
   * `ProjectExecutionRow.task` is the sidecar's SEGMENT (`demo_small`) and the
   * selection's task axis holds a PATH (`demo_small.yaml`). The dashboard was
   * passing the first as the second, so the workbench looked a segment up in a
   * listing of paths and found nothing — and §28.7 had already recorded the
   * other half of the same shape, `chooseExecution` setting the execution
   * alone because it does not hold the listing.
   */
  const listing = [{ path: 'demo_small.yaml' }, { path: 'nested/forward_sim.yaml' }]

  it('turns a sidecar segment into the task path the selection holds', () => {
    expect(taskPathForSegment(listing, 'demo_small')).toBe('demo_small.yaml')
    // A segment keeps its WHOLE relative path — two `demo.yaml` in different
    // directories are two tasks whose executions must not be filed together,
    // which `taskSegmentOf`'s own comment is about. So the segment for a
    // nested task is `nested/forward_sim`, and a bare basename resolves to
    // nothing rather than to whichever one happened to be listed first.
    expect(taskPathForSegment(listing, 'nested/forward_sim')).toBe('nested/forward_sim.yaml')
    expect(taskPathForSegment(listing, 'forward_sim')).toBeUndefined()
  })

  it('accepts a full path too, so one derivation covers both spellings', () => {
    // §28.7: a task whose sidecar string does not equal `taskSegmentOf(path)`
    // is what made two derivations disagree. There is one of these.
    expect(taskPathForSegment(listing, 'demo_small.yaml')).toBe('demo_small.yaml')
    expect(taskPathForSegment(listing, 'nested/forward_sim.yaml')).toBe('nested/forward_sim.yaml')
  })

  it('does not fold a DOTTED basename into its neighbour', () => {
    // `taskSegmentOf` is not idempotent — `demo.v2.yaml` -> `demo.v2` -> `demo`
    // — and `contents.ts` accepts any `.yaml`, so a dotted basename is a real
    // task name (§2: scan, do not enforce a convention). Normalising BOTH
    // sides before comparing, which this did for one build, filed `demo.v2`'s
    // executions under `demo.yaml`: silently, and with a sibling present it
    // overwrote a correct choice with the wrong file.
    const dotted = [{ path: 'demo.yaml' }, { path: 'demo.v2.yaml' }]
    expect(taskPathForSegment(dotted, 'demo.v2')).toBe('demo.v2.yaml')
    expect(taskPathForSegment(dotted, 'demo')).toBe('demo.yaml')
    // The full-path spelling still resolves, because the fallback runs only
    // when nothing matched the row's string as it stands.
    expect(taskPathForSegment(dotted, 'demo.v2.yaml')).toBe('demo.v2.yaml')
  })

  it('answers UNDEFINED rather than guessing when the listing does not hold it', () => {
    // A truncated walk genuinely cannot say. Inventing a path would put the
    // task and execution axes in disagreement about a fact neither measured.
    expect(taskPathForSegment(listing, 'never_walked')).toBeUndefined()
    expect(taskPathForSegment([], 'demo_small')).toBeUndefined()
  })
})

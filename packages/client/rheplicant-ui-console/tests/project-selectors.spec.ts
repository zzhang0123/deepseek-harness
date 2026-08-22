import { describe, expect, it } from 'vitest'
import {
  executionDate,
  mergeExecutions,
  executionTime,
  newestFirst,
  projectName,
  projectRelativePath,
  taskOf,
} from '@deepseek-ai/dsh-client-rheplicant-ui-console/src/client/project-selectors.ts'
import type { LoopExecutionRef } from '@deepseek-ai/dsh-client-rheplicant-ui-console/src/client/loop-contract.ts'
import type { ProjectExecutionRow } from '@rheplicant/dsh-rheplicant'

const PUBLISHED = '/home/z/rhino-2026/results/tasks/global-signal-fit/20260822T134501Z-3f9ac2b1-k7m2xq'

function ref(overrides: Partial<LoopExecutionRef> = {}): LoopExecutionRef {
  return {
    executionId: '20260822T134501Z-3f9ac2b1-k7m2xq',
    resultsPath: PUBLISHED,
    transport: 'local',
    status: 'ok',
    seq: 4,
    ...overrides,
  }
}

describe('reading the header off a published path', () => {
  it('names the project by the directory that holds results/', () => {
    expect(projectName(PUBLISHED)).toBe('rhino-2026')
  })

  it('takes the task as everything between results/ and the execution', () => {
    expect(taskOf(PUBLISHED)).toBe('tasks/global-signal-fit')
  })

  it('shows the path the way a user would type it', () => {
    expect(projectRelativePath(PUBLISHED))
      .toBe('results/tasks/global-signal-fit/20260822T134501Z-3f9ac2b1-k7m2xq/')
  })

  it('uses the LAST results/ segment, so a project named results still reads', () => {
    const nested = '/home/z/results/results/t/EXEC-1'
    expect(projectName(nested)).toBe('results')
    expect(taskOf(nested)).toBe('t')
  })

  it('reads a Windows-published path too', () => {
    const windows = 'C:\\work\\rhino\\results\\tasks\\fit\\20260822T134501Z-3f9ac2b1-k7m2xq'
    expect(projectName(windows)).toBe('rhino')
    expect(taskOf(windows)).toBe('tasks/fit')
  })

  it.each([undefined, '/home/z/rhino/notes/EXEC-1', '/results'])(
    'returns nothing rather than guessing for %s', (path) => {
      expect(projectName(path)).toBeUndefined()
      expect(taskOf(path)).toBeUndefined()
    })
})

describe('reading the clock off the execution id', () => {
  it('takes the time from the id, not from a file mtime', () => {
    expect(executionTime('20260822T134501Z-3f9ac2b1-k7m2xq')).toBe('13:45:01')
    expect(executionDate('20260822T134501Z-3f9ac2b1-k7m2xq')).toBe('2026-08-22')
  })

  it.each(['no-stamp-here', '', '2026-08-22T13:45:01Z-a-b'])(
    'returns nothing for the unstamped id %s', (id) => {
      expect(executionTime(id)).toBeUndefined()
      expect(executionDate(id)).toBeUndefined()
    })
})

describe('newestFirst', () => {
  it('reverses without touching the snapshot\'s own array', () => {
    const oldestFirst = [ref({ executionId: 'a', seq: 1 }), ref({ executionId: 'b', seq: 2 })]
    expect(newestFirst(oldestFirst).map(row => row.executionId)).toEqual(['b', 'a'])
    expect(oldestFirst.map(row => row.executionId)).toEqual(['a', 'b'])
  })

  it('is empty for a session that has run nothing', () => {
    expect(newestFirst([])).toEqual([])
  })
})

describe('mergeExecutions', () => {
  const row = (id: string, over: Partial<ProjectExecutionRow> = {}): ProjectExecutionRow => ({
    executionId: id,
    task: 'tasks/fit',
    status: 'ok',
    path: `results/tasks/fit/${id}/`,
    ...over,
  })

  it('falls back to this session\'s own list when the project cannot be read', () => {
    const merged = mergeExecutions([ref({ executionId: 'a' }), ref({ executionId: 'b' })], undefined)
    expect(merged.map(m => m.executionId)).toEqual(['b', 'a'])
    expect(merged.every(m => m.fromThisSession)).toBe(true)
  })

  it('offers the project\'s executions, marking which ones this session produced', () => {
    const mine = ref({ executionId: '20260822T120000Z-aa-aaaaaa' })
    const merged = mergeExecutions([mine], [
      row('20260822T130000Z-bb-bbbbbb', { sessionId: 'S-other' }),
      row('20260822T120000Z-aa-aaaaaa'),
    ])
    expect(merged.map(m => [m.executionId, m.fromThisSession])).toEqual([
      ['20260822T130000Z-bb-bbbbbb', false],
      ['20260822T120000Z-aa-aaaaaa', true],
    ])
    expect(merged[0]?.sessionId).toBe('S-other')
  })

  it('keeps the two status axes apart rather than folding them into one', () => {
    // A publication can succeed while a run inside it failed. Collapsing these
    // would make the header claim something neither source said.
    const mine = ref({ executionId: 'x', status: 'failed' })
    const [merged] = mergeExecutions([mine], [row('x', { status: 'ok' })])
    expect(merged?.runsFailed).toBe(true)
    expect(merged?.publication).toBe('ok')
  })

  it('still offers an execution the project listing does not carry', () => {
    // An inline run that published nothing, or one whose tree was pruned. It
    // must not vanish from the console because its results moved.
    const merged = mergeExecutions(
      [ref({ executionId: '20260822T110000Z-zz-zzzzzz', resultsPath: undefined })],
      [row('20260822T130000Z-bb-bbbbbb')],
    )
    expect(merged.map(m => m.executionId))
      .toEqual(['20260822T130000Z-bb-bbbbbb', '20260822T110000Z-zz-zzzzzz'])
    expect(merged[1]?.path).toBeUndefined()
    expect(merged[1]?.fromThisSession).toBe(true)
  })

  it('orders newest first across both sources without reading a clock', () => {
    const merged = mergeExecutions(
      [ref({ executionId: '20260822T090000Z-aa-aaaaaa', resultsPath: undefined })],
      [row('20260822T170000Z-cc-cccccc'), row('20260822T120000Z-bb-bbbbbb')],
    )
    expect(merged.map(m => m.executionId)).toEqual([
      '20260822T170000Z-cc-cccccc',
      '20260822T120000Z-bb-bbbbbb',
      '20260822T090000Z-aa-aaaaaa',
    ])
  })

  it('is empty when neither source has anything', () => {
    expect(mergeExecutions([], [])).toEqual([])
    expect(mergeExecutions([], undefined)).toEqual([])
  })
})

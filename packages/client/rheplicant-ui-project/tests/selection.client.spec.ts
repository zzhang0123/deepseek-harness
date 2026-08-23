import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearSelection,
  proposeSelection,
  readSelection,
  resetSelections,
  selectInProject,
  subscribeSelection,
} from '../src/client/selection.ts'

afterEach(() => { resetSelections() })

const A = 'ws-a'
const B = 'ws-b'

describe('an untouched project', () => {
  it('has selected nothing and pinned nothing', () => {
    expect(readSelection(A)).toEqual({
      taskPath: undefined,
      executionId: undefined,
      pinned: { task: false, execution: false },
    })
  })

  it('is not disturbed by another project being selected', () => {
    selectInProject(A, { taskPath: 'tasks/fit.yaml' })
    expect(readSelection(B).taskPath).toBeUndefined()
  })
})

describe('select — an explicit human choice', () => {
  it('sets the field and pins it', () => {
    selectInProject(A, { executionId: 'E1' })
    expect(readSelection(A)).toMatchObject({
      executionId: 'E1',
      pinned: { task: false, execution: true },
    })
  })

  it('pins only the fields it names', () => {
    selectInProject(A, { taskPath: 'tasks/fit.yaml' })
    expect(readSelection(A).pinned).toEqual({ task: true, execution: false })
  })

  it('replaces an earlier explicit choice', () => {
    selectInProject(A, { executionId: 'E1' })
    selectInProject(A, { executionId: 'E2' })
    expect(readSelection(A).executionId).toBe('E2')
  })

  it('can set both axes at once, as opening a task from a listing does', () => {
    selectInProject(A, { taskPath: 'tasks/fit.yaml', executionId: 'E1' })
    expect(readSelection(A)).toMatchObject({
      taskPath: 'tasks/fit.yaml',
      executionId: 'E1',
      pinned: { task: true, execution: true },
    })
  })
})

describe('propose — the default rule', () => {
  it('fills a field nobody has pinned', () => {
    // "Show me what I just ran" is a DEFAULT, and this is what makes it one.
    proposeSelection(A, { executionId: 'E1' })
    expect(readSelection(A).executionId).toBe('E1')
  })

  it('leaves a pinned field alone', () => {
    // The whole point of the split: a finished run must not yank the view away
    // from the execution someone deliberately opened.
    selectInProject(A, { executionId: 'E1' })
    proposeSelection(A, { executionId: 'E2' })
    expect(readSelection(A).executionId).toBe('E1')
  })

  it('never pins, so a later proposal can still move it', () => {
    proposeSelection(A, { executionId: 'E1' })
    expect(readSelection(A).pinned.execution).toBe(false)
    proposeSelection(A, { executionId: 'E2' })
    expect(readSelection(A).executionId).toBe('E2')
  })

  it('fills the unpinned axis while respecting the pinned one', () => {
    selectInProject(A, { taskPath: 'tasks/fit.yaml' })
    proposeSelection(A, { taskPath: 'tasks/other.yaml', executionId: 'E1' })
    expect(readSelection(A)).toMatchObject({
      taskPath: 'tasks/fit.yaml',
      executionId: 'E1',
    })
  })
})

describe('clear — going back to following', () => {
  it('drops the selection and every pin', () => {
    selectInProject(A, { taskPath: 'tasks/fit.yaml', executionId: 'E1' })
    clearSelection(A)
    expect(readSelection(A)).toEqual({
      taskPath: undefined,
      executionId: undefined,
      pinned: { task: false, execution: false },
    })
  })

  it('lets a proposal take effect again afterwards', () => {
    selectInProject(A, { executionId: 'E1' })
    clearSelection(A)
    proposeSelection(A, { executionId: 'E2' })
    expect(readSelection(A).executionId).toBe('E2')
  })

  it('touches only the project named', () => {
    selectInProject(A, { executionId: 'E1' })
    selectInProject(B, { executionId: 'E2' })
    clearSelection(A)
    expect(readSelection(B).executionId).toBe('E2')
  })
})

describe('subscribers', () => {
  it('wake when a selection really changes', () => {
    const woke = vi.fn()
    subscribeSelection(woke)
    selectInProject(A, { executionId: 'E1' })
    expect(woke).toHaveBeenCalledTimes(1)
  })

  it('stay asleep for a write that changed nothing', () => {
    selectInProject(A, { executionId: 'E1' })
    const woke = vi.fn()
    subscribeSelection(woke)
    selectInProject(A, { executionId: 'E1' })
    expect(woke).not.toHaveBeenCalled()
  })

  it('stay asleep for a proposal a pin refused', () => {
    selectInProject(A, { executionId: 'E1' })
    const woke = vi.fn()
    subscribeSelection(woke)
    proposeSelection(A, { executionId: 'E2' })
    expect(woke).not.toHaveBeenCalled()
  })

  it('keep the same state object when nothing changed, for useSyncExternalStore', () => {
    selectInProject(A, { executionId: 'E1' })
    const first = readSelection(A)
    proposeSelection(A, { executionId: 'E2' })
    expect(readSelection(A)).toBe(first)
  })

  it('stop waking once unsubscribed', () => {
    const woke = vi.fn()
    subscribeSelection(woke)()
    selectInProject(A, { executionId: 'E1' })
    expect(woke).not.toHaveBeenCalled()
  })
})

describe('what a selection refuses to be', () => {
  it('ignores an empty workspace id rather than keying a project named ""', () => {
    selectInProject('', { executionId: 'E1' })
    expect(readSelection('').executionId).toBeUndefined()
  })

  it('ignores an empty patch rather than pinning nothing', () => {
    selectInProject(A, {})
    expect(readSelection(A).pinned).toEqual({ task: false, execution: false })
  })
})

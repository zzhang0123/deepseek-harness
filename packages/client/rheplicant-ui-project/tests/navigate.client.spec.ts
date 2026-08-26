/**
 * Opening a project.
 *
 * **This file shrank on 2026-08-26 and the deletions are the point.** It used
 * to assert, at length, that `openProject` carried a task and an execution
 * into the conversation it opened — that the selection was set, pinned, kept
 * per project, and not invented when absent. Every one of those specs passed,
 * and every one of them guarded a journey that ended nowhere: a blank
 * conversation renders nothing about the selection, and the selection is
 * browser-half only, so the agent could not read it either. `openProject` no
 * longer takes a target, so those specs are gone rather than left standing as
 * coverage of a parameter no caller passes.
 *
 * What survives is what the action still promises: connect, open, and close
 * the section — in that order, and only when connecting worked.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { canNavigate, openProject, setNavigator, type Navigator } from '../src/client/navigate.ts'
import { openHome, readHome, resetHome } from '../src/client/home-store.ts'
import { readSelection, resetSelections, selectInProject } from '../src/client/selection.ts'

afterEach(() => { setNavigator(undefined); resetHome(); resetSelections() })

/** A navigator that records the order every capability was called in. */
function recording(over: Partial<Navigator> = {}) {
  const order: string[] = []
  const navigator: Navigator = {
    connect: (workspaceId) => {
      order.push(`connect:${workspaceId}`)
      return Promise.resolve('S-for-' + workspaceId)
    },
    open: (sessionId) => { order.push(`open:${sessionId}`) },
    ...over,
  }
  setNavigator(navigator)
  return order
}

describe('without a navigator', () => {
  it('reports that it cannot open anything', () => {
    expect(canNavigate()).toBe(false)
  })

  it('does nothing rather than throwing, so the workbench stays usable', async () => {
    openHome('ws-1')
    await expect(openProject('ws-1')).resolves.toBeUndefined()
    expect(readHome().section).toBe('workbench')
  })
})

describe('opening a project', () => {
  it('reports that it can', () => {
    recording()
    expect(canNavigate()).toBe(true)
  })

  it('connects, then opens', async () => {
    const order = recording()
    await openProject('ws-1')
    expect(order).toEqual(['connect:ws-1', 'open:S-for-ws-1'])
  })

  it('leaves the section once the jump succeeded', async () => {
    recording()
    openHome('ws-1')
    await openProject('ws-1')
    expect(readHome().section).toBe('conversation')
  })

  it('touches no selection at all, in this project or any other', async () => {
    // It used to set one. Nothing downstream could read it, so now it does
    // not — and a caller who still believes it does would be wrong in a way
    // only this spec can say out loud.
    recording()
    selectInProject('ws-2', { executionId: 'OTHER' })
    await openProject('ws-1')
    expect(readSelection('ws-1').executionId).toBeUndefined()
    expect(readSelection('ws-1').taskPath).toBeUndefined()
    expect(readSelection('ws-2').executionId).toBe('OTHER')
  })
})

describe('when connecting fails', () => {
  it('leaves the section OPEN, because there is nowhere to have gone', async () => {
    setNavigator({
      connect: () => Promise.reject(new Error('offline')),
      open: vi.fn(),
    })
    openHome('ws-1')
    await expect(openProject('ws-1')).rejects.toThrow('offline')
    expect(readHome().section).toBe('workbench')
  })

  it('never opens a session it could not connect', async () => {
    const open = vi.fn()
    setNavigator({ connect: () => Promise.reject(new Error('offline')), open })
    await expect(openProject('ws-1')).rejects.toThrow('offline')
    expect(open).not.toHaveBeenCalled()
  })
})

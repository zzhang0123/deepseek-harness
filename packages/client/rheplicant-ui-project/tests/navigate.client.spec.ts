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

  it('does nothing rather than throwing, so the home stays a usable chooser', async () => {
    openHome('ws-1')
    await expect(openProject('ws-1', { executionId: 'EXEC-1' })).resolves.toBeUndefined()
    expect(readHome().open).toBe(true)
  })

  it('sets no selection either — nothing happened, so nothing is claimed', async () => {
    await openProject('ws-1', { executionId: 'EXEC-1' })
    expect(readSelection('ws-1').executionId).toBeUndefined()
  })
})

describe('opening a project', () => {
  it('reports that it can', () => {
    recording()
    expect(canNavigate()).toBe(true)
  })

  it('sets the PROJECT selection, addressed to no session at all', async () => {
    // The heart of §11.2. P6 had to ask a particular session's console to show
    // an execution; a project-owned selection is simply already correct for
    // whichever surface renders next.
    recording()
    await openProject('ws-1', { executionId: 'EXEC-1' })
    expect(readSelection('ws-1')).toMatchObject({
      executionId: 'EXEC-1',
      pinned: { execution: true },
    })
  })

  it('pins it, because clicking a row is an explicit human choice', async () => {
    // So a run finishing in the background cannot pull the view off it.
    recording()
    await openProject('ws-1', { executionId: 'EXEC-1' })
    expect(readSelection('ws-1').pinned.execution).toBe(true)
  })

  it('connects, then opens', async () => {
    const order = recording()
    await openProject('ws-1', { executionId: 'EXEC-1' })
    expect(order).toEqual(['connect:ws-1', 'open:S-for-ws-1'])
  })

  it('sets no selection when no execution was named', async () => {
    recording()
    await openProject('ws-1')
    expect(readSelection('ws-1').executionId).toBeUndefined()
  })

  it('closes the home once the jump succeeded', async () => {
    recording()
    openHome('ws-1')
    await openProject('ws-1', { executionId: 'EXEC-1' })
    expect(readHome().open).toBe(false)
  })

  it('keeps each project\'s selection to itself', async () => {
    recording()
    selectInProject('ws-2', { executionId: 'OTHER' })
    await openProject('ws-1', { executionId: 'EXEC-1' })
    expect(readSelection('ws-2').executionId).toBe('OTHER')
  })
})

describe('when connecting fails', () => {
  it('leaves the home OPEN, because there is nowhere to have gone', async () => {
    setNavigator({
      connect: () => Promise.reject(new Error('offline')),
      open: vi.fn(),
    })
    openHome('ws-1')
    await expect(openProject('ws-1', { executionId: 'EXEC-1' })).rejects.toThrow('offline')
    expect(readHome().open).toBe(true)
  })

  it('never opens a session it could not connect', async () => {
    const open = vi.fn()
    setNavigator({ connect: () => Promise.reject(new Error('offline')), open })
    await expect(openProject('ws-1')).rejects.toThrow('offline')
    expect(open).not.toHaveBeenCalled()
  })
})

describe('aiming at the session that produced the execution', () => {
  it('opens that session directly and never connects the workspace', async () => {
    // Still the best landing spot while the workbench does not exist: a blank
    // session mounts no console tab, so there would be nothing to render the
    // selection. §11.5 records that this goes away in P7b.
    const order = recording()
    await openProject('ws-1', { executionId: 'EXEC-1', inSession: 'S-produced' })
    expect(order).toEqual(['open:S-produced'])
    expect(readSelection('ws-1').executionId).toBe('EXEC-1')
  })

  it('falls back to connecting when no producing session was given', async () => {
    const order = recording()
    await openProject('ws-1', { executionId: 'EXEC-1' })
    expect(order[0]).toBe('connect:ws-1')
  })

  it('treats an empty session id as no session, not as one named ""', async () => {
    const order = recording()
    await openProject('ws-1', { executionId: 'EXEC-1', inSession: '' })
    expect(order[0]).toBe('connect:ws-1')
  })
})

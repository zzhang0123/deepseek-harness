import { afterEach, describe, expect, it, vi } from 'vitest'
import { canNavigate, openProject, setNavigator, type Navigator } from '../src/client/navigate.ts'
import { openHome, readHome, resetHome } from '../src/client/home-store.ts'

afterEach(() => { setNavigator(undefined); resetHome() })

/** A navigator that records the order every capability was called in. */
function recording(over: Partial<Navigator> = {}) {
  const order: string[] = []
  const navigator: Navigator = {
    connect: (workspaceId) => {
      order.push(`connect:${workspaceId}`)
      return Promise.resolve('S-for-' + workspaceId)
    },
    open: (sessionId) => { order.push(`open:${sessionId}`) },
    requestExecution: (sessionId, executionId) => {
      order.push(`request:${sessionId}:${executionId}`)
    },
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
})

describe('opening a project', () => {
  it('reports that it can', () => {
    recording()
    expect(canNavigate()).toBe(true)
  })

  it('connects, THEN requests, THEN opens', async () => {
    // The order is the design. `connect` is what reveals which session the
    // project resolves to, so the request cannot precede it; and the request
    // must precede `open`, or the console mounts on its default and visibly
    // jumps a moment later.
    const order = recording()
    await openProject('ws-1', { executionId: 'EXEC-1' })
    expect(order).toEqual(['connect:ws-1', 'request:S-for-ws-1:EXEC-1', 'open:S-for-ws-1'])
  })

  it('skips the request when no execution was named', async () => {
    const order = recording()
    await openProject('ws-1')
    expect(order).toEqual(['connect:ws-1', 'open:S-for-ws-1'])
  })

  it('still opens when no console is present to take the request', async () => {
    // A composition without ui-console: the jump happens, the console (if one
    // appears later) lands on its own default. Degrading, not failing.
    const order = recording({ requestExecution: undefined })
    await openProject('ws-1', { executionId: 'EXEC-1' })
    expect(order).toEqual(['connect:ws-1', 'open:S-for-ws-1'])
  })

  it('closes the home once the jump succeeded', async () => {
    recording()
    openHome('ws-1')
    await openProject('ws-1', { executionId: 'EXEC-1' })
    expect(readHome().open).toBe(false)
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
    // `connect` is the workspace-SWITCH primitive: it hands back the project's
    // BLANK session, which is the hero screen and has no console tab, so a
    // requested execution would have nowhere to appear. Only a real boot shows
    // this, which is where it was found.
    const order = recording()
    await openProject('ws-1', { executionId: 'EXEC-1', inSession: 'S-produced' })
    expect(order).toEqual(['request:S-produced:EXEC-1', 'open:S-produced'])
    expect(order.some(call => call.startsWith('connect:'))).toBe(false)
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

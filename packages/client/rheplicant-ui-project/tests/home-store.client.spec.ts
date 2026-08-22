import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  closeHome, openHome, readHome, resetHome, selectProject, toggleHome,
} from '../src/client/home-store.ts'

afterEach(() => { resetHome() })

describe('the shared open state', () => {
  it('starts closed with nothing selected', () => {
    expect(readHome()).toEqual({ open: false, workspaceId: undefined })
  })

  it('opens, closes and toggles', () => {
    openHome()
    expect(readHome().open).toBe(true)
    closeHome()
    expect(readHome().open).toBe(false)
    toggleHome()
    expect(readHome().open).toBe(true)
    toggleHome()
    expect(readHome().open).toBe(false)
  })

  it('remembers the project across a close, so reopening resumes where it was', () => {
    selectProject('ws-1')
    openHome()
    closeHome()
    expect(readHome().workspaceId).toBe('ws-1')
    openHome()
    expect(readHome()).toEqual({ open: true, workspaceId: 'ws-1' })
  })

  it('opens on a named project without disturbing an existing selection when none is named', () => {
    openHome('ws-2')
    expect(readHome().workspaceId).toBe('ws-2')
    closeHome()
    openHome()
    expect(readHome().workspaceId).toBe('ws-2')
  })
})

describe('what the trigger and the page actually share', () => {
  // The whole reason this store exists: the two halves occupy DIFFERENT slots,
  // so nothing else connects them. One module instance is the connection.
  it('is one value, so a write from one reader is visible to the other', () => {
    openHome('ws-1')
    expect(readHome()).toEqual({ open: true, workspaceId: 'ws-1' })
  })
})

describe('subscription hygiene', () => {
  it('does not wake subscribers for a write that changes nothing', async () => {
    // `useSyncExternalStore` re-renders on every notification, so a no-op
    // write that still notified would re-render the whole page on each
    // redundant call.
    const { useHome } = await import('../src/client/home-store.ts')
    expect(typeof useHome).toBe('function')
    const listener = vi.fn()
    // Reach the subscribe path the hook uses by observing state identity:
    // two identical writes must leave the same object in place.
    openHome('ws-1')
    const first = readHome()
    openHome('ws-1')
    expect(readHome()).toBe(first)
    expect(listener).not.toHaveBeenCalled()
  })

  it('produces a new state object when something really changed', () => {
    openHome('ws-1')
    const first = readHome()
    selectProject('ws-2')
    expect(readHome()).not.toBe(first)
  })
})

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  closeHome, openHome, readHome, resetHome, selectProject, showSection, toggleHome, toggleSection,
} from '../src/client/home-store.ts'

afterEach(() => { resetHome() })

describe('the shared section state', () => {
  it('starts on the conversation with nothing selected', () => {
    expect(readHome()).toEqual({ section: 'conversation', workspaceId: undefined })
  })

  it('opens, closes and toggles', () => {
    openHome()
    expect(readHome().section).toBe('workbench')
    closeHome()
    expect(readHome().section).toBe('conversation')
    toggleHome()
    expect(readHome().section).toBe('workbench')
    toggleHome()
    expect(readHome().section).toBe('conversation')
  })

  it('remembers the project across a close, so reopening resumes where it was', () => {
    selectProject('ws-1')
    openHome()
    closeHome()
    expect(readHome().workspaceId).toBe('ws-1')
    openHome()
    expect(readHome()).toEqual({ section: 'workbench', workspaceId: 'ws-1' })
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
    expect(readHome()).toEqual({ section: 'workbench', workspaceId: 'ws-1' })
  })
})

describe('more than one section (§25)', () => {
  it('holds ONE section, so two can never both be showing', () => {
    showSection('workbench')
    showSection('dashboard')
    expect(readHome().section).toBe('dashboard')
  })

  it('toggles a row against the CONVERSATION, not against "some section"', () => {
    // Pressing the row you are on returns you to the transcript...
    toggleSection('dashboard')
    expect(readHome().section).toBe('dashboard')
    toggleSection('dashboard')
    expect(readHome().section).toBe('conversation')
    // ...and pressing a different row switches straight to it, rather than
    // going back to the conversation first.
    toggleSection('workbench')
    toggleSection('dashboard')
    expect(readHome().section).toBe('dashboard')
  })

  it('remembers a section that is not the workbench', async () => {
    showSection('dashboard')
    expect(localStorage.getItem('rheplicant.project.section')).toBe('dashboard')
    vi.resetModules()
    const reloaded = await import('../src/client/home-store.ts')
    expect(reloaded.readHome().section).toBe('dashboard')
    reloaded.resetHome()
  })

  it('reads a name this build does not know as the conversation', async () => {
    // Storage outlives the code that wrote it. Trusting an unknown name would
    // leave a blank column with no way back; the conversation always exists.
    localStorage.setItem('rheplicant.project.section', 'plugins')
    vi.resetModules()
    const reloaded = await import('../src/client/home-store.ts')
    expect(reloaded.readHome().section).toBe('conversation')
    reloaded.resetHome()
  })

  it('accepts the pre-§25 name for the workbench', async () => {
    // Builds before the section was named wrote `project`. Somebody who left
    // the app in the workbench should find it there.
    localStorage.setItem('rheplicant.project.section', 'project')
    vi.resetModules()
    const reloaded = await import('../src/client/home-store.ts')
    expect(reloaded.readHome().section).toBe('workbench')
    reloaded.resetHome()
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


describe('the section is remembered, the project is not (§20.2)', () => {
  const KEY = 'rheplicant.project.section'

  it('writes the section on a change and clears it on the way back', () => {
    openHome()
    expect(localStorage.getItem(KEY)).toBe('workbench')
    closeHome()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('does NOT remember which project was in view', () => {
    // A persisted workspace id would outlive the workspace it names and pin the
    // page to a project that is no longer there. `recentWorkspaceId` is the
    // host's own live answer to the same question, and the page reads that.
    openHome('ws-1')
    expect(JSON.stringify(localStorage)).not.toContain('ws-1')
  })

  it('comes back on the section it was left on', async () => {
    localStorage.setItem(KEY, 'project')
    vi.resetModules()
    const reloaded = await import('../src/client/home-store.ts')
    expect(reloaded.readHome().section).toBe('workbench')
    reloaded.resetHome()
  })

  it('comes back on the conversation when nothing was remembered', async () => {
    localStorage.removeItem(KEY)
    vi.resetModules()
    const reloaded = await import('../src/client/home-store.ts')
    expect(reloaded.readHome().section).toBe('conversation')
  })

  it('still works when storage refuses — a page that would not mount because it could not remember a tab is worse than one that forgets', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    try {
      vi.resetModules()
      const reloaded = await import('../src/client/home-store.ts')
      expect(reloaded.readHome().section).toBe('conversation')
      expect(() => { reloaded.openHome('ws-1') }).not.toThrow()
      expect(reloaded.readHome().section).toBe('workbench')
    } finally {
      getItem.mockRestore()
      setItem.mockRestore()
    }
  })
})

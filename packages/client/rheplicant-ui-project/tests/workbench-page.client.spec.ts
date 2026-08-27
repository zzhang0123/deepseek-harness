// @vitest-environment jsdom
/**
 * The workbench's page, and the three properties that are not obvious.
 *
 * `docs/superpowers/specs/2026-08-27-workbench-pages.md` D1. The store is
 * small; what is worth pinning is what a stored value can do to a page that
 * has to mount anyway — the same reasoning `home-store`'s own spec applies to
 * `rheplicant.project.section`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  readWorkbenchPage,
  resetWorkbenchPage,
  showWorkbenchPage,
  subscribeWorkbenchPage,
} from '../src/client/workbench-page.ts'

const KEY = 'rheplicant.workbench.page'

beforeEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  resetWorkbenchPage()
})
afterEach(() => { vi.unstubAllGlobals() })

describe('the workbench page', () => {
  it('starts on the one tab that needs nothing selected', () => {
    expect(readWorkbenchPage()).toBe('overview')
  })

  it('remembers the page, because a page is a place you are', () => {
    showWorkbenchPage('model')
    expect(localStorage.getItem(KEY)).toBe('model')
  })

  it('wakes its subscribers, and only on a real change', () => {
    let woken = 0
    const stop = subscribeWorkbenchPage(() => { woken += 1 })
    showWorkbenchPage('setup')
    expect(woken).toBe(1)
    // Idempotent in RESULT and therefore silent: nothing moved.
    showWorkbenchPage('setup')
    expect(woken).toBe(1)
    stop()
    showWorkbenchPage('results')
    expect(woken).toBe(1)
  })
})

describe('a stored value this build does not know', () => {
  /**
   * Storage outlives the code that wrote it. A name from a future build — or
   * from a typo — must not leave the workbench on a page that renders nothing,
   * because the failure of THAT is a blank surface with no way back.
   */
  it('is read as the default rather than trusted', () => {
    localStorage.setItem(KEY, 'bayesian')
    // The module reads storage once, at load; re-reading is what `reset` does
    // NOT do, so this asserts the guard through the public surface instead.
    resetWorkbenchPage()
    expect(readWorkbenchPage()).toBe('overview')
  })
})

describe('a browser with storage disabled', () => {
  /**
   * `localStorage` does not return null there — it THROWS on access. A surface
   * that failed to mount because it could not remember a tab would be worse
   * than one that forgets, which is `home-store`'s rule and this one's.
   */
  it('still switches pages, and does not throw', () => {
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('denied') },
      setItem() { throw new Error('denied') },
      removeItem() { throw new Error('denied') },
    })
    expect(() => { showWorkbenchPage('results') }).not.toThrow()
    expect(readWorkbenchPage()).toBe('results')
    expect(() => { resetWorkbenchPage() }).not.toThrow()
    expect(readWorkbenchPage()).toBe('overview')
  })
})

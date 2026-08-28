// @vitest-environment jsdom
/**
 * The schedules board's one ACTION that is not the switch: opening the session
 * a routine's firing already opened.
 *
 * The control this replaces was built, then removed, because of what such a
 * session would KNOW — nothing. This one is the opposite case and the tests
 * say which: it renders only where there is a real session to reach, and it
 * does not claim that session is still there.
 */
import type { ComponentProps } from 'react'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Schedules } from '../src/client/Schedules.tsx'
import { resetHome, showSection } from '../src/client/home-store.ts'
import { setNavigator } from '../src/client/navigate.ts'

/** Every session id the page asked the host to open, in order. */
let openedSessions: string[]
/** Every workspace id the page asked the host to connect. */
let connected: string[]

afterEach(() => { cleanup(); resetHome(); setNavigator(undefined); vi.unstubAllGlobals() })
beforeEach(() => {
  vi.unstubAllGlobals()
  resetHome()
  openedSessions = []
  connected = []
  setNavigator({
    connect: (workspaceId) => { connected.push(workspaceId); return Promise.resolve('session-blank') },
    open: (sessionId) => { openedSessions.push(sessionId) },
    canReveal: () => false,
    reveal: () => Promise.resolve(),
  })
})

const WORKSPACES = [{ workspaceId: 'ws-1', title: 'rhino-2026', path: '/host/rhino-2026' }]

/** One routine row, with only what an assertion needs stated. */
function routine(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'dawn-brief', action: 'routine', prompt: 'Check the overnight fits',
    cadence: 'PT30M', cadenceKind: 'every', enabled: true, ...over,
  }
}

/** Serve one project whose registry holds exactly these rows. */
function serve(triggers: readonly Record<string, unknown>[]): void {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const parsed = new URL(url, 'http://x')
    if (parsed.pathname.endsWith('/triggers')) {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ project: 'rhino', state: 'ok', triggers }),
      })
    }
    return Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({
        project: 'rhino', tasks: [], inputs: [], executions: [], truncated: false,
      }),
    })
  }))
}

/** Render the board on its own section. */
function mount() {
  const state = { items: WORKSPACES }
  const useWorkspaces = <T,>(selector: (value: typeof state) => T): T => selector(state)
  showSection('schedules')
  return render(
    <Schedules {...({ useWorkspaces } as unknown as ComponentProps<typeof Schedules>)} />,
  )
}

/** The card for one trigger, once the projects have landed. */
async function card(container: HTMLElement, name: string): Promise<HTMLElement> {
  await waitFor(() => { expect(container.querySelector(`[data-schedule="${name}"]`)).not.toBeNull() })
  return container.querySelector<HTMLElement>(`[data-schedule="${name}"]`)!
}

describe('the control that opens a routine’s session', () => {
  it('opens exactly the session the firing recorded', async () => {
    serve([routine({ lastSessionId: 'session-42' })])
    const { container } = mount()
    const found = await card(container, 'dawn-brief')

    fireEvent.click(found.querySelector<HTMLElement>('[data-schedule-open-session]')!)

    expect(openedSessions).toEqual(['session-42'])
    // NOT the project's blank session, which is what the removed control did
    // and the reason it was removed: it knew nothing about the schedule.
    expect(connected).toEqual([])
  })

  it('leaves the board for that session, rather than opening it behind the board', async () => {
    serve([routine({ lastSessionId: 'session-42' })])
    const { container } = mount()
    const found = await card(container, 'dawn-brief')
    fireEvent.click(found.querySelector<HTMLElement>('[data-schedule-open-session]')!)
    await waitFor(() => {
      expect(container.querySelector('[data-schedule="dawn-brief"]')).toBeNull()
    })
  })
})

describe('when the control does NOT exist, and the three different reasons', () => {
  it('a routine that has not fired has no session to open yet', async () => {
    serve([routine()])
    const { container } = mount()
    const found = await card(container, 'dawn-brief')
    expect(found.querySelector('[data-schedule-open-session]')).toBeNull()
    // The card is otherwise complete: this is an absent control, not a broken
    // card.
    expect(found.querySelector('[data-schedule-toggle]')).not.toBeNull()
  })

  it('a task trigger opens no session at all', async () => {
    // Even if a hand-edited registry put one on the record, the host does not
    // send it — and the surface would not render it if it did.
    serve([{
      name: 'nightly', action: 'run', task: 'tasks/fit.yaml',
      cadence: 'P1D', cadenceKind: 'every', enabled: true, lastSessionId: 'session-not-ours',
    }])
    const { container } = mount()
    const found = await card(container, 'nightly')
    expect(found.querySelector('[data-schedule-open-session]')).toBeNull()
  })

  it('a page with no navigator cannot open anything', async () => {
    // `navigate.ts`'s honest degradation for a composition mounted without a
    // conversation surface: the rows render, they just do not offer to go
    // anywhere.
    setNavigator(undefined)
    serve([routine({ lastSessionId: 'session-42' })])
    const { container } = mount()
    const found = await card(container, 'dawn-brief')
    expect(found.querySelector('[data-schedule-open-session]')).toBeNull()
    expect(found.querySelector('[data-schedule-toggle]')).not.toBeNull()
  })
})

describe('what the control does not claim', () => {
  it('offers to open a session for a routine that is switched OFF', async () => {
    // Disabled says nothing about the transcript of what it already did. A
    // routine somebody paused is exactly the one whose last run they want to
    // read.
    serve([routine({ enabled: false, lastSessionId: 'session-42' })])
    const { container } = mount()
    const found = await card(container, 'dawn-brief')
    expect(found.querySelector('[data-schedule-open-session]')).not.toBeNull()
  })

  it('asks the host rather than checking the session is still there', async () => {
    // A session can be deleted from the sidebar while the record still names
    // it. The page has no way to know and does not pretend to: it asks, and
    // the host answers. What must NOT happen is a fetch of its own.
    serve([routine({ lastSessionId: 'session-gone' })])
    const { container } = mount()
    const found = await card(container, 'dawn-brief')
    const before = (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length

    fireEvent.click(found.querySelector<HTMLElement>('[data-schedule-open-session]')!)

    expect(openedSessions).toEqual(['session-gone'])
    expect((globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length)
      .toBe(before)
  })
})

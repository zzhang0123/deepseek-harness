// @vitest-environment jsdom
/**
 * The dashboard's tab row: Setups and Runs, and the wiring that turns a pair
 * of styled buttons into a widget a keyboard can drive.
 *
 * The first render spec this surface has had. It exists because the tab
 * pattern lives in TWO places — here and on the workbench — and a shared
 * module tested only through one of its callers is a module whose other caller
 * is free to spread the wrong props, or none.
 */
import type { ComponentProps } from 'react'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Dashboard } from '../src/client/Dashboard.tsx'
import { resetHome, showSection } from '../src/client/home-store.ts'

afterEach(() => { cleanup(); resetHome(); vi.unstubAllGlobals() })
beforeEach(() => { vi.unstubAllGlobals(); resetHome() })

const WORKSPACES = [{ workspaceId: 'ws-1', title: 'rhino-2026', path: '/host/rhino-2026' }]

/** One project with a task and a run, so both tables have a row to show. */
function serve(over: Record<string, unknown> = {}): void {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const parsed = new URL(url, 'http://x')
    if (parsed.pathname.endsWith('/triggers')) {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ state: 'absent', triggers: [] }),
      })
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        project: 'rhino',
        tasks: [{ path: 'rhino-fit.yaml', bytes: 120, modifiedAt: 'x', executionCount: 1 }],
        inputs: [],
        executions: [{
          executionId: 'rhino-E1', task: 'rhino-fit', status: 'ok',
          path: 'results/rhino-fit/rhino-E1/',
        }],
        truncated: false,
        ...over,
      }),
    })
  }))
}

/**
 * Go to the Setups tab. A first visit lands on Runs, so a test that wants the
 * task table says so rather than finding an empty query and reading it as an
 * absent column.
 */
async function onSetups(container: HTMLElement): Promise<void> {
  const row = await tabRow(container)
  fireEvent.keyDown(row, { key: 'Home' })
  await waitFor(() => {
    expect(container.querySelector('[data-table="setups"]')).not.toBeNull()
  })
}

/** An ISO instant a fixed number of milliseconds before the render. */
function msAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString()
}

/** Render the dashboard on its own section, over one workspace. */
function mount() {
  const state = { items: WORKSPACES }
  const useWorkspaces = <T,>(selector: (value: typeof state) => T): T => selector(state)
  showSection('dashboard')
  return render(
    <Dashboard {...({ useWorkspaces } as unknown as ComponentProps<typeof Dashboard>)} />,
  )
}

/** The tab row, once the projects have landed. */
async function tabRow(container: HTMLElement): Promise<HTMLElement> {
  await waitFor(() => { expect(container.querySelector('[role="tablist"]')).not.toBeNull() })
  return container.querySelector<HTMLElement>('[role="tablist"]')!
}

describe('the tab row as a widget rather than two styled buttons', () => {
  it('owns tabs and nothing else', async () => {
    serve()
    const { container } = mount()
    const row = await tabRow(container)
    const children = [...row.children]
    expect(children.length).toBeGreaterThan(0)
    expect(children.every(child => child.getAttribute('role') === 'tab')).toBe(true)
  })

  it('puts exactly one tab in the tab sequence', async () => {
    // Without this, Tab walks the row; with it, Tab leaves the row for the
    // table the row is about.
    serve()
    const { container } = mount()
    const row = await tabRow(container)
    const tabbable = [...row.querySelectorAll('[role="tab"]')]
      .filter(tab => tab.getAttribute('tabindex') === '0')
    expect(tabbable).toHaveLength(1)
    expect(tabbable[0]?.getAttribute('aria-selected')).toBe('true')
  })

  it('names a region, and that region names it back', async () => {
    serve()
    const { container } = mount()
    const row = await tabRow(container)
    const selected = row.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')!
    const panelId = selected.getAttribute('aria-controls')!
    const panel = container.querySelector(`#${panelId}`)
    expect(panel).not.toBeNull()
    expect(panel?.getAttribute('role')).toBe('tabpanel')
    expect(panel?.getAttribute('aria-labelledby')).toBe(selected.id)
  })

  it('makes that region reachable from the keyboard', async () => {
    // It is the scrollport for a table that can run past the fold.
    serve()
    const { container } = mount()
    const row = await tabRow(container)
    const panelId = row.querySelector('[role="tab"][aria-selected="true"]')!.getAttribute('aria-controls')!
    expect(container.querySelector(`#${panelId}`)?.getAttribute('tabindex')).toBe('0')
  })
})

describe('the arrow keys', () => {
  it('moves to the next tab and shows it', async () => {
    serve()
    const { container } = mount()
    const row = await tabRow(container)
    // Runs is the tab a first visit lands on.
    expect(container.querySelector('[data-dashboard-tab="runs"]')?.getAttribute('aria-selected'))
      .toBe('true')
    fireEvent.keyDown(row, { key: 'ArrowRight' })
    await waitFor(() => {
      expect(container.querySelector('[data-dashboard-tab="setups"]')?.getAttribute('aria-selected'))
        .toBe('true')
    })
  })

  it('takes the focus with it, so the next arrow moves from where the eye is', async () => {
    // Automatic activation without moving focus leaves the ring behind on a
    // tab that is no longer selected, and the second arrow then steps from
    // the wrong place.
    serve()
    const { container } = mount()
    const row = await tabRow(container)
    fireEvent.keyDown(row, { key: 'ArrowRight' })
    await waitFor(() => {
      expect(document.activeElement?.getAttribute('data-dashboard-tab')).toBe('setups')
    })
  })

  it('wraps, and Home and End reach both ends', async () => {
    serve()
    const { container } = mount()
    const row = await tabRow(container)
    const selected = () =>
      container.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('data-dashboard-tab')

    fireEvent.keyDown(row, { key: 'ArrowRight' })          // runs -> setups
    await waitFor(() => { expect(selected()).toBe('setups') })
    fireEvent.keyDown(row, { key: 'ArrowLeft' })           // setups -> runs (wrap)
    await waitFor(() => { expect(selected()).toBe('runs') })
    fireEvent.keyDown(row, { key: 'Home' })
    await waitFor(() => { expect(selected()).toBe('setups') })
    fireEvent.keyDown(row, { key: 'End' })
    await waitFor(() => { expect(selected()).toBe('runs') })
  })

  it('leaves a key that is not its own alone', async () => {
    serve()
    const { container } = mount()
    const row = await tabRow(container)
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    row.dispatchEvent(event)
    // Not swallowed: ArrowDown scrolls the table underneath.
    expect(event.defaultPrevented).toBe(false)
    expect(container.querySelector('[data-dashboard-tab="runs"]')?.getAttribute('aria-selected'))
      .toBe('true')
  })
})


describe('the column each table is ordered by', () => {
  it('shows when a task was modified, with the instant underneath', async () => {
    // The table sorts on `modifiedAt` and used to show a file size and a
    // project name — so the order was one nothing on screen explained.
    serve({ tasks: [{ path: 'rhino-fit.yaml', bytes: 120, modifiedAt: msAgo(8 * 60_000), executionCount: 1 }] })
    const { container } = mount()
    await onSetups(container)
    const row = container.querySelector('[data-task-open] [data-row-since]')!
    expect(row).not.toBeNull()
    expect(row.getAttribute('data-row-since')).toBe('8 min ago')
    // The exact instant is what a reader needs once they have picked the row.
    expect(row.getAttribute('title')).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('shows when a run started', async () => {
    serve({
      executions: [{
        executionId: 'rhino-E1', task: 'rhino-fit', status: 'ok',
        path: 'results/rhino-fit/rhino-E1/', startedAt: msAgo(3 * 3_600_000),
      }],
    })
    const { container } = mount()
    await waitFor(() => {
      expect(container.querySelector('[data-execution-open] [data-row-since]')
        ?.getAttribute('data-row-since')).toBe('3 h ago')
    })
  })

  it('says unknown, and offers no tooltip, when nothing recorded an instant', async () => {
    // A sidecar written before the field existed. `unknown` with a tooltip
    // repeating it would promise something exact underneath.
    serve()
    const { container } = mount()
    const cell = await waitFor(() => {
      const found = container.querySelector('[data-execution-open] [data-row-since]')
      expect(found).not.toBeNull()
      return found!
    })
    expect(cell.getAttribute('data-row-since')).toBe('unknown')
    expect(cell.getAttribute('title')).toBeNull()
  })

  it('gives the column a heading in both tables', async () => {
    serve()
    const { container } = mount()
    await waitFor(() => {
      expect(container.querySelector('[data-table="runs"]')?.textContent).toContain('Started')
    })
    const row = container.querySelector<HTMLElement>('[role="tablist"]')!
    fireEvent.keyDown(row, { key: 'ArrowLeft' })
    await waitFor(() => {
      expect(container.querySelector('[data-table="setups"]')?.textContent).toContain('Modified')
    })
  })
})

describe('how a project card\u2019s runs ended', () => {
  it('breaks the execution count down by outcome', async () => {
    serve({
      executions: [
        { executionId: 'E1', task: 't', status: 'ok', path: 'p/' },
        { executionId: 'E2', task: 't', status: 'ok', path: 'p/' },
        { executionId: 'E3', task: 't', status: 'error', path: 'p/' },
      ],
    })
    const { container } = mount()
    await waitFor(() => {
      expect(container.querySelector('[data-card-outcomes]')).not.toBeNull()
    })
    const parts = [...container.querySelectorAll('[data-card-outcomes] [data-outcome]')]
      .map(part => part.textContent)
    expect(parts).toEqual(['2 ok', '1 error'])
    // The outcome each part is about is on the element, so the colour is not
    // the only thing carrying it.
    expect([...container.querySelectorAll('[data-card-outcomes] [data-outcome]')]
      .map(part => part.getAttribute('data-outcome'))).toEqual(['ok', 'error'])
  })

  it('says nothing at all for a project that has run nothing', async () => {
    // Not `0 ok · 0 refused · 0 error`, which is three facts of no interest
    // where the count above already says none.
    serve({ executions: [] })
    const { container } = mount()
    await waitFor(() => {
      expect(container.querySelector('[data-project-card]')).not.toBeNull()
    })
    expect(container.querySelector('[data-card-outcomes]')).toBeNull()
  })
})

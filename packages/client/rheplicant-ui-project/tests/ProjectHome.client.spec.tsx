// @vitest-environment jsdom
/**
 * The project home (`docs/project-model.md` §6.0): the archive surface over one
 * project's tasks, inputs and executions.
 *
 * The assertions that matter are the state distinctions. "Could not read this
 * project" and "this project is empty" are different facts, and rendering one
 * as the other is the class of bug this design exists to prevent.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectHome } from '../src/client/ProjectHome.tsx'
import { closeHome, openHome, resetHome, selectProject } from '../src/client/home-store.ts'

afterEach(() => { cleanup(); resetHome(); vi.unstubAllGlobals() })
beforeEach(() => { vi.unstubAllGlobals() })

const WORKSPACES = [
  { workspaceId: 'ws-1', title: 'rhino-2026', path: '/host/rhino-2026' },
  { workspaceId: 'ws-2', title: 'beam-cal', path: '/host/beam-cal' },
]

/** A complete overview body for one project. */
function overview(project: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    project,
    tasks: [{ path: `${project}-fit.yaml`, bytes: 120, modifiedAt: 'x', executionCount: 1 }],
    inputs: [{ path: `${project}-beam.npz`, bytes: 4096, modifiedAt: 'x', extension: 'npz' }],
    executions: [{
      executionId: `${project}-E1`,
      task: `${project}-fit`,
      status: 'ok',
      path: `results/${project}-fit/${project}-E1/`,
    }],
    truncated: false,
    ...over,
  }
}

/** Serve each workspace id its own body; `null` makes that project unreadable. */
function serve(bodies: Record<string, Record<string, unknown> | null>): void {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const id = new URL(url, 'http://x').searchParams.get('workspace') ?? ''
    const payload = bodies[id]
    if (payload === undefined || payload === null) {
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) })
  }))
}

/** Render the home over a fixed workspace list. */
function mount(recent: string | undefined = 'ws-1') {
  const state = { items: WORKSPACES, recentWorkspaceId: recent }
  const useWorkspaces = <T,>(selector: (value: typeof state) => T): T => selector(state)
  return render(<ProjectHome useWorkspaces={useWorkspaces} />)
}

describe('when it is closed', () => {
  it('renders nothing at all, so the overlay layer stays click-through', () => {
    serve({ 'ws-1': overview('rhino') })
    const { container } = mount()
    expect(container.querySelector('[data-project-home]')).toBeNull()
  })

  it('asks the host for nothing: a directory walk for a surface nobody sees', () => {
    serve({ 'ws-1': overview('rhino') })
    mount()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})

describe('when it is open on a readable project', () => {
  it('names the project, its tasks, its inputs and its executions', async () => {
    serve({ 'ws-1': overview('rhino') })
    openHome('ws-1')
    mount()
    await waitFor(() => { expect(screen.getByText('rhino')).toBeTruthy() })
    expect(screen.getByText('rhino-fit.yaml')).toBeTruthy()
    expect(screen.getByText('rhino-beam.npz')).toBeTruthy()
    expect(screen.getByText('rhino-E1')).toBeTruthy()
  })

  it('says an input is an npz WITHOUT claiming that is its format', async () => {
    serve({ 'ws-1': overview('rhino') })
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-inputs]')).toBeTruthy() })
    // The note is the honesty: rheplicant reads by the document's declared
    // format, never by the extension, so the home does not assert a link.
    expect(screen.getByText(/never by the extension/)).toBeTruthy()
  })

  it('marks a task that has never run rather than showing it as a zero', async () => {
    serve({
      'ws-1': overview('rhino', {
        tasks: [{ path: 'lonely.yaml', bytes: 10, modifiedAt: 'x', executionCount: 0 }],
        executions: [],
      }),
    })
    openHome('ws-1')
    mount()
    await waitFor(() => { expect(screen.getByText('never run')).toBeTruthy() })
  })

  it('warns when the listing was truncated, so it does not read as complete', async () => {
    serve({ 'ws-1': overview('rhino', { truncated: true }) })
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => {
      expect(container.querySelector('[data-project-truncated]')).toBeTruthy()
    })
  })

  it('does not warn when the whole project fit', async () => {
    serve({ 'ws-1': overview('rhino') })
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-tasks]')).toBeTruthy() })
    expect(container.querySelector('[data-project-truncated]')).toBeNull()
  })
})

describe('the three states, kept apart', () => {
  it('says the project is UNREADABLE, never that it is empty', async () => {
    serve({ 'ws-1': null })
    openHome('ws-1')
    mount()
    await waitFor(() => {
      expect(screen.getByText(/not readable from here/)).toBeTruthy()
    })
    expect(screen.queryByText(/No task documents yet/)).toBeNull()
  })

  it('says the project is EMPTY when it genuinely holds nothing', async () => {
    serve({ 'ws-1': overview('rhino', { tasks: [], inputs: [], executions: [] }) })
    openHome('ws-1')
    mount()
    await waitFor(() => { expect(screen.getByText('No task documents yet')).toBeTruthy() })
    expect(screen.queryByText(/not readable from here/)).toBeNull()
  })
})

describe('switching projects', () => {
  it('never shows one project\'s contents under another project\'s name', async () => {
    // The bug this guard exists for: an overview held across a selection
    // change would label rhino's tasks as beam's.
    serve({ 'ws-1': overview('rhino'), 'ws-2': overview('beam') })
    openHome('ws-1')
    mount()
    await waitFor(() => { expect(screen.getByText('rhino-fit.yaml')).toBeTruthy() })

    // `act` only flushes the re-render this store write causes; it does NOT
    // wait for the next fetch. So the assertion below still lands in the gap
    // between "switched" and "loaded", which is exactly the moment stale
    // contents would be visible if the guard were not there.
    act(() => { selectProject('ws-2') })
    expect(screen.queryByText('rhino-fit.yaml')).toBeNull()
    await waitFor(() => { expect(screen.getByText('beam-fit.yaml')).toBeTruthy() })
  })

  it('re-reads the project the picker names', async () => {
    serve({ 'ws-1': overview('rhino'), 'ws-2': overview('beam') })
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(screen.getByText('rhino-fit.yaml')).toBeTruthy() })
    const picker = container.querySelector('[data-project-picker]') as HTMLSelectElement
    fireEvent.change(picker, { target: { value: 'ws-2' } })
    await waitFor(() => { expect(screen.getByText('beam-fit.yaml')).toBeTruthy() })
  })
})

describe('opening and closing', () => {
  it('seeds on the most recently active workspace rather than a blank page', async () => {
    serve({ 'ws-2': overview('beam') })
    openHome()
    mount('ws-2')
    await waitFor(() => { expect(screen.getByText('beam')).toBeTruthy() })
  })

  it('closes on the Close control', async () => {
    serve({ 'ws-1': overview('rhino') })
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-home]')).toBeTruthy() })
    fireEvent.click(container.querySelector('[data-project-close]')!)
    expect(container.querySelector('[data-project-home]')).toBeNull()
  })

  it('closes on the backdrop', async () => {
    serve({ 'ws-1': overview('rhino') })
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-home]')).toBeTruthy() })
    fireEvent.click(container.querySelector('[data-project-home-backdrop]')!)
    expect(container.querySelector('[data-project-home]')).toBeNull()
  })

  it('closes on Escape', async () => {
    serve({ 'ws-1': overview('rhino') })
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-home]')).toBeTruthy() })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(container.querySelector('[data-project-home]')).toBeNull()
  })

  it('stops listening for Escape once closed', async () => {
    serve({ 'ws-1': overview('rhino') })
    openHome('ws-1')
    mount()
    act(() => { closeHome() })
    // No throw, no stale handler: the assertion is that this is inert.
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

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
import { setNavigator } from '../src/client/navigate.ts'
import { readSelection, resetSelections } from '../src/client/selection.ts'

afterEach(() => {
  cleanup(); resetHome(); setNavigator(undefined); resetSelections(); vi.unstubAllGlobals()
})
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

/** Render the home over a fixed workspace list and session list. */
function mount(recent: string | undefined = 'ws-1', sessionIds: readonly string[] = []) {
  const state = { items: WORKSPACES, recentWorkspaceId: recent }
  const sessions = { ids: sessionIds }
  const useWorkspaces = <T,>(selector: (value: typeof state) => T): T => selector(state)
  const useSessions = <T,>(selector: (value: typeof sessions) => T): T => selector(sessions)
  return render(<ProjectHome useWorkspaces={useWorkspaces} useSessions={useSessions} />)
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

describe('opening a project from a row', () => {
  /** Install a navigator that records calls, and undo it after the test. */
  function navigator() {
    const calls: string[] = []
    setNavigator({
      connect: (workspaceId) => {
        calls.push(`connect:${workspaceId}`)
        return Promise.resolve(`S-${workspaceId}`)
      },
      open: (sessionId) => { calls.push(`open:${sessionId}`) },
    })
    return calls
  }

  it('offers nothing to open when no navigator was installed', async () => {
    // A composition with no conversation surface to send anyone to: the home
    // is still a useful listing, it just stops pretending it can leave.
    setNavigator(undefined)
    serve({ 'ws-1': overview('rhino') })
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-tasks]')).toBeTruthy() })
    expect(container.querySelector('[data-project-open-execution]')).toBeNull()
    expect(container.querySelector('[data-project-open-task]')).toBeNull()
  })

  it('opens an execution: set the PROJECT selection, connect, open, close', async () => {
    const calls = navigator()
    serve({ 'ws-1': overview('rhino') })
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-open-execution]')).toBeTruthy() })
    fireEvent.click(container.querySelector('[data-project-open-execution]')!)
    await waitFor(() => { expect(calls).toContain('open:S-ws-1') })
    expect(calls).toEqual(['connect:ws-1', 'open:S-ws-1'])
    // Addressed to the project, not to the session it happened to land in.
    expect(readSelection('ws-1')).toMatchObject({ executionId: 'rhino-E1', pinned: { execution: true } })
    await waitFor(() => { expect(container.querySelector('[data-project-home]')).toBeNull() })
  })

  it('opens a task on its newest execution', async () => {
    const calls = navigator()
    serve({
      'ws-1': overview('rhino', {
        tasks: [{
          path: 'rhino-fit.yaml', bytes: 1, modifiedAt: 'x',
          executionCount: 2, newestExecutionId: 'rhino-E1',
        }],
      }),
    })
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-open-task]')).toBeTruthy() })
    expect(screen.getByText('Open latest')).toBeTruthy()
    fireEvent.click(container.querySelector('[data-project-open-task]')!)
    await waitFor(() => { expect(calls).toContain('open:S-ws-1') })
    expect(readSelection('ws-1').executionId).toBe('rhino-E1')
  })

  it('opens a never-run task WITHOUT requesting an execution', async () => {
    // There is nothing to point the console at, and inventing one would show
    // some other task's results under this task's name.
    const calls = navigator()
    serve({
      'ws-1': overview('rhino', {
        tasks: [{ path: 'lonely.yaml', bytes: 1, modifiedAt: 'x', executionCount: 0 }],
        executions: [],
      }),
    })
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-open-task]')).toBeTruthy() })
    expect(screen.getByText('Open project')).toBeTruthy()
    fireEvent.click(container.querySelector('[data-project-open-task]')!)
    await waitFor(() => { expect(calls).toContain('open:S-ws-1') })
    expect(readSelection('ws-1').executionId).toBeUndefined()
  })

  it('says so and stays open when connecting fails', async () => {
    setNavigator({
      connect: () => Promise.reject(new Error('the host is offline')),
      open: () => { throw new Error('must not open') },
    })
    serve({ 'ws-1': overview('rhino') })
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-open-execution]')).toBeTruthy() })
    fireEvent.click(container.querySelector('[data-project-open-execution]')!)
    await waitFor(() => {
      expect(container.querySelector('[data-project-open-failed]')).toBeTruthy()
    })
    expect(screen.getByText(/the host is offline/)).toBeTruthy()
    expect(container.querySelector('[data-project-home]')).toBeTruthy()
  })
})

describe('which session a row lands in', () => {
  /** A navigator recording calls, torn down by the file-level afterEach. */
  function navigator() {
    const calls: string[] = []
    setNavigator({
      connect: (workspaceId) => {
        calls.push(`connect:${workspaceId}`)
        return Promise.resolve(`S-${workspaceId}`)
      },
      open: (sessionId) => { calls.push(`open:${sessionId}`) },
    })
    return calls
  }

  /** An overview whose single execution names the session that produced it. */
  function producedBy(sessionId: string | undefined) {
    const execution: Record<string, unknown> = {
      executionId: 'rhino-E1',
      task: 'rhino-fit',
      status: 'ok',
      path: 'results/rhino-fit/rhino-E1/',
    }
    if (sessionId !== undefined) execution.sessionId = sessionId
    return overview('rhino', {
      tasks: [{
        path: 'rhino-fit.yaml', bytes: 1, modifiedAt: 'x',
        executionCount: 1, newestExecutionId: 'rhino-E1',
      }],
      executions: [execution],
    })
  }

  it('opens the producing session directly when it is still alive', async () => {
    const calls = navigator()
    serve({ 'ws-1': producedBy('S-ran-it') })
    openHome('ws-1')
    const { container } = mount('ws-1', ['S-ran-it'])
    await waitFor(() => { expect(container.querySelector('[data-project-open-execution]')).toBeTruthy() })
    fireEvent.click(container.querySelector('[data-project-open-execution]')!)
    await waitFor(() => { expect(calls).toContain('open:S-ran-it') })
    expect(calls).toEqual(['open:S-ran-it'])
    expect(readSelection('ws-1').executionId).toBe('rhino-E1')
  })

  it('connects the workspace when the producing session is GONE', async () => {
    // A pruned session: aiming at it would fail to open. Connecting is the
    // honest fallback, and the request waits for whatever console appears.
    const calls = navigator()
    serve({ 'ws-1': producedBy('S-pruned') })
    openHome('ws-1')
    const { container } = mount('ws-1', ['S-something-else'])
    await waitFor(() => { expect(container.querySelector('[data-project-open-execution]')).toBeTruthy() })
    fireEvent.click(container.querySelector('[data-project-open-execution]')!)
    await waitFor(() => { expect(calls).toContain('open:S-ws-1') })
    expect(calls[0]).toBe('connect:ws-1')
  })

  it('connects when the sidecar recorded no session at all', async () => {
    const calls = navigator()
    serve({ 'ws-1': producedBy(undefined) })
    openHome('ws-1')
    const { container } = mount('ws-1', ['S-ran-it'])
    await waitFor(() => { expect(container.querySelector('[data-project-open-execution]')).toBeTruthy() })
    fireEvent.click(container.querySelector('[data-project-open-execution]')!)
    await waitFor(() => { expect(calls).toContain('open:S-ws-1') })
    expect(calls[0]).toBe('connect:ws-1')
  })

  it('sends a TASK row to its newest execution\'s session too', async () => {
    // The task row names only an execution id; the producing session comes
    // from the executions list, so both rows land in the same place.
    const calls = navigator()
    serve({ 'ws-1': producedBy('S-ran-it') })
    openHome('ws-1')
    const { container } = mount('ws-1', ['S-ran-it'])
    await waitFor(() => { expect(container.querySelector('[data-project-open-task]')).toBeTruthy() })
    fireEvent.click(container.querySelector('[data-project-open-task]')!)
    await waitFor(() => { expect(calls).toContain('open:S-ran-it') })
    expect(calls).toEqual(['open:S-ran-it'])
    expect(readSelection('ws-1').executionId).toBe('rhino-E1')
  })
})

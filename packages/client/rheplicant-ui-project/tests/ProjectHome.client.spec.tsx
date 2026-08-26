// @vitest-environment jsdom
/**
 * The workbench (`docs/project-model.md` §6.0): the archive surface over one
 * project's tasks, inputs and executions.
 *
 * The assertions that matter are the state distinctions. "Could not read this
 * project" and "this project is empty" are different facts, and rendering one
 * as the other is the class of bug this design exists to prevent.
 */

import { useSyncExternalStore, type ComponentProps } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectHome } from '../src/client/ProjectHome.tsx'
import { openHome, resetHome, selectProject } from '../src/client/home-store.ts'
import { setNavigator } from '../src/client/navigate.ts'
import { readSelection, resetSelections, selectInProject } from '../src/client/selection.ts'

afterEach(() => {
  cleanup(); resetHome(); setNavigator(undefined); resetSelections()
  panelOwner = undefined; vi.unstubAllGlobals()
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
function serve(
  bodies: Record<string, Record<string, unknown> | null>,
  documents: Record<string, string> = {},
  definitions: Record<string, Record<string, unknown> | null> = {},
  artifacts: Record<string, string> = {},
  projections: Record<string, Record<string, unknown> | null> = {},
): void {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const parsed = new URL(url, 'http://x')
    const id = parsed.searchParams.get('workspace') ?? ''
    if (parsed.pathname.endsWith('/projection')) {
      const body = projections[parsed.searchParams.get('path') ?? '']
      if (body === undefined || body === null) {
        return Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({}) })
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
    }
    if (parsed.pathname.endsWith('/artifact')) {
      const body = artifacts[parsed.searchParams.get('execution') ?? '']
      if (body === undefined) {
        return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('{}') })
      }
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(body) })
    }
    if (parsed.pathname.endsWith('/definition')) {
      const report = definitions[parsed.searchParams.get('path') ?? '']
      if (report === undefined || report === null) {
        return Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({}) })
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(report) })
    }
    if (parsed.pathname.endsWith('/task')) {
      const text = documents[parsed.searchParams.get('path') ?? '']
      if (text === undefined) {
        return Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({}) })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ path: parsed.searchParams.get('path'), text, bytes: text.length, modifiedAt: 'x' }),
      })
    }
    const payload = bodies[id]
    if (payload === undefined || payload === null) {
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) })
  }))
}

/** What the workbench handed its `task.panel` grid on the last render. */
let panelOwner: {
  useSession: unknown
  execution: Record<string, unknown>
  layout: { collapsed: ReadonlySet<string>; hidden: ReadonlySet<string> }
} | undefined

/**
 * A stand-in for the engine store the framework bakes in from this entry's own
 * registration. Real state, so a collapse actually collapses; recreated per
 * mount, so one test's layout never leaks into the next.
 */
interface LayoutDouble {
  collapsed: string[]
  hidden: string[]
  decided: string[]
}
let layoutState: LayoutDouble = { collapsed: [], hidden: [], decided: [] }
let layoutListeners: (() => void)[] = []

function writeLayout(next: LayoutDouble): void {
  layoutState = next
  for (const listener of [...layoutListeners]) listener()
}

/** Reset the double. Called by every `mount`. */
function resetLayout(): void {
  layoutState = { collapsed: [], hidden: [], decided: [] }
  layoutListeners = []
}

const layoutActions = {
  toggleCollapsed: (id: string) => {
    writeLayout({
      ...layoutState,
      collapsed: layoutState.collapsed.includes(id)
        ? layoutState.collapsed.filter(x => x !== id)
        : [...layoutState.collapsed, id],
      decided: layoutState.decided.includes(id) ? layoutState.decided : [...layoutState.decided, id],
    })
  },
  hide: (id: string) => {
    if (layoutState.hidden.includes(id)) return
    writeLayout({ ...layoutState, hidden: [...layoutState.hidden, id] })
  },
  show: (id: string) => {
    writeLayout({ ...layoutState, hidden: layoutState.hidden.filter(x => x !== id) })
  },
  suggestCollapsed: (ids: readonly string[]) => {
    const undecided = ids.filter(id =>
      !layoutState.decided.includes(id) && !layoutState.collapsed.includes(id))
    if (undecided.length === 0) return
    writeLayout({ ...layoutState, collapsed: [...layoutState.collapsed, ...undecided] })
  },
  reset: () => { writeLayout({ collapsed: [], hidden: [], decided: [] }) },
}

/** Render the home over a fixed workspace list and session list. */
function mount(recent: string | undefined = 'ws-1') {
  resetLayout()
  const state = { items: WORKSPACES, recentWorkspaceId: recent }
  const useWorkspaces = <T,>(selector: (value: typeof state) => T): T => selector(state)
  const renderSlot = (_key: 'task.panel', owner: never) => {
    panelOwner = owner
    return <div data-task-panels="" />
  }
  const useStore = <T,>(selector: (value: LayoutDouble) => T): T =>
    useSyncExternalStore(
      (listener) => {
        layoutListeners.push(listener)
        return () => { layoutListeners = layoutListeners.filter(l => l !== listener) }
      },
      () => selector(layoutState),
      () => selector(layoutState),
    )
  return render(
    <ProjectHome
      {...({
        useWorkspaces, renderSlot, useStore, actions: layoutActions,
      } as unknown as ComponentProps<typeof ProjectHome>)}
    />,
  )
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

  // §20.2: the three modal behaviours below were OURS, not the slot's, and all
  // three are gone. What replaces each assertion is the same claim inverted,
  // because "it is no longer a modal" is exactly the thing that can regress.

  it('draws no backdrop — nothing behind this section is dimmed or blocked', async () => {
    serve({ 'ws-1': overview('rhino') })
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-home]')).toBeTruthy() })
    expect(container.querySelector('[data-project-home-backdrop]')).toBeNull()
  })

  it('ignores Escape — a section is a place you are, not a thing you dismiss', async () => {
    serve({ 'ws-1': overview('rhino') })
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-home]')).toBeTruthy() })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(container.querySelector('[data-project-home]')).toBeTruthy()
  })

  it('is a region landmark, never a dialog', async () => {
    serve({ 'ws-1': overview('rhino') })
    openHome('ws-1')
    mount()
    await waitFor(() => { expect(screen.getByRole('region', { name: 'Workbench' })).toBeTruthy() })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('switches back to the conversation from its own header', async () => {
    serve({ 'ws-1': overview('rhino') })
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-home]')).toBeTruthy() })
    fireEvent.click(container.querySelector('[data-project-switch]')!)
    expect(container.querySelector('[data-project-home]')).toBeNull()
  })
})



describe('the workbench: a task in view, with no session anywhere', () => {
  it('shows no document until a task is selected', async () => {
    serve({ 'ws-1': overview('rhino') }, { 'rhino-fit.yaml': 'schema_version: 1' })
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-tasks]')).toBeTruthy() })
    expect(container.querySelector('[data-project-document]')).toBeNull()
  })

  it('shows the selected task\'s document, read from the project not a session', async () => {
    serve({ 'ws-1': overview('rhino') }, { 'rhino-fit.yaml': 'schema_version: 1\nruns: []\n' })
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-select-task]')).toBeTruthy() })
    fireEvent.click(container.querySelector('[data-project-select-task]')!)
    await waitFor(() => { expect(container.querySelector('[data-project-document]')).toBeTruthy() })
    expect(container.querySelector('[data-project-document]')?.textContent)
      .toContain('schema_version: 1')
  })

  it('selects in place — a task row navigates nowhere', async () => {
    const jumps: string[] = []
    setNavigator({
      connect: (w) => { jumps.push(`connect:${w}`); return Promise.resolve('S') },
      open: (s) => { jumps.push(`open:${s}`) },
    })
    serve({ 'ws-1': overview('rhino') }, { 'rhino-fit.yaml': 'x' })
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-select-task]')).toBeTruthy() })
    fireEvent.click(container.querySelector('[data-project-select-task]')!)
    await waitFor(() => { expect(container.querySelector('[data-project-document]')).toBeTruthy() })
    expect(jumps).toEqual([])
    expect(container.querySelector('[data-project-home]')).toBeTruthy()
  })

  it('marks which row is in view', async () => {
    serve({ 'ws-1': overview('rhino') }, { 'rhino-fit.yaml': 'x' })
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-select-task]')).toBeTruthy() })
    fireEvent.click(container.querySelector('[data-project-select-task]')!)
    await waitFor(() => {
      expect(container.querySelector('[data-project-task-active]')).toBeTruthy()
    })
  })

  it('an execution row selects the execution, also in place', async () => {
    serve({ 'ws-1': overview('rhino') }, {})
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-select-execution]')).toBeTruthy() })
    fireEvent.click(container.querySelector('[data-project-select-execution]')!)
    await waitFor(() => { expect(readSelection('ws-1').executionId).toBe('rhino-E1') })
  })

  it('says the document was REFUSED rather than showing an empty one', async () => {
    // The host answering "not a task document" is a fact about the path, and
    // it reads differently from never having reached the host.
    serve({ 'ws-1': overview('rhino') }, {})
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-select-task]')).toBeTruthy() })
    fireEvent.click(container.querySelector('[data-project-select-task]')!)
    await waitFor(() => {
      expect(screen.getByText(/would not serve that document/)).toBeTruthy()
    })
  })

  it('never shows one task\'s document under another task\'s title', async () => {
    serve(
      { 'ws-1': overview('rhino', {
        tasks: [
          { path: 'a.yaml', bytes: 1, modifiedAt: 'x', executionCount: 0 },
          { path: 'b.yaml', bytes: 1, modifiedAt: 'x', executionCount: 0 },
        ],
      }) },
      { 'a.yaml': 'I AM A', 'b.yaml': 'I AM B' },
    )
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-select-task="a.yaml"]')).toBeTruthy() })
    fireEvent.click(container.querySelector('[data-project-select-task="a.yaml"]')!)
    await waitFor(() => { expect(screen.getByText(/I AM A/)).toBeTruthy() })

    act(() => { selectInProject('ws-1', { taskPath: 'b.yaml' }) })
    // The instant after the switch A must already be gone, not lingering under
    // B's title while B loads.
    expect(screen.queryByText(/I AM A/)).toBeNull()
    await waitFor(() => { expect(screen.getByText(/I AM B/)).toBeTruthy() })
  })
})

describe('the panel grid, in the workbench seat', () => {
  it('renders no grid until an execution is selected', async () => {
    serve({ 'ws-1': overview('rhino') }, {})
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-tasks]')).toBeTruthy() })
    expect(container.querySelector('[data-project-panels]')).toBeNull()
  })

  it('renders the grid once an execution is in view', async () => {
    serve({ 'ws-1': overview('rhino') }, {})
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-select-execution]')).toBeTruthy() })
    fireEvent.click(container.querySelector('[data-project-select-execution]')!)
    await waitFor(() => { expect(container.querySelector('[data-project-panels]')).toBeTruthy() })
  })

  it('hands panels the SAME execution view shape the console builds', async () => {
    // What makes "both seats, one selection" true rather than approximately
    // true: a panel cannot tell which seat it is rendering in.
    serve({ 'ws-1': overview('rhino') }, {})
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-select-execution]')).toBeTruthy() })
    fireEvent.click(container.querySelector('[data-project-select-execution]')!)
    await waitFor(() => { expect(panelOwner?.execution).toBeTruthy() })
    expect(panelOwner?.execution).toMatchObject({ executionId: 'rhino-E1' })
  })

  it('hands panels an EMPTY session reader, because there is no conversation', async () => {
    // Panels take a session reader as their log fallback. The workbench has no
    // log, and §11.5 settled that an unpublished run has no seat here — so the
    // truthful answer is an empty conversation, not a missing prop.
    serve({ 'ws-1': overview('rhino') }, {})
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-select-execution]')).toBeTruthy() })
    fireEvent.click(container.querySelector('[data-project-select-execution]')!)
    await waitFor(() => { expect(panelOwner).toBeTruthy() })
    const read = panelOwner!.useSession as <T>(s: (x: { chat: { nodes: Map<string, unknown> } }) => T) => T
    expect(read(snapshot => snapshot.chat.nodes.size)).toBe(0)
  })
})

describe('opening a conversation to work in', () => {
  /** A navigator recording calls, torn down by the file-level afterEach. */
  function navigator() {
    const calls: string[] = []
    setNavigator({
      connect: (workspaceId) => { calls.push(`connect:${workspaceId}`); return Promise.resolve(`S-${workspaceId}`) },
      open: (sessionId) => { calls.push(`open:${sessionId}`) },
    })
    return calls
  }

  it('offers ONE control for the project, and none per task or execution', async () => {
    // 2026-08-26: there used to be one per task. Removed for the reason §11.11
    // removed the per-execution twin — the destination did not differ. A blank
    // conversation renders nothing about the task, and the selection it
    // carried is browser-half only, so the agent could not read it either.
    navigator()
    serve({ 'ws-1': overview('rhino') }, {})
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-open-empty]')).toBeTruthy() })
    expect(container.querySelector('[data-project-open-task]')).toBeNull()
    expect(container.querySelector('[data-project-open-execution]')).toBeNull()
    expect(screen.queryByText('Open in session')).toBeNull()
    expect(screen.getByText('Open a session in this project')).toBeTruthy()
  })

  it('offers it on a project WITH tasks, not only an empty one', async () => {
    // The control used to live in the empty-project arm alone, which made it
    // an onboarding step. A project with tasks then had only the per-task
    // buttons — so removing those without moving this one would have left a
    // populated project with no way to open a session at all.
    navigator()
    serve({ 'ws-1': overview('rhino') }, {})
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-tasks]')).toBeTruthy() })
    expect(container.querySelector('[data-project-open-empty]')).toBeTruthy()
  })

  it('connects and opens, selecting nothing on the way', async () => {
    const calls = navigator()
    serve({ 'ws-1': overview('rhino') }, {})
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-open-empty]')).toBeTruthy() })
    fireEvent.click(container.querySelector('[data-project-open-empty]')!)
    await waitFor(() => { expect(calls).toContain('open:S-ws-1') })
    expect(calls).toEqual(['connect:ws-1', 'open:S-ws-1'])
    expect(readSelection('ws-1').taskPath).toBeUndefined()
  })

  it('offers nothing to open when no navigator was installed', async () => {
    setNavigator(undefined)
    serve({ 'ws-1': overview('rhino') }, {})
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-tasks]')).toBeTruthy() })
    expect(container.querySelector('[data-project-open-empty]')).toBeNull()
  })

  it('says so and stays open when connecting fails', async () => {
    setNavigator({
      connect: () => Promise.reject(new Error('the host is offline')),
      open: () => { throw new Error('must not open') },
    })
    serve({ 'ws-1': overview('rhino') }, {})
    openHome('ws-1')
    const { container } = mount()
    await waitFor(() => { expect(container.querySelector('[data-project-open-empty]')).toBeTruthy() })
    fireEvent.click(container.querySelector('[data-project-open-empty]')!)
    await waitFor(() => { expect(container.querySelector('[data-project-open-failed]')).toBeTruthy() })
    expect(container.querySelector('[data-project-home]')).toBeTruthy()
  })
})

describe('the definition checklist', () => {
  /** A definition body in which every criterion is met. */
  function defined(digest: string, over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      path: 'rhino-fit.yaml',
      digest,
      inputs: [],
      validation: { valid: true, errors: [], warnings: [] },
      gates: { checks: [{ check: 'linearity', mode: 'warn', state: 'warn', reason: null }], runs: [], warnings: [] },
      ...over,
    }
  }

  it('appears for the selected task, labelled by the source it reads', async () => {
    serve({ 'ws-1': overview('rhino') }, { 'rhino-fit.yaml': 'model: {}\n' },
      { 'rhino-fit.yaml': defined('any') })
    openHome('ws-1')
    selectInProject('ws-1', { taskPath: 'rhino-fit.yaml' })
    const { container } = mount()

    await waitFor(() => { expect(container.querySelector('[data-task-definition]')).toBeTruthy() })
    // The label is not decoration. Unlabelled, this rail and the maturity
    // rail below it read as two statements about the same evidence.
    expect(screen.getByText('read off the document, as authored')).toBeTruthy()
    expect(screen.getByText('read off the project, not this conversation')).toBeTruthy()
  })

  it('reports all four criteria of §7', async () => {
    serve({ 'ws-1': overview('rhino') }, { 'rhino-fit.yaml': 'model: {}\n' },
      { 'rhino-fit.yaml': defined('any') })
    openHome('ws-1')
    selectInProject('ws-1', { taskPath: 'rhino-fit.yaml' })
    const { container } = mount()

    await waitFor(() => { expect(container.querySelector('[data-task-definition]')).toBeTruthy() })
    expect([...container.querySelectorAll('[data-definition-criterion]')]
      .map(node => node.getAttribute('data-definition-criterion')))
      .toEqual(['inputs', 'document', 'gates', 'name'])
  })

  it('says UNKNOWN, not unmet, when the compute service could not be reached', async () => {
    // The distinction the whole three-state design exists for: telling
    // someone their document is wrong when nobody could ask is how a fine
    // document gets edited.
    serve({ 'ws-1': overview('rhino') }, { 'rhino-fit.yaml': 'model: {}\n' }, {})
    openHome('ws-1')
    selectInProject('ws-1', { taskPath: 'rhino-fit.yaml' })
    const { container } = mount()

    await waitFor(() => {
      expect(container.querySelector('[data-definition-criterion="document"][data-definition-state="unknown"]'))
        .toBeTruthy()
    })
    expect(container.querySelector('[data-definition-state="unmet"]')).toBeNull()
  })

  it('still answers "the task is named" when nothing else can be checked', async () => {
    // Criterion 4 comes off the LISTING, so an absent compute service must
    // not take it down with the other three.
    serve({ 'ws-1': overview('rhino') }, { 'rhino-fit.yaml': 'model: {}\n' }, {})
    openHome('ws-1')
    selectInProject('ws-1', { taskPath: 'rhino-fit.yaml' })
    const { container } = mount()

    await waitFor(() => {
      expect(container.querySelector('[data-definition-criterion="name"][data-definition-state="ok"]'))
        .toBeTruthy()
    })
  })

  it('is absent until a task is selected', async () => {
    serve({ 'ws-1': overview('rhino') })
    openHome('ws-1')
    const { container } = mount()

    await waitFor(() => { expect(container.querySelector('[data-project-tasks]')).toBeTruthy() })
    expect(container.querySelector('[data-task-definition]')).toBeNull()
  })
})

describe('a project with no tasks at all', () => {
  it('lists §7\'s four criteria rather than shrugging', async () => {
    // The gap item 1 exists to close: before this, an empty project offered
    // no next step at all.
    serve({ 'ws-1': overview('rhino', { tasks: [], executions: [] }) })
    openHome('ws-1')
    const { container } = mount()

    await waitFor(() => { expect(container.querySelector('[data-project-onboarding]')).toBeTruthy() })
    const items = [...container.querySelectorAll('[data-project-onboarding] li')]
    expect(items).toHaveLength(4)
    expect(items[0]?.textContent).toContain('Inputs resolve')
  })

  it('offers a way to reach the agent, since this surface never writes', async () => {
    const opened: string[] = []
    setNavigator({
      connect: (id: string) => { opened.push(id); return Promise.resolve('S-new') },
      open: () => {},
    })
    serve({ 'ws-1': overview('rhino', { tasks: [], executions: [] }) })
    openHome('ws-1')
    const { container } = mount()

    await waitFor(() => { expect(container.querySelector('[data-project-open-empty]')).toBeTruthy() })
    fireEvent.click(container.querySelector('[data-project-open-empty]')!)
    await waitFor(() => { expect(opened).toEqual(['ws-1']) })
  })

  it('offers no such control when there is nowhere to send anyone', async () => {
    serve({ 'ws-1': overview('rhino', { tasks: [], executions: [] }) })
    openHome('ws-1')
    const { container } = mount()

    await waitFor(() => { expect(container.querySelector('[data-project-onboarding]')).toBeTruthy() })
    expect(container.querySelector('[data-project-open-empty]')).toBeNull()
  })
})

describe('which inputs the selected task reads', () => {
  /** A definition body carrying the given references. */
  function withReferences(inputs: Record<string, unknown>[]): Record<string, unknown> {
    return {
      path: 'rhino-fit.yaml',
      digest: 'any',
      inputs,
      validation: { valid: true, errors: [], warnings: [] },
      gates: { checks: [], runs: [], warnings: [] },
    }
  }

  it('claims nothing while no task is selected', async () => {
    // §11.4's link is about ONE task. With none chosen there is no claim to
    // make, and marking rows anyway would assert something about the project.
    serve({ 'ws-1': overview('rhino') })
    openHome('ws-1')
    const { container } = mount()

    await waitFor(() => { expect(container.querySelector('[data-project-inputs]')).toBeTruthy() })
    expect(container.querySelector('[data-input-used]')).toBeNull()
    expect(container.querySelector('[data-input-usage-note]')).toBeNull()
  })

  it('marks the row the task reads and leaves the others unmarked', async () => {
    serve({ 'ws-1': overview('rhino') }, { 'rhino-fit.yaml': 'model: {}\n' },
      { 'rhino-fit.yaml': withReferences([{
        where: 'model.gain.gain', path: 'rhino-beam.npz', format: 'npz',
        resolves: true, inProject: true, projectPath: 'rhino-beam.npz',
      }]) })
    openHome('ws-1')
    selectInProject('ws-1', { taskPath: 'rhino-fit.yaml' })
    const { container } = mount()

    await waitFor(() => { expect(container.querySelector('[data-input-used]')).toBeTruthy() })
    expect(container.querySelector('[data-project-input="rhino-beam.npz"] [data-input-used]')).toBeTruthy()
  })

  it('says a file with no mark is one THIS task does not read', async () => {
    // Not "unused". The project's other tasks are not being spoken for.
    serve({ 'ws-1': overview('rhino') }, { 'rhino-fit.yaml': 'model: {}\n' },
      { 'rhino-fit.yaml': withReferences([]) })
    openHome('ws-1')
    selectInProject('ws-1', { taskPath: 'rhino-fit.yaml' })
    const { container } = mount()

    await waitFor(() => { expect(container.querySelector('[data-input-usage-note]')).toBeTruthy() })
    const note = container.querySelector('[data-input-usage-note]')!.textContent ?? ''
    // Names the task it is speaking for, and denies the reading that an
    // unmarked row means nobody uses the file.
    expect(note).toContain('rhino-fit.yaml')
    expect(note).toContain('this task does not read')
  })

  it('reports a file it reads that this listing does not carry', async () => {
    // INPUT_EXTENSIONS is a filter: a `.dat` resolves and never gets a row.
    // Marking two of three references and saying nothing would read as a
    // complete account of what the task reads.
    serve({ 'ws-1': overview('rhino') }, { 'rhino-fit.yaml': 'model: {}\n' },
      { 'rhino-fit.yaml': withReferences([{
        where: 'model.gain.gain', path: 'inputs/cal.dat', format: 'txt',
        resolves: true, inProject: true, projectPath: 'inputs/cal.dat',
      }]) })
    openHome('ws-1')
    selectInProject('ws-1', { taskPath: 'rhino-fit.yaml' })
    const { container } = mount()

    await waitFor(() => { expect(container.querySelector('[data-input-unlisted]')).toBeTruthy() })
    expect(container.querySelector('[data-input-unlisted]')!.textContent).toContain('inputs/cal.dat')
  })

  it('counts a reference resolving outside the project WITHOUT naming a path', async () => {
    serve({ 'ws-1': overview('rhino') }, { 'rhino-fit.yaml': 'model: {}\n' },
      { 'rhino-fit.yaml': withReferences([{
        where: 'model.gain.gain', path: '~/data/beam.npy', format: 'npy',
        resolves: true, inProject: false,
      }]) })
    openHome('ws-1')
    selectInProject('ws-1', { taskPath: 'rhino-fit.yaml' })
    const { container } = mount()

    await waitFor(() => { expect(container.querySelector('[data-input-outside]')).toBeTruthy() })
    const text = container.querySelector('[data-input-outside]')!.textContent ?? ''
    expect(text).toContain('1')
    expect(text).not.toContain('~/data/beam.npy')
  })

  it('marks nothing when the check could not be reached', async () => {
    // An unreachable service must not read as "this task uses none of them".
    serve({ 'ws-1': overview('rhino') }, { 'rhino-fit.yaml': 'model: {}\n' }, {})
    openHome('ws-1')
    selectInProject('ws-1', { taskPath: 'rhino-fit.yaml' })
    const { container } = mount()

    await waitFor(() => { expect(container.querySelector('[data-task-definition]')).toBeTruthy() })
    expect(container.querySelector('[data-input-used]')).toBeNull()
    expect(container.querySelector('[data-input-usage-note]')).toBeNull()
  })
})

describe('a selected task that is no longer in the listing', () => {
  /**
   * Found in a real boot: the document pane STAYED and explained ("this
   * project would not serve that document"), while the definition checklist
   * and the maturity rail simply vanished — they were guarded on the task
   * still being in the listing. Three panels about one task, two of them
   * silently absent and one of them talking.
   *
   * The explaining one is right. A panel that disappears leaves someone
   * wondering whether they mis-clicked; a panel that says the task is gone
   * tells them what happened.
   */
  it('says the task is gone rather than removing its panels', async () => {
    serve({ 'ws-1': overview('rhino') }, { 'rhino-fit.yaml': 'model: {}\n' })
    openHome('ws-1')
    // A task the listing does not carry — what a deleted or renamed file
    // leaves behind in a selection that outlives it.
    selectInProject('ws-1', { taskPath: 'deleted.yaml' })
    const { container } = mount()

    await waitFor(() => { expect(container.querySelector('[data-project-tasks]')).toBeTruthy() })
    const gone = container.querySelector('[data-project-task-gone]')
    expect(gone).toBeTruthy()
    expect(gone!.textContent).toContain('deleted.yaml')
    // And no checklist claiming anything about a task nobody can see.
    expect(container.querySelector('[data-task-definition]')).toBeNull()
    expect(container.querySelector('[data-task-maturity]')).toBeNull()
  })

  it('stays quiet in an EMPTY project, which already says what to do', async () => {
    // A project with no tasks shows §7's onboarding checklist. Adding "your
    // selected task is gone" on top of "no task documents yet" states the
    // same fact twice and buries the one that tells you what to do next.
    serve({ 'ws-1': overview('rhino', { tasks: [], executions: [] }) })
    openHome('ws-1')
    selectInProject('ws-1', { taskPath: 'deleted.yaml' })
    const { container } = mount()

    await waitFor(() => { expect(container.querySelector('[data-project-onboarding]')).toBeTruthy() })
    expect(container.querySelector('[data-project-task-gone]')).toBeNull()
  })

  it('shows both panels again for a task that IS listed', async () => {
    serve({ 'ws-1': overview('rhino') }, { 'rhino-fit.yaml': 'model: {}\n' },
      { 'rhino-fit.yaml': {
        path: 'rhino-fit.yaml', digest: 'x', inputs: [],
        validation: { valid: true, errors: [], warnings: [] },
        gates: { checks: [], runs: [], warnings: [] },
      } })
    openHome('ws-1')
    selectInProject('ws-1', { taskPath: 'rhino-fit.yaml' })
    const { container } = mount()

    await waitFor(() => { expect(container.querySelector('[data-task-definition]')).toBeTruthy() })
    expect(container.querySelector('[data-project-task-gone]')).toBeNull()
  })
})

describe('what the selected execution actually ran', () => {
  const AUTHORED = 'schema_version: 1\nseed: 20260823\n'

  it('shows the difference, not just that there is one', async () => {
    // §11.4 left this open: the digest says a task CHANGED, and a flag nobody
    // can act on is half an answer. The bytes come off P3's artifact route,
    // which has served `config.input.yaml` since the seam existed.
    serve({ 'ws-1': overview('rhino') }, { 'rhino-fit.yaml': AUTHORED }, {},
      { 'rhino-E1': 'schema_version: 1\nseed: 11111111\n' })
    openHome('ws-1')
    selectInProject('ws-1', { taskPath: 'rhino-fit.yaml', executionId: 'rhino-E1' })
    const { container } = mount()

    await waitFor(() => { expect(container.querySelector('[data-document-diff]')).toBeTruthy() })
    const kinds = [...container.querySelectorAll('[data-diff-line]')]
      .map(n => n.getAttribute('data-diff-line'))
    expect(kinds).toEqual(['same', 'removed', 'added'])
    const text = container.querySelector('[data-document-diff]')!.textContent ?? ''
    expect(text).toContain('20260823')
    expect(text).toContain('11111111')
  })

  it('says so plainly when the two are identical', async () => {
    // A positive statement, not silence: "byte-for-byte what ran" is the
    // thing someone about to trust these results wants to be told.
    serve({ 'ws-1': overview('rhino') }, { 'rhino-fit.yaml': AUTHORED }, {},
      { 'rhino-E1': AUTHORED })
    openHome('ws-1')
    selectInProject('ws-1', { taskPath: 'rhino-fit.yaml', executionId: 'rhino-E1' })
    const { container } = mount()

    await waitFor(() => {
      expect(container.querySelector('[data-document-diff-identical]')).toBeTruthy()
    })
    expect(container.querySelector('[data-document-diff]')).toBeNull()
  })

  it('does not compare when no execution is selected', async () => {
    serve({ 'ws-1': overview('rhino') }, { 'rhino-fit.yaml': AUTHORED })
    openHome('ws-1')
    selectInProject('ws-1', { taskPath: 'rhino-fit.yaml' })
    const { container } = mount()

    await waitFor(() => { expect(container.querySelector('[data-project-document]')).toBeTruthy() })
    expect(container.querySelector('[data-document-diff]')).toBeNull()
    expect(container.querySelector('[data-document-diff-identical]')).toBeNull()
  })

  it('says the executed copy is gone rather than showing a one-sided diff', async () => {
    // A pruned execution has no bytes to compare against. Diffing the
    // authored document against nothing would render every line as ADDED,
    // which reads as "you rewrote the whole file".
    serve({ 'ws-1': overview('rhino') }, { 'rhino-fit.yaml': AUTHORED }, {}, {})
    openHome('ws-1')
    selectInProject('ws-1', { taskPath: 'rhino-fit.yaml', executionId: 'rhino-E1' })
    const { container } = mount()

    await waitFor(() => {
      expect(container.querySelector('[data-document-diff-unavailable]')).toBeTruthy()
    })
    expect(container.querySelector('[data-document-diff]')).toBeNull()
  })
})

describe('the physics a task declares', () => {
  /** A projection carrying the given lit nodes. */
  function projection(nodes: Record<string, unknown>[], total = 33) {
    return { path: 'rhino-fit.yaml', digest: 'x', svg: '<svg data-diagram=""></svg>',
      walkOrder: [], model: { totalNodes: total, nodes },
      runs: { exitsTotal: 18, catalogue: [], declared: [], reserved: [] } }
  }

  const SIGNAL = {
    nodeId: 'global_signal', label: 'global signal', kind: 'source', segment: 'sky',
    description: 'A sky-averaged 21-cm absorption trough.', selectedType: null,
    fields: [{ name: 'depth', label: 'depth', help: 'trough depth [K] (positive number gives absorption).', unit: 'K', required: true, value: null }],
  }

  it('shows the diagram and the operators with NO execution selected', async () => {
    // The point of §17. Before it, the signal path existed only after a first
    // run, so the diagram the philosophy asks to be "always present" was
    // missing for exactly the task somebody is still authoring.
    serve({ 'ws-1': overview('rhino') }, { 'rhino-fit.yaml': 'model: {}\n' }, {}, {},
      { 'rhino-fit.yaml': projection([SIGNAL]) })
    openHome('ws-1')
    selectInProject('ws-1', { taskPath: 'rhino-fit.yaml' })
    const { container } = mount()

    await waitFor(() => { expect(container.querySelector('[data-task-model]')).toBeTruthy() })
    expect(container.querySelector('[data-model-diagram] svg')).toBeTruthy()
    expect(container.querySelector('[data-model-node="global_signal"]')).toBeTruthy()
  })

  it("shows each parameter's own help text rather than describing it here", async () => {
    serve({ 'ws-1': overview('rhino') }, { 'rhino-fit.yaml': 'model: {}\n' }, {}, {},
      { 'rhino-fit.yaml': projection([SIGNAL]) })
    openHome('ws-1')
    selectInProject('ws-1', { taskPath: 'rhino-fit.yaml' })
    const { container } = mount()

    await waitFor(() => { expect(container.querySelector('[data-model-field="depth"]')).toBeTruthy() })
    const field = container.querySelector('[data-model-field="depth"]')!.textContent ?? ''
    expect(field).toContain('trough depth')
    expect(field).toContain('K')
  })

  it('says how many operators are dimmed, so the catalogue stays visible', async () => {
    // "1 of 33" is how a reader learns there is more physics available than
    // they have used — the list itself only shows what is lit.
    serve({ 'ws-1': overview('rhino') }, { 'rhino-fit.yaml': 'model: {}\n' }, {}, {},
      { 'rhino-fit.yaml': projection([SIGNAL]) })
    openHome('ws-1')
    selectInProject('ws-1', { taskPath: 'rhino-fit.yaml' })
    const { container } = mount()

    await waitFor(() => { expect(container.querySelector('[data-model-nodes]')).toBeTruthy() })
    const note = container.querySelector('[data-task-model]')!.textContent ?? ''
    expect(note).toContain('1 of 33')
    expect(note).toContain('32')
  })

  it('names the optional extra when the service cannot project', async () => {
    // `rheplicant.gui` is optional, so this is a normal state on a working
    // install — and the fix is a pip command, which the panel gives.
    serve({ 'ws-1': overview('rhino') }, { 'rhino-fit.yaml': 'model: {}\n' }, {}, {}, {})
    openHome('ws-1')
    selectInProject('ws-1', { taskPath: 'rhino-fit.yaml' })
    const { container } = mount()

    await waitFor(() => {
      expect(screen.getByText(/could not be projected/)).toBeTruthy()
    })
    expect(container.querySelector('[data-task-model]')).toBeNull()
    expect(screen.getByText(/rheplicant\[gui\]/)).toBeTruthy()
  })

  it('claims nothing about a document that declares no operators', async () => {
    serve({ 'ws-1': overview('rhino') }, { 'rhino-fit.yaml': 'model: {}\n' }, {}, {},
      { 'rhino-fit.yaml': projection([]) })
    openHome('ws-1')
    selectInProject('ws-1', { taskPath: 'rhino-fit.yaml' })
    const { container } = mount()

    await waitFor(() => { expect(container.querySelector('[data-task-model]')).toBeTruthy() })
    expect(container.querySelector('[data-model-nodes]')).toBeNull()
    expect(screen.getByText(/declares no operators yet/)).toBeTruthy()
  })
})

describe('the exits a task reaches for', () => {
  const CATALOGUE = [
    { kind: 'forward', fitting: false, summary: 'the sweep is the whole grammar.', products: ['arrays'] },
    { kind: 'nuts', fitting: true, summary: 'one kind: nuts run -> a NutsProduct.', products: ['draws', 'chains'] },
    { kind: 'fisher', fitting: true, summary: 'space/jitter validated.', products: ['covariance'] },
  ]

  function withExits(over: Record<string, unknown> = {}) {
    return {
      path: 'rhino-fit.yaml', digest: 'x', svg: '<svg></svg>', walkOrder: [],
      model: { totalNodes: 33, nodes: [] },
      runs: {
        exitsTotal: 18,
        catalogue: CATALOGUE,
        declared: [{ index: 0, name: 'simulate', kind: 'forward', known: true, products: ['arrays'], deferredChecks: [] }],
        reserved: [{ key: 'campaign', capability: 'capability 4 (streaming evidence)', section: '§8.2' }],
        ...over,
      },
    }
  }

  function open(projection: Record<string, unknown>) {
    serve({ 'ws-1': overview('rhino') }, { 'rhino-fit.yaml': 'model: {}\n' }, {}, {},
      { 'rhino-fit.yaml': projection })
    openHome('ws-1')
    selectInProject('ws-1', { taskPath: 'rhino-fit.yaml' })
    return mount()
  }

  it('lists every exit, with the declared ones marked and first', async () => {
    // This replaces six empty panels that each named ONE exit. The catalogue
    // names all of them, once, whether or not this task can fill a panel.
    const { container } = open(withExits())

    await waitFor(() => { expect(container.querySelector('[data-task-runs]')).toBeTruthy() })
    const order = [...container.querySelectorAll('[data-exit]')].map(n => n.getAttribute('data-exit'))
    expect(order).toEqual(['forward', 'nuts', 'fisher'])
    expect(container.querySelector('[data-exit="forward"][data-exit-used]')).toBeTruthy()
    expect(container.querySelector('[data-exit="nuts"][data-exit-used]')).toBeNull()
  })

  it('says what each exit WRITES, which is what makes it choosable', async () => {
    const { container } = open(withExits())

    await waitFor(() => { expect(container.querySelector('[data-task-runs]')).toBeTruthy() })
    const nuts = container.querySelector('[data-exit="nuts"]')!.textContent ?? ''
    expect(nuts).toContain('draws')
    expect(nuts).toContain('chains')
  })

  it('counts what the task uses against what exists, and what needs a fit', async () => {
    // The honest form of "not defaulting to forward only": no capability is
    // claimed, because the source defines none.
    const { container } = open(withExits())

    await waitFor(() => { expect(container.querySelector('[data-task-runs]')).toBeTruthy() })
    const note = container.querySelector('[data-task-runs]')!.textContent ?? ''
    expect(note).toContain('1')
    expect(note).toContain('18')
    expect(note).toContain('need a fitted parameter space')
  })

  it('names the reserved keys, and says why that is the one capability claim', async () => {
    const { container } = open(withExits())

    await waitFor(() => { expect(container.querySelector('[data-exit-reserved]')).toBeTruthy() })
    expect(container.querySelector('[data-reserved-key="campaign"]')!.textContent)
      .toContain('capability 4')
  })

  it('reports a kind the grammar does not run WITHOUT counting it', async () => {
    const { container } = open(withExits({
      declared: [{ index: 0, name: 'odd', kind: 'made-up', known: false, products: [], deferredChecks: [] }],
    }))

    await waitFor(() => { expect(container.querySelector('[data-exit-unknown]')).toBeTruthy() })
    expect(container.querySelector('[data-exit-unknown]')!.textContent).toContain('made-up')
    expect(container.querySelector('[data-exit-used]')).toBeNull()
  })
})


describe('the panel layout the workbench owns (§20.4)', () => {
  /** A projection whose declared runs write the given product selectors. */
  function withRuns(...products: readonly string[][]) {
    return {
      path: 'rhino-fit.yaml',
      digest: 'x',
      svg: '<svg data-diagram=""></svg>',
      walkOrder: [],
      model: { totalNodes: 0, nodes: [] },
      runs: {
        exitsTotal: 18,
        catalogue: [],
        declared: products.map((selectors, index) => ({
          index, name: `r${index}`, kind: 'nuts', known: true, products: selectors,
        })),
        reserved: [],
      },
    }
  }

  const NUTS = ['arrays', 'draws', 'parameters', 'chains', 'recovery', 'run_diagnostics']
  const FORWARD = ['arrays', 'aux', 'taps']

  async function open(projection?: Record<string, unknown>) {
    serve(
      { 'ws-1': overview('rhino') },
      { 'rhino-fit.yaml': 'model: {}\n' },
      {}, {},
      projection === undefined ? {} : { 'rhino-fit.yaml': projection },
    )
    openHome('ws-1')
    selectInProject('ws-1', { taskPath: 'rhino-fit.yaml', executionId: 'rhino-E1' })
    const rendered = mount()
    await waitFor(() => { expect(rendered.container.querySelector('[data-project-panels]')).toBeTruthy() })
    return rendered
  }

  it('hands every panel the layout, through the one channel that reaches them all', async () => {
    await open(withRuns(NUTS))
    await waitFor(() => { expect(panelOwner?.layout).toBeDefined() })
    expect(panelOwner?.layout.collapsed).toBeInstanceOf(Set)
    expect(panelOwner?.layout.hidden).toBeInstanceOf(Set)
  })

  it('hides a panel from the Panels menu and restores it', async () => {
    const { container } = await open(withRuns(NUTS))
    const item = container.querySelector('[data-panels-menu-item="spectrum"] input') as HTMLInputElement
    expect(item.checked).toBe(true)
    fireEvent.click(item)
    await waitFor(() => { expect(panelOwner?.layout.hidden.has('spectrum')).toBe(true) })
    fireEvent.click(container.querySelector('[data-panels-menu-item="spectrum"] input')!)
    await waitFor(() => { expect(panelOwner?.layout.hidden.has('spectrum')).toBe(false) })
  })

  it('collapses a panel whose product no declared run writes', async () => {
    // A forward-only document writes no `chains`, so the two chain panels
    // arrive folded — and the Exits catalogue above explains why, once.
    await open(withRuns(FORWARD))
    await waitFor(() => { expect(panelOwner?.layout.collapsed.has('posterior')).toBe(true) })
    expect(panelOwner?.layout.collapsed.has('chains')).toBe(true)
  })

  it('leaves those panels open when a declared run DOES write their product', async () => {
    await open(withRuns(NUTS))
    await waitFor(() => { expect(panelOwner?.layout).toBeDefined() })
    expect(panelOwner?.layout.collapsed.has('posterior')).toBe(false)
    expect(panelOwner?.layout.collapsed.has('chains')).toBe(false)
  })

  it('collapses nothing when the document could not be projected at all', async () => {
    // `unknown` is not `unmet`: folding a panel shut because nobody could ask
    // is the mistake §12 refused on the definition checklist.
    await open(undefined)
    await waitFor(() => { expect(panelOwner?.layout).toBeDefined() })
    expect(panelOwner?.layout.collapsed.size).toBe(0)
  })

  it('never collapses a panel that draws no run product', async () => {
    await open(withRuns(FORWARD))
    await waitFor(() => { expect(panelOwner?.layout.collapsed.has('posterior')).toBe(true) })
    expect(panelOwner?.layout.collapsed.has('gates')).toBe(false)
    // `spectrum`, not `signal-path`: §28.1 merged that panel into the Model
    // section, so asserting on its id would be an assertion that cannot fail.
    expect(panelOwner?.layout.collapsed.has('spectrum')).toBe(false)
  })

  it('says in the menu WHY a panel arrived collapsed', async () => {
    const { container } = await open(withRuns(FORWARD))
    await waitFor(() => {
      expect(container.querySelector('[data-panels-menu-item="posterior"][data-panel-without-exit]'))
        .toBeTruthy()
    })
    expect(container.querySelector('[data-panels-menu-item="gates"][data-panel-without-exit]'))
      .toBeNull()
  })
})

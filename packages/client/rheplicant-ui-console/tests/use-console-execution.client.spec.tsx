// @vitest-environment jsdom
/**
 * The console's selection and the data behind it.
 *
 * The three states this hook distinguishes are the point: HAVE the execution,
 * cannot REACH the project, and the project says this execution is GONE. A
 * console that cannot tell them apart shows "no data" for all three and lies
 * about two of them.
 */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { useConsoleExecution } from '../src/client/use-console-execution.ts'
import {
  chooseExecution, resetLocalSelection, setSelectionSource,
  type ProjectSelection,
} from '../src/client/selection-bridge.ts'
import type { LoopExecutionRef, LoopSnapshot } from '../src/client/loop-contract.ts'

const NEWER = '20260822T134501Z-3f9ac2b1-k7m2xq'
const OTHER = '20260822T170000Z-bbbbbbbb-bbbbbb'
const WORKSPACE = '/home/z/rhino-2026'


/**
 * A `Partial` that also accepts an explicit `undefined`.
 *
 * These builders exist so a test can say "this field is ABSENT here", and it
 * says that by passing `undefined`. Plain `Partial<T>` refuses that under
 * `exactOptionalPropertyTypes` (the checkout's client build), where it means
 * "omit the key" — which a spread of overrides cannot express.
 */
type Loose<T> = { readonly [K in keyof T]?: T[K] | undefined }

/**
 * Merge overrides into a base, treating an explicit `undefined` as REMOVE.
 *
 * That is what `ref({ resultsPath: undefined })` means in these tests: not
 * "set it to undefined" but "build one without a results path". A plain spread
 * would leave the key present holding `undefined`, which is a different object
 * and, for an optional field, not even a legal one.
 */
function build<T extends object>(base: T, overrides: Loose<T>): T {
  const merged = { ...base } as Record<string, unknown>
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete merged[key]
    else merged[key] = value
  }
  return merged as T
}

function ref(id: string, over: Loose<LoopExecutionRef> = {}): LoopExecutionRef {
  return build({
    executionId: id,
    resultsPath: `${WORKSPACE}/results/tasks/fit/${id}`,
    transport: 'local',
    status: 'ok',
    seq: 1,
  }, over)
}

/** Route answers keyed by pathname; a missing key means "route not there". */
let answers: Record<string, { status: number; body?: unknown }>

beforeEach(() => {
  answers = {}
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const path = String(input).split('?')[0] as string
    const answer = answers[path]
    if (answer === undefined) return { ok: false, status: 500, json: async () => ({}) } as Response
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      json: async () => answer.body ?? {},
    } as Response
  }))
})
// `cleanup()` explicitly: this repo does not run vitest with `globals`, so
// Testing Library's auto-cleanup hook is never registered and every
// `renderHook` from an earlier test stays MOUNTED and subscribed. That is a
// landmine for anything module-scoped — a leaked console still reads the
// execution-request store, and whichever one reacts first consumes the
// request, so the test's own hook can miss it entirely.
afterEach(() => { cleanup(); resetLocalSelection(); setSelectionSource(undefined); vi.unstubAllGlobals() })

const WORKSPACES = { items: [{ workspaceId: 'ws-1', sessionIds: ['S-1'] }] }

function mount(executions: readonly LoopExecutionRef[]) {
  const snapshot: LoopSnapshot = { executions, latestSeq: executions.length }
  const views = new Map<string, unknown>([['rheplicant-loop', snapshot]])
  const session = { views, sessionId: 'S-1', chat: { nodes: new Map() }, nodes: [] } as unknown as ConversationSnapshot
  return renderHook(() => useConsoleExecution(
    <T,>(s: (x: ConversationSnapshot) => T) => s(session),
    <T,>(s: (x: typeof WORKSPACES) => T) => s(WORKSPACES),
  ))
}

describe('when the project can be read', () => {
  beforeEach(() => {
    answers['/rheplicant/project/executions'] = {
      status: 200,
      body: {
        project: 'rhino-2026',
        executions: [
          { executionId: OTHER, task: 'tasks/fit', status: 'ok', path: `results/tasks/fit/${OTHER}/`, sessionId: 'S-other' },
          { executionId: NEWER, task: 'tasks/fit', status: 'ok', path: `results/tasks/fit/${NEWER}/` },
        ],
      },
    }
  })

  it('offers the project\'s executions and names the project', async () => {
    const { result } = mount([ref(NEWER)])
    await waitFor(() => { expect(result.current.ordered).toHaveLength(2) })
    expect(result.current.projectName).toBe('rhino-2026')
    expect(result.current.projectReadable).toBe(true)
    expect(result.current.selected?.executionId).toBe(OTHER)
  })

  it('hands the panels the runs it read off the tree', async () => {
    answers['/rheplicant/project/execution'] = {
      status: 200,
      body: { runs: [{ name: 'fit', kind: 'nuts', status: 'ok', chains: { depth: [1, 2] } }] },
    }
    const { result } = mount([ref(NEWER)])
    await waitFor(() => { expect(result.current.executionView.runs).toHaveLength(1) })
    expect(result.current.executionView.executionId).toBe(OTHER)
    expect(result.current.executionView.foreign).toBe(true)
  })

  it('reports an execution the project says is gone as UNREADABLE, not empty', async () => {
    // Falling back to the log here would draw a different execution's data
    // under this one's name.
    answers['/rheplicant/project/execution'] = { status: 409 }
    const { result } = mount([ref(NEWER)])
    await waitFor(() => { expect(result.current.executionView.problem).toBe('unreadable') })
    expect(result.current.executionView.runs).toBeUndefined()
  })
})

describe('when the project cannot be reached', () => {
  it('falls back to this session\'s own executions and says so', async () => {
    const { result } = mount([ref(NEWER)])
    await waitFor(() => { expect(result.current.projectReadable).toBe(false) })
    expect(result.current.ordered.map(row => row.executionId)).toEqual([NEWER])
    expect(result.current.projectName).toBe('rhino-2026')
  })

  it('marks the execution view UNAVAILABLE so panels use the log', async () => {
    const { result } = mount([ref(NEWER)])
    await waitFor(() => { expect(result.current.executionView.problem).toBe('unavailable') })
  })
})

describe('an execution that published nothing', () => {
  it('is never fetched, because there is no tree to read', async () => {
    const { result } = mount([ref(NEWER, { resultsPath: undefined })])
    await waitFor(() => { expect(result.current.selected).toBeDefined() })
    expect(result.current.executionView.problem).toBeUndefined()
    expect(result.current.executionView.runs).toBeUndefined()
    const calls = (globalThis.fetch as unknown as { mock: { calls: string[][] } }).mock.calls
    expect(calls.some(call => String(call[0]).includes('/execution?'))).toBe(false)
  })
})

describe('selection', () => {
  it('follows the newest until told otherwise, then follows the choice', async () => {
    answers['/rheplicant/project/executions'] = {
      status: 200,
      body: {
        project: 'p',
        executions: [
          { executionId: OTHER, task: 't', status: 'ok', path: `results/t/${OTHER}/` },
          { executionId: NEWER, task: 't', status: 'ok', path: `results/t/${NEWER}/` },
        ],
      },
    }
    const { result } = mount([ref(NEWER)])
    await waitFor(() => { expect(result.current.selected?.executionId).toBe(OTHER) })
    result.current.select(NEWER)
    await waitFor(() => { expect(result.current.selected?.executionId).toBe(NEWER) })
    result.current.select(OTHER)
    await waitFor(() => { expect(result.current.selected?.executionId).toBe(OTHER) })
  })
})

describe('addressing by the PROJECT selection, not by session', () => {
  beforeEach(() => {
    answers['/rheplicant/project/executions'] = {
      status: 200,
      body: {
        project: 'rhino-2026',
        executions: [
          { executionId: OTHER, task: 'tasks/fit', status: 'ok', path: `results/tasks/fit/${OTHER}/`, sessionId: 'S-other' },
          { executionId: NEWER, task: 'tasks/fit', status: 'ok', path: `results/tasks/fit/${NEWER}/` },
        ],
      },
    }
    resetLocalSelection()
  })

  it('follows the newest execution when nobody has chosen one', async () => {
    // The default rule of §11.2, offered as a proposal rather than baked in.
    const { result } = mount([ref(NEWER)])
    await waitFor(() => { expect(result.current.ordered).toHaveLength(2) })
    expect(result.current.selected?.executionId).toBe(OTHER)
  })

  it('shows whatever the project selection names, wherever it was set', async () => {
    // The home sets this; so does another surface in another seat. The console
    // never learns who chose it, which is the point.
    const { result } = mount([ref(NEWER)])
    await waitFor(() => { expect(result.current.ordered).toHaveLength(2) })
    act(() => { chooseExecution('ws-1', NEWER) })
    await waitFor(() => { expect(result.current.selected?.executionId).toBe(NEWER) })
  })

  it('ignores a selection naming an execution this project does not offer', async () => {
    // Rendering an empty console under a name absent from the picker would be
    // worse than falling back to the default.
    const { result } = mount([ref(NEWER)])
    await waitFor(() => { expect(result.current.ordered).toHaveLength(2) })
    act(() => { chooseExecution('ws-1', 'EXEC-from-another-project') })
    expect(result.current.selected?.executionId).toBe(OTHER)
  })

  it('reads the selection of its OWN project only', async () => {
    const { result } = mount([ref(NEWER)])
    await waitFor(() => { expect(result.current.ordered).toHaveLength(2) })
    act(() => { chooseExecution('ws-elsewhere', NEWER) })
    expect(result.current.selected?.executionId).toBe(OTHER)
  })

  it('its picker writes the selection rather than any local state', async () => {
    const { result } = mount([ref(NEWER)])
    await waitFor(() => { expect(result.current.ordered).toHaveLength(2) })
    act(() => { result.current.select(NEWER) })
    await waitFor(() => { expect(result.current.selected?.executionId).toBe(NEWER) })
  })
})

describe('which verb the console uses, and why it matters', () => {
  /** A recording stand-in for the project's selection service. */
  function spy() {
    const calls: string[] = []
    // Annotated, not inferred: an inferred literal would type `executionId`
    // as `undefined` and refuse every assignment below.
    let state: ProjectSelection = {
      taskPath: undefined,
      executionId: undefined,
      pinned: { task: false, execution: false },
    }
    const listeners = new Set<() => void>()
    setSelectionSource(() => ({
      select: (w, patch) => {
        calls.push(`select:${w}:${String(patch.executionId)}`)
        state = { ...state, executionId: patch.executionId ?? state.executionId }
        for (const l of listeners) l()
      },
      propose: (w, patch) => {
        calls.push(`propose:${w}:${String(patch.executionId)}`)
        state = { ...state, executionId: patch.executionId ?? state.executionId }
        for (const l of listeners) l()
      },
      read: () => state,
      subscribe: (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    }))
    return calls
  }

  beforeEach(() => {
    answers['/rheplicant/project/executions'] = {
      status: 200,
      body: {
        project: 'rhino-2026',
        executions: [
          { executionId: OTHER, task: 'tasks/fit', status: 'ok', path: `results/tasks/fit/${OTHER}/` },
          { executionId: NEWER, task: 'tasks/fit', status: 'ok', path: `results/tasks/fit/${NEWER}/` },
        ],
      },
    }
  })

  it('PROPOSES the newest execution and never selects it', async () => {
    // The console following the newest is a stated DEFAULT, not a choice made
    // on the operator's behalf. Calling `select` here would pin it and make a
    // background run override a human's deliberate pick — the exact failure
    // this split exists to prevent.
    const calls = spy()
    const { result } = mount([ref(NEWER)])
    await waitFor(() => { expect(result.current.ordered).toHaveLength(2) })
    expect(calls.some(call => call.startsWith(`propose:ws-1:${OTHER}`))).toBe(true)
    expect(calls.some(call => call.startsWith('select:'))).toBe(false)
  })

  it('SELECTS when the picker is used, because that is a human choosing', async () => {
    const calls = spy()
    const { result } = mount([ref(NEWER)])
    await waitFor(() => { expect(result.current.ordered).toHaveLength(2) })
    act(() => { result.current.select(NEWER) })
    expect(calls).toContain(`select:ws-1:${NEWER}`)
  })

  it('addresses every write to the PROJECT, never to the session', async () => {
    const calls = spy()
    const { result } = mount([ref(NEWER)])
    await waitFor(() => { expect(result.current.ordered).toHaveLength(2) })
    act(() => { result.current.select(NEWER) })
    expect(calls.every(call => call.split(':')[1] === 'ws-1')).toBe(true)
  })
})

// @vitest-environment jsdom
/**
 * Reaching the project's selection across a bundle boundary — and the property
 * that makes the profile's row ORDER a convention rather than a requirement.
 *
 * **Why this file exists.** `harness-profile/cordis.patch.yml` puts
 * `ui-project` ahead of `ui-loop` and says why: ui-project publishes
 * `ctx.rheplicantSelection` and ui-loop reads it. Read carelessly — as it was,
 * 2026-08-26 — that looks like an ordering REQUIREMENT, and the obvious next
 * move is a gate gets built to enforce the order. The next sentence of the
 * same comment says the opposite: *"ui-loop resolves it lazily so the order is
 * not load-bearing."*
 *
 * It resolves lazily because `source()` is `resolved ??= locate?.()` — a thunk
 * that is re-called on every read until it yields something, so a provider
 * that mounts LATER is picked up on the next read. Nothing tested that. Every
 * existing spec installs a source that already answers, so an eager
 * `ctx.get(...)` at `apply()` — the exact mistake the thunk exists to prevent —
 * would have kept them all green and made the row order load-bearing again,
 * silently.
 *
 * So the order is not gated. This is gated instead: the order does not matter
 * because of THIS, and if THIS breaks the order starts mattering again.
 */
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  chooseExecution, resetLocalSelection, setSelectionSource, useProjectSelection,
} from '../src/client/selection-bridge.ts'
import type { ProjectSelection, SelectionSource } from '../src/client/selection-bridge.ts'

afterEach(() => { cleanup(); resetLocalSelection(); setSelectionSource(undefined) })

/** Nothing selected — the shape `read` must answer with. */
const UNTOUCHED: ProjectSelection = {
  taskPath: undefined,
  executionId: undefined,
  pinned: { task: false, execution: false },
}

/**
 * A selection service that records what it was asked to do.
 *
 * Annotated `SelectionSource` rather than left to inference, so a fake that
 * has drifted from the contract fails HERE instead of passing a test that no
 * longer resembles the thing it stands in for.
 */
function service() {
  const calls: string[] = []
  const source: SelectionSource = {
    select: (workspaceId) => { calls.push(`select:${workspaceId}`) },
    propose: (workspaceId) => { calls.push(`propose:${workspaceId}`) },
    read: () => UNTOUCHED,
    subscribe: () => () => {},
  }
  return { calls, source }
}

describe('a provider that mounts after its consumer', () => {
  it('is picked up on the next read, not missed forever', () => {
    // THE PROPERTY THE PROFILE'S ROW ORDER RELIES ON NOT NEEDING. The thunk
    // answers undefined while ui-project is unmounted, and the real service
    // once it is there.
    const { calls, source } = service()
    let published: SelectionSource | undefined
    setSelectionSource(() => published)

    chooseExecution('ws-1', 'EXEC-EARLY')
    expect(calls).toEqual([])   // nobody to tell; the local stand-in took it

    published = source
    chooseExecution('ws-1', 'EXEC-LATE')
    expect(calls).toEqual(['select:ws-1'])
  })

  it('keeps working from the local stand-in while it waits', () => {
    // Not merely "does not crash": the surface has to stay usable in the
    // window, which is what the fallback is for.
    setSelectionSource(() => undefined)
    chooseExecution('ws-1', 'EXEC-1')
    const { result } = renderHook(() => useProjectSelection('ws-1'))
    expect(result.current.executionId).toBe('EXEC-1')
  })
})

describe('once it resolves', () => {
  it('stops asking — the thunk is not a per-call lookup', () => {
    const { source } = service()
    const locate = vi.fn(() => source)
    setSelectionSource(locate)
    chooseExecution('ws-1', 'A')
    chooseExecution('ws-1', 'B')
    chooseExecution('ws-1', 'C')
    expect(locate).toHaveBeenCalledTimes(1)
  })

  it('asks again each time while the answer is still undefined', () => {
    // The other half of the same rule: caching an undefined would strand the
    // consumer on the fallback for the life of the page, which IS the
    // order-dependent failure — just deferred.
    const locate = vi.fn(() => undefined)
    setSelectionSource(locate)
    chooseExecution('ws-1', 'A')
    chooseExecution('ws-1', 'B')
    expect(locate).toHaveBeenCalledTimes(2)
  })
})

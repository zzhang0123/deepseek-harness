/**
 * The one edge from a chat result node into the project surface
 * (`docs/project-model.md` §20.3).
 *
 * What these assert is the RULE, not just the outcome: both halves are
 * required, the selection is written BEFORE the surface is shown, and the verb
 * is `select` rather than `propose`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canOpenInProject, openInProject, setProjectSurface, type ProjectSurface,
} from '../src/client/project-bridge.ts'

afterEach(() => { setProjectSurface(undefined) })

/** A recording pair of services, plus the order in which they were called. */
function surface(): {
  readonly value: ProjectSurface
  readonly select: ReturnType<typeof vi.fn>
  readonly show: ReturnType<typeof vi.fn>
  readonly calls: string[]
} {
  const calls: string[] = []
  const select = vi.fn((..._args: unknown[]) => { calls.push('select') })
  const show = vi.fn((..._args: unknown[]) => { calls.push('show') })
  return {
    value: { selection: { select } as never, workbench: { show } as never },
    select,
    show,
    calls,
  }
}

describe('with no project surface in the composition', () => {
  it('does not offer the action', () => {
    expect(canOpenInProject()).toBe(false)
  })

  it('does nothing and says so when called anyway', () => {
    expect(openInProject('ws-1', { executionId: 'E1' })).toBe(false)
  })
})

describe('with only one of the two services', () => {
  it('declines when the selection is absent — showing without selecting would land somebody on whatever was already chosen', () => {
    setProjectSurface(() => ({ selection: undefined, workbench: { show: vi.fn() } }))
    expect(canOpenInProject()).toBe(false)
    expect(openInProject('ws-1', { executionId: 'E1' })).toBe(false)
  })

  it('declines when the surface is absent — selecting without showing would move a view nobody can see', () => {
    const select = vi.fn()
    setProjectSurface(() => ({ selection: { select }, workbench: undefined }))
    expect(canOpenInProject()).toBe(false)
    expect(openInProject('ws-1', { executionId: 'E1' })).toBe(false)
    expect(select).not.toHaveBeenCalled()
  })
})

describe('with both services', () => {
  it('offers the action', () => {
    const both = surface()
    setProjectSurface(() => both.value)
    expect(canOpenInProject()).toBe(true)
  })

  it('selects the exact task and execution, then shows the surface', () => {
    const both = surface()
    setProjectSurface(() => both.value)
    expect(openInProject('ws-1', { taskPath: 'tasks/fit.yaml', executionId: 'E1' })).toBe(true)
    expect(both.select).toHaveBeenCalledWith('ws-1', {
      taskPath: 'tasks/fit.yaml',
      executionId: 'E1',
    })
    expect(both.show).toHaveBeenCalledWith('ws-1')
  })

  it('selects BEFORE it shows, so what appears is already the right thing', () => {
    const both = surface()
    setProjectSurface(() => both.value)
    openInProject('ws-1', { taskPath: 'tasks/fit.yaml', executionId: 'E1' })
    expect(both.calls).toEqual(['select', 'show'])
  })

  it('uses select, never propose — a click is a choice, and the pin is what stops a later run moving the view off it', () => {
    const propose = vi.fn()
    const select = vi.fn()
    setProjectSurface(() => ({
      selection: { select, propose } as never,
      workbench: { show: vi.fn() },
    }))
    openInProject('ws-1', { executionId: 'E1' })
    expect(select).toHaveBeenCalledTimes(1)
    expect(propose).not.toHaveBeenCalled()
  })

  it('omits an absent axis rather than writing undefined over it', () => {
    const both = surface()
    setProjectSurface(() => both.value)
    openInProject('ws-1', { executionId: 'E1' })
    expect(both.select).toHaveBeenCalledWith('ws-1', { executionId: 'E1' })
  })

  it('shows the surface even for an address with nothing to select — the caller already decided it was worth going', () => {
    const both = surface()
    setProjectSurface(() => both.value)
    expect(openInProject('ws-1', {})).toBe(true)
    expect(both.select).not.toHaveBeenCalled()
    expect(both.show).toHaveBeenCalledWith('ws-1')
  })

  it('refuses an empty workspace id, which addresses no project at all', () => {
    const both = surface()
    setProjectSurface(() => both.value)
    expect(openInProject('', { executionId: 'E1' })).toBe(false)
    expect(both.show).not.toHaveBeenCalled()
  })

  it('resolves the services on every call, so a surface that mounts later is still found', () => {
    let mounted = false
    const show = vi.fn()
    setProjectSurface(() => ({
      selection: mounted ? { select: vi.fn() } : undefined,
      workbench: mounted ? { show } : undefined,
    }))
    expect(canOpenInProject()).toBe(false)
    mounted = true
    expect(canOpenInProject()).toBe(true)
    expect(openInProject('ws-1', { executionId: 'E1' })).toBe(true)
  })
})

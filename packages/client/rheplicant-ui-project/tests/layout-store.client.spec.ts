/**
 * The workbench's panel-layout store (`docs/project-model.md` §20.4).
 *
 * The rule worth asserting is the one that is easy to undo: a rule may only
 * SUGGEST a collapse, and a human's own decision — in either direction — wins
 * for good. Without it, switching tasks would re-close a panel somebody
 * deliberately opened, which is the execution axis's "propose, never select"
 * failure (§11.2) in a second place.
 */
import { describe, expect, it } from 'vitest'
import { createWorkbenchLayoutStore } from '../src/client/layout-store.ts'

/**
 * The declared draft mutators, applied to a plain state.
 *
 * `defineStore` returns `{ spec, create }` — the spec is the declaration this
 * file wrote, so the mutators can be driven directly against a fresh state
 * with no engine, no persistence and no React. What is under test is the RULE
 * each mutator encodes, not the engine's plumbing.
 */
interface State { collapsed: string[]; hidden: string[]; decided: string[] }
type Actions = Record<string, (draft: State, ...args: never[]) => void>

function store(): { state: State; act: Actions } {
  const { spec } = createWorkbenchLayoutStore() as unknown as {
    spec: { init: () => State; actions: Actions }
  }
  return { state: spec.init(), act: spec.actions }
}

describe('the initial layout', () => {
  it('collapses, hides and decides nothing', () => {
    expect(store().state).toEqual({ collapsed: [], hidden: [], decided: [] })
  })
})

describe('collapse', () => {
  it('toggles a panel and records that a human decided it', () => {
    const { state, act } = store()
    act['toggleCollapsed']!(state, 'posterior' as never)
    expect(state.collapsed).toEqual(['posterior'])
    expect(state.decided).toEqual(['posterior'])
    act['toggleCollapsed']!(state, 'posterior' as never)
    expect(state.collapsed).toEqual([])
    // Still decided: EXPANDING is a decision too, and it is the direction the
    // rule would otherwise keep undoing.
    expect(state.decided).toEqual(['posterior'])
  })
})

describe('suggest — what the no-exit rule calls', () => {
  it('collapses an untouched panel', () => {
    const { state, act } = store()
    act['suggestCollapsed']!(state, ['posterior', 'chains'] as never)
    expect(state.collapsed).toEqual(['posterior', 'chains'])
  })

  it('records no decision, so a later hand toggle still counts as the first', () => {
    const { state, act } = store()
    act['suggestCollapsed']!(state, ['posterior'] as never)
    expect(state.decided).toEqual([])
  })

  it('NEVER re-collapses a panel a human expanded', () => {
    const { state, act } = store()
    act['suggestCollapsed']!(state, ['posterior'] as never)
    act['toggleCollapsed']!(state, 'posterior' as never)
    expect(state.collapsed).toEqual([])
    act['suggestCollapsed']!(state, ['posterior'] as never)
    expect(state.collapsed).toEqual([])
  })

  it('does not duplicate a panel it has already collapsed', () => {
    const { state, act } = store()
    act['suggestCollapsed']!(state, ['posterior'] as never)
    act['suggestCollapsed']!(state, ['posterior', 'chains'] as never)
    expect(state.collapsed).toEqual(['posterior', 'chains'])
  })

  it('leaves the state object alone when it has nothing to add', () => {
    // The engine compares by identity; a no-op write that produced a new state
    // would re-render every panel on every task change.
    const { state, act } = store()
    const before = state.collapsed
    act['suggestCollapsed']!(state, [] as never)
    expect(state.collapsed).toBe(before)
  })
})

describe('hide', () => {
  it('removes and restores a panel without touching collapse', () => {
    const { state, act } = store()
    act['hide']!(state, 'spectrum' as never)
    expect(state.hidden).toEqual(['spectrum'])
    expect(state.collapsed).toEqual([])
    act['show']!(state, 'spectrum' as never)
    expect(state.hidden).toEqual([])
  })

  it('is idempotent', () => {
    const { state, act } = store()
    act['hide']!(state, 'spectrum' as never)
    act['hide']!(state, 'spectrum' as never)
    expect(state.hidden).toEqual(['spectrum'])
  })
})

describe('reset', () => {
  it('drops the decisions too — a reset that remembered them would not be one', () => {
    const { state, act } = store()
    act['toggleCollapsed']!(state, 'posterior' as never)
    act['hide']!(state, 'spectrum' as never)
    act['reset']!(state)
    expect(state).toEqual({ collapsed: [], hidden: [], decided: [] })
  })

  it('lets the rule collapse again afterwards', () => {
    const { state, act } = store()
    act['suggestCollapsed']!(state, ['posterior'] as never)
    act['toggleCollapsed']!(state, 'posterior' as never)
    act['reset']!(state)
    act['suggestCollapsed']!(state, ['posterior'] as never)
    expect(state.collapsed).toEqual(['posterior'])
  })
})

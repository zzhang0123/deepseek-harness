// @vitest-environment jsdom
/**
 * `EmptyState`'s three kinds, and the derivation that keeps them honest.
 *
 * `docs/superpowers/specs/2026-08-27-dissolution-language.md` §3: this
 * component rendered "No spectrum runs yet" — a fact about the project — and
 * "Reading the exits…" — a fetch in flight — and "This project would not serve
 * that document" — a refusal — identically. `docs/project-model.md` §27.3 is
 * the discipline it was missing: three states, not two, and the section is
 * about what collapsing them would say.
 *
 * The drawing that was going to carry the distinction was struck in review
 * (§2 of that spec), so what is pinned here is the SEMANTICS and the one
 * property that is not a matter of taste — `unavailable` must not render as
 * provisional.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EmptyState } from '../src/client/panel/EmptyState.tsx'
import { executionEmptyKind, executionEmptyReason } from '../src/client/run/execution-view.ts'
import type { LoopExecutionView } from '../src/client/run/execution-view.ts'

afterEach(() => { cleanup() })

describe('EmptyState', () => {
  it('says which kind of absence it is, in the DOM and not only in the words', () => {
    const { container } = render(<EmptyState kind="waiting" message="No spectrum runs yet" />)
    expect(container.querySelector('[data-empty-state]')?.getAttribute('data-empty-state-kind')).toBe('waiting')
    expect(screen.getByText('No spectrum runs yet')).toBeDefined()
  })

  it('carries all three kinds distinctly', () => {
    for (const kind of ['waiting', 'arriving', 'unavailable'] as const) {
      const { container } = render(<EmptyState kind={kind} message="m" />)
      expect(container.querySelector(`[data-empty-state-kind="${kind}"]`)).not.toBeNull()
      cleanup()
    }
  })

  it('draws no picture — the motif was designed and struck (spec A2 §2)', () => {
    const { container } = render(<EmptyState kind="arriving" message="Reading…" />)
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelectorAll('rect').length).toBe(0)
  })

  it('renders the hint only when there is one', () => {
    const withHint = render(<EmptyState kind="waiting" message="m" hint="h" />)
    expect(withHint.container.querySelector('[data-empty-state-hint]')?.textContent).toBe('h')
    cleanup()
    const without = render(<EmptyState kind="waiting" message="m" />)
    expect(without.container.querySelector('[data-empty-state-hint]')).toBeNull()
  })
})

/**
 * The half that a fixture handing a component its own value could never test:
 * where the kind CAME from. `docs/project-model.md` §28.7 — "a fixture that
 * hands a component the value under test cannot test where the value came
 * from" — is why this pins the derivation and not just the rendering.
 */
describe('executionEmptyKind agrees with executionEmptyReason', () => {
  const view = (problem: LoopExecutionView['problem']): LoopExecutionView =>
    ({ problem } as unknown as LoopExecutionView)

  it.each([
    ['unreadable', 'unavailable'],
    ['unavailable', 'unavailable'],
    ['loading', 'arriving'],
  ] as const)('maps problem %s to kind %s, and speaks a reason for it', (problem, kind) => {
    expect(executionEmptyKind(view(problem))).toBe(kind)
    // The reason and the kind read the same field, so a panel cannot say "not
    // yet" over a sentence saying the results were pruned.
    expect(executionEmptyReason(view(problem))).toBeTypeOf('string')
  })

  it('is `waiting` exactly when there is no problem to report', () => {
    expect(executionEmptyKind(undefined)).toBe('waiting')
    expect(executionEmptyReason(undefined)).toBeUndefined()
    expect(executionEmptyKind(view(undefined))).toBe('waiting')
    expect(executionEmptyReason(view(undefined))).toBeUndefined()
  })
})

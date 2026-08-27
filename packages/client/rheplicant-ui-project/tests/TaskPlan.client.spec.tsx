// @vitest-environment jsdom
/**
 * "How this is fitted" — the panel written to answer *"所有参数如何block的（哪些
 * 用 NUTS，哪些用 GCR，如何循环的，循环多少次）"*, and shipped with no coverage.
 *
 * The two things worth pinning are the two it got wrong:
 *
 * 1. **It printed a false statement about a bound latent.** The projection read
 *    `into:` only in its list form, so the bare-string spelling — the one
 *    upstream's own tutorial teaches — arrived as `[]` and the panel said the
 *    latent writes into nothing, beside a Model tab lighting the very operator
 *    it drives. That half lives in `python/tests/test_plan_and_observed.py`;
 *    what belongs here is that an EMPTY `into` says "the file does not say",
 *    not "there is nothing".
 * 2. **It answered half the question.** Parameters and steps were two
 *    independent lists, so which latent went through which engine was still
 *    inside a step's `blocks:` printed as raw JSON. The join is here now, and
 *    it claims only what it can see: this step's settings NAME this latent.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TaskPlan } from '../src/client/TaskPlan.tsx'
import type { DeclaredParameter, DeclaredRun, DocumentRuns } from '@rheplicant/dsh-rheplicant'

afterEach(() => { cleanup() })

function parameter(over: Partial<DeclaredParameter> = {}): DeclaredParameter {
  return {
    name: 'g', into: ['gain.gain'], family: 'normal', prior: { normal: {} },
    init: null, unit: null, modifiers: [], ...over,
  }
}

function step(over: Partial<DeclaredRun> = {}): DeclaredRun {
  return {
    index: 0, name: 'fit', kind: 'nuts', known: true, products: [], deferredChecks: [],
    options: { num_samples: 500 }, ...over,
  }
}

function draw(parameters: readonly DeclaredParameter[], declared: readonly DeclaredRun[]): void {
  render(<TaskPlan runs={{ declared } as unknown as DocumentRuns} parameters={parameters} />)
}

describe('where a fitted latent lands', () => {
  it('names the operator paths it is written into', () => {
    draw([parameter({ into: ['gain.gain', 'noise.scale'] })], [])
    const line = document.querySelector('[data-plan-into]')!
    expect(line.textContent).toContain('gain.gain')
    expect(line.textContent).toContain('noise.scale')
  })

  it('says the FILE is silent rather than that the latent is unbound', () => {
    // "writes into nothing this projection can see" was a statement about this
    // code, offered to a reader as a statement about their document.
    draw([parameter({ into: [] })], [])
    const text = document.querySelector('[data-plan-into]')!.textContent ?? ''
    expect(text).toContain('does not say where it goes')
    expect(text).not.toContain('projection')
  })
})

describe('which step names which latent', () => {
  it('finds the latent inside a step’s blocks, wherever in it the name sits', () => {
    draw([parameter({ name: 'g' })], [
      step({ index: 0, name: 'sample', kind: 'nuts', options: { blocks: [['g', 'h']] } }),
      step({ index: 1, name: 'linear', kind: 'gcr', options: { blocks: { t_coeff: {} } } }),
    ])
    const line = document.querySelector('[data-plan-fitted-by]')
    expect(line).toBeTruthy()
    expect(line!.textContent).toContain('step 1')
    expect(line!.textContent).toContain('nuts')
    expect(line!.textContent).not.toContain('gcr')
  })

  it('reads a name in the KEY position too, which is how a block map spells it', () => {
    draw([parameter({ name: 't_coeff' })], [
      step({ index: 0, name: 'linear', kind: 'gcr', options: { blocks: { t_coeff: { solver: 'cg' } } } }),
    ])
    expect(document.querySelector('[data-plan-fitted-by]')!.textContent).toContain('gcr')
  })

  it('lists every step that names it, so a blocked latent shows its loop', () => {
    draw([parameter({ name: 'g' })], [
      step({ index: 0, name: 'a', kind: 'nuts', options: { blocks: ['g'] } }),
      step({ index: 1, name: 'b', kind: 'gcr', options: { blocks: ['g'] } }),
    ])
    const text = document.querySelector('[data-plan-fitted-by]')!.textContent ?? ''
    expect(text).toContain('step 1')
    expect(text).toContain('step 2')
  })

  it('says nothing at all when no step names it', () => {
    draw([parameter({ name: 'g' })], [step({ options: { blocks: [['h']] } })])
    expect(document.querySelector('[data-plan-fitted-by]')).toBeNull()
  })

  it('leaves out a step whose service did not report its settings', () => {
    // ABSENT is not EMPTY: a compute service older than `options` sends none,
    // and "this step does not name the latent" would be a claim about the
    // document made from a fact about the service.
    const older = { ...step({ index: 0, name: 'old', kind: 'nuts' }) } as Record<string, unknown>
    delete older['options']
    draw([parameter({ name: 'g' })], [older as unknown as DeclaredRun])
    expect(document.querySelector('[data-plan-fitted-by]')).toBeNull()
  })
})

describe('a step’s own settings', () => {
  it('prints each knob verbatim, structured values included', () => {
    draw([], [step({ options: { num_samples: 500, seed: { from: 'runtime.seeds.nuts' } } })])
    const knobs = [...document.querySelectorAll('[data-plan-knob]')]
      .map(node => node.textContent ?? '')
    expect(knobs.join(' ')).toContain('500')
    expect(knobs.join(' ')).toContain('{"from":"runtime.seeds.nuts"}')
  })

  it('tells a service that reports no settings apart from a step that has none', () => {
    const older = { ...step({ index: 0, name: 'old', kind: 'nuts' }) } as Record<string, unknown>
    delete older['options']
    draw([], [older as unknown as DeclaredRun, step({ index: 1, name: 'bare', options: {} })])
    const text = document.body.textContent ?? ''
    expect(text).toContain('does not report')
    expect(text).toContain('takes the file as it stands')
  })
})

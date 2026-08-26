// @vitest-environment jsdom
/**
 * A brand seat must not depend on a slot it has nothing to do with.
 *
 * `ctx.slots.inject` WAITS for a slot to be declared, so nesting makes a chain
 * only as available as its least available link. The headline slot is the
 * newest thing in the composition; a stale bundle or an older harness does not
 * declare it, and while it was nested with the three brand marks its absence
 * took all four down at once — silently, because waiting for a slot that never
 * arrives is a legal state.
 */
import { describe, expect, it } from 'vitest'
import { apply } from '../src/client/index.ts'

/** A slots service where only the named keys are ever declared. */
function slotsWith(declared: readonly string[]) {
  const registered: string[] = []
  const run = (value: unknown) => {
    if (typeof value === 'object' && value !== null && Symbol.iterator in (value as object)) {
      for (const _ of value as Iterable<unknown>) { /* drain the generator */ }
    }
  }
  const ctx = {
    effect: (fn: () => unknown) => { fn() },
    locale: { register: () => () => {} },
    slots: {
      inject: (key: string, body: () => unknown) => {
        if (!declared.includes(key)) return undefined   // never declared: waits forever
        return run(body())
      },
      register: (spec: { name: string }) => { registered.push(spec.name); return () => {} },
    },
  }
  return { ctx, registered }
}

const ALL = [
  'sidebar.brand.mark', 'sidebar.brand.name',
  'conversation.hero.brand.mark', 'conversation.hero.headline',
]

describe('brand registrations against a composition missing the newest slot', () => {
  it('registers everything when every slot is declared', () => {
    const { ctx, registered } = slotsWith(ALL)
    apply(ctx as never)
    expect(registered).toEqual(ALL)
  })

  it('still registers the three marks when the headline slot is absent', () => {
    // THE REGRESSION. Nested, this returned [] — no brand mark anywhere.
    const { ctx, registered } = slotsWith(ALL.filter(k => k !== 'conversation.hero.headline'))
    apply(ctx as never)
    expect(registered).toEqual([
      'sidebar.brand.mark', 'sidebar.brand.name', 'conversation.hero.brand.mark',
    ])
  })
})

// @vitest-environment jsdom
/**
 * The sidebar row, and the one thing it refuses to be: a control that looks
 * like it works.
 *
 * The page and this row coordinate through a register that lives in another
 * bundle (`ui-project`). Without it the row would render, accept a press, and
 * do nothing — no error, no log. `check-composition.mjs` makes that
 * unreachable in the shipped profile, but that is an external guarantee about
 * one composition; these are the plugin's own.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { DocsTrigger } from '../src/client/DocsTrigger.tsx'
import { setSectionSource } from '../src/client/section-bridge.ts'

/** A stand-in for `ctx.rheplicantWorkbench`, which lives in another bundle. */
function fakeRegister(initial: string) {
  let section = initial
  const listeners = new Set<() => void>()
  return {
    go(next: string) {
      if (next === section) return
      section = next
      for (const listener of listeners) listener()
    },
    read() { return { section } },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    get current() { return section },
  }
}

afterEach(() => {
  cleanup()
  setSectionSource(undefined)
})

describe('with no project surface mounted', () => {
  it('renders no row at all rather than one that does nothing', () => {
    setSectionSource(() => undefined)
    const { container } = render(<DocsTrigger wide />)
    expect(container.firstChild).toBeNull()
  })
})

describe('the sidebar row', () => {
  it('renders and reports that it is not the current section', () => {
    setSectionSource(() => fakeRegister('conversation') as never)
    render(<DocsTrigger wide />)
    const row = document.querySelector('[data-docs-trigger]')
    expect(row).not.toBeNull()
    expect(row?.getAttribute('aria-pressed')).toBe('false')
    // `aria-pressed`, not `aria-expanded`: it is one of several peer places to
    // be, not a region revealed beneath the button.
    expect(row?.hasAttribute('aria-expanded')).toBe(false)
  })

  it('moves the section when pressed', () => {
    const register = fakeRegister('conversation')
    setSectionSource(() => register as never)
    render(<DocsTrigger wide />)
    fireEvent.click(document.querySelector('[data-docs-trigger]') as Element)
    expect(register.current).toBe('docs')
  })

  it('reports itself pressed while its section is on screen', () => {
    setSectionSource(() => fakeRegister('docs') as never)
    render(<DocsTrigger wide />)
    expect(document.querySelector('[data-docs-trigger]')?.getAttribute('aria-pressed')).toBe('true')
  })

  it('keeps one accessible name on the rail, where the label has no room', () => {
    setSectionSource(() => fakeRegister('conversation') as never)
    const { rerender } = render(<DocsTrigger wide />)
    const named = () => document.querySelector('[data-docs-trigger]')?.getAttribute('aria-label')
    expect(named()).toBe('Docs')
    rerender(<DocsTrigger wide={false} />)
    // The visible label is gone at this width; the accessible one must not be.
    expect(named()).toBe('Docs')
    expect(document.querySelector('[data-docs-trigger]')?.textContent).toBe('')
  })
})

// @vitest-environment jsdom
/**
 * The documentation page, and the one property that keeps it from stacking on
 * top of another section.
 *
 * The first test here is the load-bearing one: `section` is a LIST slot whose
 * occupants each paint when they decide they are on screen, so a page that
 * rendered unconditionally would draw over the workbench with nothing raising
 * an error. It is asserted before anything about content.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DocsPage } from '../src/client/DocsPage.tsx'
import { CHAPTERS } from '../src/client/chapters/index.ts'
import { TOPICS } from '../src/client/outline.ts'
import { openTopic, resetTopic } from '../src/client/docs-store.ts'
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

beforeEach(() => { resetTopic() })

describe('when another section is on screen', () => {
  it('renders nothing at all', () => {
    const register = fakeRegister('workbench')
    setSectionSource(() => register as never)
    const { container } = render(<DocsPage />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when no register is reachable', () => {
    // No project surface mounted: the truthful answer is that there is no
    // section, so this page is not the thing on screen.
    setSectionSource(() => undefined)
    const { container } = render(<DocsPage />)
    expect(container.firstChild).toBeNull()
  })
})

describe('the documentation page', () => {
  let register: ReturnType<typeof fakeRegister>

  beforeEach(() => {
    register = fakeRegister('docs')
    setSectionSource(() => register as never)
  })

  it('paints the section and names itself', () => {
    render(<DocsPage />)
    expect(document.querySelector('[data-docs-section]')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Documentation')
  })

  it('opens on the first topic', () => {
    render(<DocsPage />)
    expect(document.querySelector('[data-docs-topic]')?.getAttribute('data-docs-topic'))
      .toBe(TOPICS[0]?.id)
  })

  it('renders one rail row per topic, with the open one marked current', () => {
    render(<DocsPage />)
    expect(document.querySelectorAll('[data-docs-row]').length).toBe(TOPICS.length)
    const current = document.querySelectorAll('[aria-current="page"]')
    expect(current.length).toBe(1)
    expect(current[0]?.getAttribute('data-docs-row')).toBe(TOPICS[0]?.id)
  })

  it('switches chapter when a rail row is pressed', () => {
    render(<DocsPage />)
    const row = document.querySelector('[data-docs-row="on-disk"]')
    fireEvent.click(row as Element)
    expect(document.querySelector('[data-docs-topic]')?.getAttribute('data-docs-topic'))
      .toBe('on-disk')
    expect(screen.getByRole('heading', { level: 2, name: 'What lands on disk' })).toBeDefined()
  })

  it('steps to the next chapter from the pager', () => {
    render(<DocsPage />)
    fireEvent.click(document.querySelector('[data-docs-next]') as Element)
    expect(document.querySelector('[data-docs-topic]')?.getAttribute('data-docs-topic'))
      .toBe(TOPICS[1]?.id)
  })

  it('offers no previous link on the first chapter and no next on the last', () => {
    render(<DocsPage />)
    expect(document.querySelector('[data-docs-prev]')).toBeNull()
    act(() => { openTopic(TOPICS[TOPICS.length - 1]?.id ?? '') })
    expect(document.querySelector('[data-docs-next]')).toBeNull()
    expect(document.querySelector('[data-docs-prev]')).not.toBeNull()
  })

  it('filters the rail without changing what is being read', () => {
    render(<DocsPage />)
    fireEvent.change(document.querySelector('[data-docs-filter]') as Element, {
      target: { value: 'schedul' },
    })
    expect(document.querySelectorAll('[data-docs-row]').length).toBe(1)
    expect(document.querySelector('[data-docs-row]')?.getAttribute('data-docs-row'))
      .toBe('triggers')
    // The article is untouched: filtering is a way to FIND a topic, not a way
    // to leave the one you are on.
    expect(document.querySelector('[data-docs-topic]')?.getAttribute('data-docs-topic'))
      .toBe(TOPICS[0]?.id)
  })

  it('says so when nothing matches', () => {
    render(<DocsPage />)
    fireEvent.change(document.querySelector('[data-docs-filter]') as Element, {
      target: { value: 'kzzzq' },
    })
    expect(document.querySelectorAll('[data-docs-row]').length).toBe(0)
    expect(document.querySelector('[data-docs-no-match]')).not.toBeNull()
  })

  it('leaves for the conversation rather than closing over it', () => {
    render(<DocsPage />)
    fireEvent.click(document.querySelector('[data-docs-leave]') as Element)
    expect(register.current).toBe('conversation')
  })
})

describe('every chapter', () => {
  beforeEach(() => {
    const register = fakeRegister('docs')
    setSectionSource(() => register as never)
  })

  // One render per chapter, in one test: this is what catches a diagram whose
  // markup throws, a table row with a ragged cell count, or a chapter that
  // renders empty — none of which the outline's key comparison can see.
  it.each(TOPICS.map(topic => topic.id))('renders %s with a body under its lede', (id) => {
    render(<DocsPage />)
    act(() => { openTopic(id) })
    const article = document.querySelector(`[data-docs-topic="${id}"]`)
    expect(article).not.toBeNull()
    expect(article?.textContent).toContain(CHAPTERS[id]?.lede.slice(0, 40))
    // A lede and a heading are not a chapter; every one of them carries at
    // least one of the block forms.
    expect(article?.querySelectorAll(
      '[data-docs-table], [data-docs-note], [data-docs-cards], [data-docs-steps],'
      + ' [data-docs-figure], [data-docs-code], [data-docs-tree], [data-docs-facts]',
    ).length).toBeGreaterThan(0)
  })
})

/**
 * The tab pattern's pure half: which tab a key moves to, and what the two
 * ends of the relationship say about each other.
 *
 * The keyboard's DOM half is asserted where it is used
 * (`ProjectHome.client.spec.tsx`) — a handler that moves focus needs real
 * elements, and asserting it against a hand-built fixture would test the
 * fixture. What is here is everything that can be wrong without a document.
 */
import { describe, expect, it } from 'vitest'
import { nextTabName, panelId, tabId, tabPanelProps, tabProps } from '../src/client/tabs.ts'

const PAGES = ['overview', 'setup', 'model', 'results'] as const

describe('which tab a key moves to', () => {
  it('steps right and left', () => {
    expect(nextTabName('ArrowRight', PAGES, 'overview')).toBe('setup')
    expect(nextTabName('ArrowLeft', PAGES, 'model')).toBe('setup')
  })

  it('wraps at both ends, so End is one key from the first tab and not three', () => {
    expect(nextTabName('ArrowRight', PAGES, 'results')).toBe('overview')
    expect(nextTabName('ArrowLeft', PAGES, 'overview')).toBe('results')
  })

  it('takes Home and End to the ends', () => {
    expect(nextTabName('Home', PAGES, 'model')).toBe('overview')
    expect(nextTabName('End', PAGES, 'setup')).toBe('results')
  })

  it('leaves the vertical arrows alone, because a horizontal row does not own them', () => {
    // Claiming these would take the keys that scroll the region the tabs
    // govern, and give back a movement Left and Right already provide.
    expect(nextTabName('ArrowDown', PAGES, 'overview')).toBeUndefined()
    expect(nextTabName('ArrowUp', PAGES, 'overview')).toBeUndefined()
  })

  it('answers nothing for a key that is not ours, rather than a tab', () => {
    // `undefined` is what stops the handler swallowing the event. A fallback
    // to `current` would look identical here and would eat every keystroke.
    for (const key of ['Enter', ' ', 'a', 'Tab', 'PageDown', 'Escape']) {
      expect(nextTabName(key, PAGES, 'setup'), key).toBeUndefined()
    }
  })

  it('answers nothing when the current tab is not in the row', () => {
    // A caller bug, not a key to answer: "one to the right of nowhere" would
    // otherwise silently select the second tab.
    expect(nextTabName('ArrowRight', PAGES, 'gone' as unknown as typeof PAGES[number]))
      .toBeUndefined()
  })

  it('answers nothing for an empty row', () => {
    expect(nextTabName('Home', [] as readonly string[], 'x')).toBeUndefined()
  })
})

describe('what a tab says about itself', () => {
  it('is in the tab sequence when selected and out of it when not', () => {
    // The roving tabIndex: exactly one stop, so Tab leaves the row for the
    // page rather than walking every tab in it.
    expect(tabProps('g', 'setup', 'setup').tabIndex).toBe(0)
    expect(tabProps('g', 'setup', 'model').tabIndex).toBe(-1)
  })

  it('reports selection on the one that is selected, and only that one', () => {
    const selected = PAGES.filter(name => tabProps('g', 'model', name)['aria-selected'])
    expect(selected).toEqual(['model'])
  })

  it('names its OWN region even while that region is not rendered', () => {
    // The deliberate dangle. The alternative — every tab pointing at the one
    // element on screen — makes three tabs assert they govern a region
    // labelled by a different tab, which is wrong rather than unknown.
    const unselected = tabProps('g', 'overview', 'results')
    expect(unselected['aria-controls']).toBe(panelId('g', 'results'))
    expect(unselected['aria-controls']).not.toBe(panelId('g', 'overview'))
  })
})

describe('what the two ends say about each other', () => {
  it('round-trips: the tab names the region, and the region names the tab', () => {
    for (const name of PAGES) {
      const tab = tabProps('g', 'overview', name)
      const region = tabPanelProps('g', name)
      expect(tab['aria-controls'], name).toBe(region.id)
      expect(region['aria-labelledby'], name).toBe(tab.id)
    }
  })

  it('keeps two rows on one page apart', () => {
    // Both surfaces can be mounted at once — the workbench renders over the
    // dashboard — so the group prefix is the whole of what stops the
    // dashboard's Setups tab pointing at the workbench's Setup page.
    expect(tabId('rheplicant-dashboard', 'setups')).not.toBe(tabId('rheplicant-workbench', 'setup'))
    expect(panelId('rheplicant-dashboard', 'runs')).not.toBe(panelId('rheplicant-workbench', 'runs'))
  })

  it('makes the region focusable, so the scroll it owns is reachable', () => {
    expect(tabPanelProps('g', 'results').tabIndex).toBe(0)
    expect(tabPanelProps('g', 'results').role).toBe('tabpanel')
  })
})

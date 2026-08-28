/**
 * The tab pattern, written once for the two surfaces that use it: the
 * dashboard's Setups/Runs and the workbench's four pages.
 *
 * Both were `role="tablist"` + `role="tab"` + `aria-selected` and nothing
 * else. That triple names the widget without wiring it: no `aria-controls`, so
 * nothing said which region a tab governs; no `role="tabpanel"`, so the region
 * was not one; no roving `tabIndex`, so every tab took a stop in the sequence
 * and Tab walked the row instead of entering the page; and no arrow keys, which
 * is the movement a person who hears "tab" is then told to use. A half-declared
 * widget is worse than an undeclared one — it promises the interaction and then
 * does not answer it.
 *
 * **Here rather than in `ui-kit`.** That package's rule is its own, recorded
 * beside `soleTask`: something moves there when TWO plugins need it and it may
 * be inlined into both. Both tab rows live in this plugin, so this is the layer
 * that owns them. If a third surface elsewhere grows tabs, this file moves —
 * it has no import from this package to hold it back.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/tabs
 */
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

/**
 * The id of one tab button.
 *
 * @param group - the tab row's own name, unique in the document.
 * @param name - the tab.
 * @returns the element id.
 */
export function tabId(group: string, name: string): string {
  return `${group}-tab-${name}`
}

/**
 * The id of the region one tab governs.
 *
 * @param group - the tab row's own name, unique in the document.
 * @param name - the tab.
 * @returns the element id.
 */
export function panelId(group: string, name: string): string {
  return `${group}-panel-${name}`
}

/** What a tab button spreads onto itself. */
export interface TabProps {
  readonly id: string
  readonly role: 'tab'
  readonly 'aria-selected': boolean
  readonly 'aria-controls': string
  readonly tabIndex: 0 | -1
}

/** What the region a tab governs spreads onto itself. */
export interface TabPanelProps {
  readonly id: string
  readonly role: 'tabpanel'
  readonly 'aria-labelledby': string
  readonly tabIndex: 0
}

/**
 * One tab button's identity, state, and place in the tab sequence.
 *
 * **`aria-controls` names this tab's OWN panel, including while the tab is not
 * selected and that panel is therefore not in the document.** Both surfaces
 * render only the selected page, so the alternative — one panel element whose
 * id every tab points at — would have three tabs each asserting they govern a
 * region labelled by a different tab. A reference that resolves to nothing is
 * unknown; a reference that resolves to the wrong element is wrong, and this
 * project's own rule is that the two are not the same (`unknown` is not
 * `unmet`). The relationship that is ever acted on — the selected tab's — is
 * always live.
 *
 * The roving `tabIndex` is the other half: exactly one tab is in the sequence,
 * so Tab moves past the row into the page rather than through every tab in it.
 *
 * @param group - the tab row's own name.
 * @param current - the selected tab.
 * @param name - the tab being rendered.
 * @returns the props to spread.
 */
export function tabProps(group: string, current: string, name: string): TabProps {
  return {
    id: tabId(group, name),
    role: 'tab',
    'aria-selected': current === name,
    'aria-controls': panelId(group, name),
    tabIndex: current === name ? 0 : -1,
  }
}

/**
 * The region one tab governs.
 *
 * **`tabIndex` is 0 unconditionally, not only when the region holds nothing
 * focusable.** The APG makes it conditional; both of these regions scroll, and
 * a scrollport that cannot take focus cannot be scrolled from the keyboard —
 * the same defect, and the same remedy, as the document panel's `<pre>`. The
 * cost of being unconditional is one extra stop before content that also has
 * its own controls; the cost of being conditional is a rule that has to be
 * re-decided every time a page's content changes, silently, in the direction of
 * unreachable.
 *
 * @param group - the tab row's own name.
 * @param name - the tab whose region this is, which is always the selected one.
 * @returns the props to spread.
 */
export function tabPanelProps(group: string, name: string): TabPanelProps {
  return {
    id: panelId(group, name),
    role: 'tabpanel',
    'aria-labelledby': tabId(group, name),
    tabIndex: 0,
  }
}

/**
 * Where an arrow, Home or End moves within a tab row.
 *
 * **Left and Right only, never Up and Down.** A `tablist` is horizontal unless
 * it says otherwise and both of these are; claiming the vertical arrows would
 * take the keys that scroll the page and give back a movement the row already
 * offers. Both ends wrap, which is what the APG specifies and what makes End
 * reachable from the first tab by one key rather than three.
 *
 * Pure, and separate from the focus move it drives, so the wrap is testable
 * without a DOM.
 *
 * @param key - the `KeyboardEvent.key`.
 * @param names - the tabs, in the order the row shows them.
 * @param current - the selected tab.
 * @returns the tab to move to, or `undefined` when the key is not ours — in
 *   which case the event must be left alone rather than swallowed.
 */
export function nextTabName<T extends string>(
  key: string,
  names: readonly T[],
  current: T,
): T | undefined {
  if (names.length === 0) return undefined
  const at = names.indexOf(current)
  // A `current` the row does not contain is a caller bug, not a key to answer:
  // moving "one to the right of nowhere" would silently select the second tab.
  if (at === -1) return undefined

  switch (key) {
    case 'ArrowRight': return names[(at + 1) % names.length]
    case 'ArrowLeft': return names[(at - 1 + names.length) % names.length]
    case 'Home': return names[0]
    case 'End': return names[names.length - 1]
    default: return undefined
  }
}

/**
 * The tab row's key handler: move, select, and take the focus with it.
 *
 * **Automatic activation** — the arrow both moves focus and selects. The APG
 * calls for it when showing a tab is cheap, and here it is a local state write
 * against data already in the browser. Manual activation would mean an arrow
 * that moves a focus ring across tabs whose panels never appear, which reads as
 * a broken row.
 *
 * Focus is moved by id rather than by walking the row's children, so the
 * handler does not depend on the buttons being in the same order as `names` —
 * one row is written out by hand and the other is a `.map`, and an ordering
 * invariant spanning both would be silent when broken.
 *
 * @param group - the tab row's own name.
 * @param names - the tabs, in the order the row shows them.
 * @param current - the selected tab.
 * @param select - shows a tab.
 * @returns the `onKeyDown` for the element carrying `role="tablist"`.
 */
export function tabListKeyHandler<T extends string>(
  group: string,
  names: readonly T[],
  current: T,
  select: (name: T) => void,
): (event: ReactKeyboardEvent<HTMLElement>) => void {
  return (event) => {
    const next = nextTabName(event.key, names, current)
    if (next === undefined) return
    // Home and End scroll the panel underneath otherwise, so the row would
    // move and the page would jump.
    event.preventDefault()
    select(next)
    // Before React re-renders, so the button still carries `tabIndex={-1}` —
    // which is focusable programmatically, and becomes the row's one tab stop
    // on the render this select causes.
    event.currentTarget.ownerDocument.getElementById(tabId(group, next))?.focus()
  }
}

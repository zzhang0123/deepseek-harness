/**
 * The primary-navigation row that switches to the documentation.
 *
 * `sidebar.nav` is a root-scoped LIST slot, so this is added beside the
 * shipped controls rather than shadowing anything, and it sits with the
 * Dashboard and Workbench rows because it is the same kind of thing: a
 * destination, not a utility. The foot beside Settings was the other candidate
 * and is where utilities go — `ui-project`'s `HomeTrigger.tsx` records the
 * report that moved a whole peer surface out of it.
 *
 * **`aria-pressed`, not `aria-expanded`.** This is one of several peer places
 * you can be, so a screen reader needs "on or off", not "a region is being
 * revealed beneath this". And pressing it while already here does nothing:
 * every shipped control in this column is a destination, and pressing a
 * destination you have arrived at is not a way to leave.
 *
 * **It does not render at all without a project surface.** The page and this
 * row coordinate through a register that lives in `ui-project`, so in a
 * composition without it this button would appear, be pressed, and do nothing
 * — no error, no log, a control that looks exactly like a working one. That is
 * the failure shape this codebase refuses by name ("prefer the detectable
 * option"), and `ui-analysis`'s `canOpenInProject` already settled the
 * treatment: a composition that cannot perform an action simply never offers
 * it. Unreachable in the shipped profile, because `check-composition.mjs`
 * proves every client package is both rowed and mounted — but that is an
 * external guarantee, and this is the plugin holding up its own end.
 *
 * @module @rheplicant/dsh-rheplicant-ui-docs/client/DocsTrigger
 */

import { memo } from 'react'

import { DOCS_SECTION, hasSectionRegister, openDocs, useSection } from './section-bridge.ts'
import { IconDocs } from './DocsIcons.tsx'
import { cx } from './prose.tsx'
import styles from './docs.module.css'

/** What the sidebar hands every navigation occupant. */
interface DocsTriggerProps {
  /** False on the 56px rail, where a row has no room for its label. */
  readonly wide: boolean
}

export const DocsTrigger = memo(function DocsTrigger({ wide }: DocsTriggerProps) {
  const section = useSection()
  // Nothing to navigate to: offering the row would be offering a control that
  // silently does nothing. See this module's header.
  if (!hasSectionRegister()) return null
  const here = section === DOCS_SECTION
  return (
    <button
      type="button"
      className={cx(styles.trigger, !wide && styles.triggerRail)}
      data-docs-trigger=""
      // The rail has no room for the label, so the accessible name cannot come
      // from the visible text in that state — and giving it unconditionally
      // keeps ONE name across both, rather than one that changes on resize.
      aria-label="Docs"
      aria-pressed={here}
      title="Docs"
      onClick={() => { openDocs() }}
    >
      <IconDocs size={wide ? 16 : 18} />
      {wide && <span className={cx(styles.triggerLabel)}>Docs</span>}
    </button>
  )
})

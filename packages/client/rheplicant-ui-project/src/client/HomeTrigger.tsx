/**
 * The primary-navigation row that switches between the two peer sections.
 *
 * `sidebar.nav` is a root-scoped LIST slot, so this is added beside the
 * shipped controls rather than shadowing anything. It lived at
 * `sidebar.footer.action` until §24: that was the only additive seat this
 * column had, so a switch to a whole peer surface sat under Settings, below
 * the session list, reading as a utility. It is a destination, and it now sits
 * with New Session where destinations go.
 *
 * **A switch, not an opener (§20.2).** While the project section was a modal
 * this was a disclosure — `aria-expanded`, "Project home", press to reveal. It
 * is now one of two peer places you can be, so it reports `aria-pressed`: a
 * toggle button that is either on or off, which is what a section switch is and
 * what a screen reader needs to hear. `aria-expanded` would say a region was
 * being revealed beneath it, which was never true and is now not even the
 * shape of the thing.
 *
 * §20.1 costed this seat — the sidebar's primary navigation, needing an
 * additive edit to a shipped package — at about a week, and said the foot
 * would do until it proved wrong IN USE. It did, and the report named both
 * halves: no button where buttons belong, and a surface that stacked on the
 * conversation instead of replacing it. §24 took the edit.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/HomeTrigger
 */

import { memo } from 'react'
import { toggleHome, useHome } from './home-store.ts'
import styles from './project-home.module.css'

/** What the sidebar hands every footer action: whether the column is wide. */
interface HomeTriggerProps {
  /** False when the sidebar is the 56px rail, so the label has no room. */
  readonly wide: boolean
}

export const HomeTrigger = memo(function HomeTrigger({ wide }: HomeTriggerProps) {
  const { section } = useHome()
  return (
    <button
      type="button"
      className={wide ? styles.trigger : `${styles.trigger} ${styles.triggerRail ?? ''}`}
      data-project-home-trigger=""
      data-project-section={section === 'workbench' ? 'project' : 'conversation'}
      // The rail has no room for the label, so the accessible name has to come
      // from somewhere that is not the visible text in that state — and giving
      // it unconditionally keeps one name across both, rather than one that
      // changes when the column resizes.
      aria-label="Workbench"
      aria-pressed={section === 'workbench'}
      title="Workbench"
      onClick={toggleHome}
    >
      <span aria-hidden="true" className={styles.triggerMark}>◈</span>
      {wide && <span className={styles.triggerLabel}>Workbench</span>}
    </button>
  )
})

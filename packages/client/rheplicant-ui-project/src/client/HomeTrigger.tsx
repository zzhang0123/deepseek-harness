/**
 * The sidebar-foot control that switches between the two peer sections.
 *
 * `sidebar.footer.action` is a root-scoped LIST slot with `replaceRisk: none`,
 * so this is added beside the shipped Settings row rather than shadowing
 * anything — the reason this seat was chosen over §6.0's original
 * `conversation.hero.workspace`, which is a single-occupant popover already
 * owned by the shipped WorkspacePicker (see `docs/project-model.md` §6.0's
 * implementation note).
 *
 * **A switch, not an opener (§20.2).** While the project section was a modal
 * this was a disclosure — `aria-expanded`, "Project home", press to reveal. It
 * is now one of two peer places you can be, so it reports `aria-pressed`: a
 * toggle button that is either on or off, which is what a section switch is and
 * what a screen reader needs to hear. `aria-expanded` would say a region was
 * being revealed beneath it, which was never true and is now not even the
 * shape of the thing.
 *
 * §20.1 costs the ALTERNATIVE seat — the sidebar's primary navigation, which
 * would need an additive edit to a shipped package — at about a week. The foot
 * is the plugin-only answer, and whether it proves wrong is a question for use,
 * not for a document.
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
  const { open } = useHome()
  return (
    <button
      type="button"
      className={styles.trigger}
      data-project-home-trigger=""
      data-project-section={open ? 'project' : 'conversation'}
      // The rail has no room for the label, so the accessible name has to come
      // from somewhere that is not the visible text in that state — and giving
      // it unconditionally keeps one name across both, rather than one that
      // changes when the column resizes.
      aria-label="Project"
      aria-pressed={open}
      title="Project"
      onClick={toggleHome}
    >
      <span aria-hidden="true" className={styles.triggerMark}>◈</span>
      {wide && <span className={styles.triggerLabel}>Project</span>}
    </button>
  )
})

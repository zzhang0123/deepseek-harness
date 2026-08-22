/**
 * The sidebar-foot control that opens the project home.
 *
 * `sidebar.footer.action` is a root-scoped LIST slot with `replaceRisk: none`,
 * so this is added beside the shipped Settings row rather than shadowing
 * anything — the reason this seat was chosen over §6.0's original
 * `conversation.hero.workspace`, which is a single-occupant popover already
 * owned by the shipped WorkspacePicker (see `docs/project-model.md` §6.0's
 * implementation note).
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
      // The rail has no room for the label, so the accessible name has to come
      // from somewhere that is not the visible text in that state — and giving
      // it unconditionally keeps one name across both, rather than one that
      // changes when the column resizes.
      aria-label="Project home"
      aria-expanded={open}
      title="Project home"
      onClick={toggleHome}
    >
      <span aria-hidden="true" className={styles.triggerMark}>◈</span>
      {wide && <span className={styles.triggerLabel}>Project</span>}
    </button>
  )
})

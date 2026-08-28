/**
 * The primary-navigation row that switches to the Schedules board.
 *
 * **The third nav row, and the extraction it was supposed to trigger did not
 * happen — here is why, so nobody has to re-derive it.** `DashboardTrigger`
 * records the rule: *"the third nav row is when the shape is known, not the
 * second."* This is that third row, and the shape did not turn out to be
 * shared. `HomeTrigger` is not a twin of the other two: it calls `toggleHome`
 * rather than `toggleSection`, and it carries a legacy
 * `data-project-section` attribute that `apps/web/tests/rheplicant-ui-project-home.e2e.ts`
 * asserts. A shared component would therefore have to take a section, an icon,
 * a label, a click handler AND an optional extra data attribute for exactly one
 * of its three callers — which is every line of the component as a parameter,
 * plus a legacy concern promoted into the abstraction that replaced it.
 *
 * So: three small explicit rows, and the shared thing stays what it always
 * was — the store. One variable holding one section name is what makes them
 * mutually exclusive, and that is the part worth sharing.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/SchedulesTrigger
 */

import { memo } from 'react'
import { toggleSection, useHome } from './home-store.ts'
import { IconSchedules } from './NavIcons.tsx'
import styles from './project-home.module.css'

/** What the sidebar hands every nav row: whether the column is wide. */
interface SchedulesTriggerProps {
  /** False when the sidebar is the 56px rail, so the label has no room. */
  readonly wide: boolean
}

export const SchedulesTrigger = memo(function SchedulesTrigger({ wide }: SchedulesTriggerProps) {
  const { section } = useHome()
  return (
    <button
      type="button"
      className={wide ? styles.trigger : `${styles.trigger} ${styles.triggerRail ?? ''}`}
      data-schedules-trigger=""
      // One accessible name across both column widths, for the reason
      // `HomeTrigger` records: the rail has no room for visible text, and a
      // name that changed when the column resized would be a different control
      // to a screen reader.
      aria-label="Schedules"
      aria-pressed={section === 'schedules'}
      title="Schedules"
      onClick={() => { toggleSection('schedules') }}
    >
      <IconSchedules size={wide ? 16 : 18} />
      {wide && <span className={styles.triggerLabel}>Schedules</span>}
    </button>
  )
})

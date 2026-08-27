/**
 * The primary-navigation row that switches to the dashboard.
 *
 * Deliberately a near-twin of `HomeTrigger` rather than a shared component
 * parameterised by section. Two rows is where a shared abstraction is at its
 * least informative — it would take a section name, an icon and a label, which
 * is the whole component — and the rule-of-three the transport package records
 * applies here too: the third nav row is when the shape is known, not the
 * second. What IS shared is the store: both rows call `toggleSection`, and one
 * variable holding one section name is what makes them mutually exclusive.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/DashboardTrigger
 */

import { memo } from 'react'
import { toggleSection, useHome } from './home-store.ts'
import { IconDashboard } from './NavIcons.tsx'
import styles from './project-home.module.css'

/** What the sidebar hands every nav row: whether the column is wide. */
interface DashboardTriggerProps {
  /** False when the sidebar is the 56px rail, so the label has no room. */
  readonly wide: boolean
}

export const DashboardTrigger = memo(function DashboardTrigger({ wide }: DashboardTriggerProps) {
  const { section } = useHome()
  return (
    <button
      type="button"
      className={wide ? styles.trigger : `${styles.trigger} ${styles.triggerRail ?? ''}`}
      data-dashboard-trigger=""
      // One accessible name across both column widths, for the reason
      // HomeTrigger records: the rail has no room for visible text, and a name
      // that changed when the column resized would be a different control to a
      // screen reader.
      aria-label="Dashboard"
      aria-pressed={section === 'dashboard'}
      title="Dashboard"
      onClick={() => { toggleSection('dashboard') }}
    >
      {/* The size the sidebar gives its OWN icon in each state, so the
          three controls in this stack are one drawing convention rather
          than one icon and two text glyphs (§28.8). */}
      <IconDashboard size={wide ? 16 : 18} />
      {wide && <span className={styles.triggerLabel}>Dashboard</span>}
    </button>
  )
})

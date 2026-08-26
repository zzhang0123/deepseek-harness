/**
 * Workbench header control: show/hide every known `task.panel` occupant, plus
 * "Reset layout".
 *
 * A plain `<details>` popover rather than dsh's `Menu`
 * (`@deepseek-ai/dsh-client-ui-primitives`, a genuine platform module):
 * `Menu`'s `MenuItem` shape (`id`/`label`/`disabled`/`icon`/`danger`/`submenu`)
 * carries no data-attribute passthrough, so a row's real interactive element
 * could never itself carry `data-panels-menu-item` — the only way to make the
 * attribute appear would be smuggling it onto an inner `label` node, which
 * gives this file's own contract no real DOM meaning. `PosteriorPanel`'s
 * `<details data-corner-details>` already establishes plain `<details>` as this
 * codebase's idiom for exactly this shape of disclosure.
 *
 * Lived in ui-loop until §20.4 moved the grid it governs.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/PanelsMenu
 */
import { memo } from 'react'
import type { KnownPanel } from './known-panels.ts'
import styles from './panels-menu.module.css'

export interface PanelsMenuProps {
  readonly panels: readonly KnownPanel[]
  readonly hidden: ReadonlySet<string>
  /** Panels the task declares no exit for — labelled, never removed. */
  readonly withoutExit: ReadonlySet<string>
  readonly onToggleHidden: (id: string) => void
  readonly onReset: () => void
}

export const PanelsMenu = memo(function PanelsMenu(
  { panels, hidden, withoutExit, onToggleHidden, onReset }: PanelsMenuProps,
) {
  return (
    <details className={styles.menu} data-panels-menu>
      <summary className={styles.trigger}>Panels</summary>
      <div className={styles.body}>
        <ul className={styles.list}>
          {panels.map((panel) => {
            const isVisible = !hidden.has(panel.id)
            const unfed = withoutExit.has(panel.id)
            return (
              <li key={panel.id}>
                <label
                  className={styles.item}
                  data-panels-menu-item={panel.id}
                  {...(unfed ? { 'data-panel-without-exit': '' } : {})}
                >
                  <input
                    type="checkbox"
                    checked={isVisible}
                    onChange={() => { onToggleHidden(panel.id) }}
                  />
                  {panel.label}
                  {/* Why it arrived collapsed, said where the choice is made
                      rather than only in the panel's own empty state. */}
                  {unfed && <span className={styles.note}>no exit writes this</span>}
                </label>
              </li>
            )
          })}
        </ul>
        <button type="button" className={styles.reset} data-panels-menu-reset onClick={onReset}>
          Reset layout
        </button>
      </div>
    </details>
  )
})

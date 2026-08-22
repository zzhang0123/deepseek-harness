/**
 * Console header control: show/hide every known `console.panel` occupant,
 * plus "Reset layout". A plain `<details>` popover rather than dsh's
 * `Menu` (`@deepseek-ai/dsh-client-ui-primitives`, a genuine platform
 * module — `dsh-client-web/src/platform.ts` lists it): `Menu`'s `MenuItem`
 * shape (`id`/`label`/`disabled`/`icon`/`danger`/`submenu`) carries no
 * data-attribute passthrough, so a row's real interactive element could
 * never itself carry `data-panels-menu-item`; the only way to make the
 * attribute appear at all would be smuggling it onto an inner `label` node,
 * which does not give this file's own contract (`data-panels-menu-item`
 * naming a real, queryable row) real DOM meaning. `PosteriorPanel.tsx`'s
 * `<details data-corner-details>` already establishes plain `<details>` as
 * this codebase's own idiom for exactly this shape of disclosure, so this
 * follows it rather than fighting a primitive built for a different job.
 * @module @rheplicant/dsh-rheplicant-ui-console/client/PanelsMenu
 */
import { memo } from 'react'
import type { KnownPanel } from './known-panels.ts'
import styles from './panels-menu.module.css'

export interface PanelsMenuProps {
  readonly panels: readonly KnownPanel[]
  readonly hidden: ReadonlySet<string>
  readonly onToggleHidden: (id: string) => void
  readonly onReset: () => void
}

export const PanelsMenu = memo(function PanelsMenu({ panels, hidden, onToggleHidden, onReset }: PanelsMenuProps) {
  return (
    <details className={styles.menu} data-panels-menu>
      <summary className={styles.trigger}>Panels</summary>
      <div className={styles.body}>
        <ul className={styles.list}>
          {panels.map((panel) => {
            const isVisible = !hidden.has(panel.id)
            return (
              <li key={panel.id}>
                <label className={styles.item} data-panels-menu-item={panel.id}>
                  <input
                    type="checkbox"
                    checked={isVisible}
                    onChange={() => { onToggleHidden(panel.id) }}
                  />
                  {panel.label}
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

/** The console grid: renders every `console.panel` occupant in a responsive grid. */
import { memo, type ReactNode } from 'react'
import styles from './console.module.css'

interface ConsoleViewProps {
  renderSlot: (key: 'console.panel', owner: object) => ReactNode
}

export const ConsoleView = memo(function ConsoleView({ renderSlot }: ConsoleViewProps) {
  return (
    <section data-rheplicant-console className={styles.view}>
      <div data-console-grid className={styles.grid}>
        {renderSlot('console.panel', {})}
      </div>
    </section>
  )
})

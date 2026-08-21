/** The console grid: renders every `console.panel` occupant in a responsive grid. */
import { memo, type ReactNode } from 'react'

interface ConsoleViewProps {
  renderSlot: (key: 'console.panel', owner: object) => ReactNode
}

export const ConsoleView = memo(function ConsoleView({ renderSlot }: ConsoleViewProps) {
  return (
    <section data-rheplicant-console>
      <div
        data-console-grid
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 8 }}
      >
        {renderSlot('console.panel', {})}
      </div>
    </section>
  )
})

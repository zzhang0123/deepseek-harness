/**
 * The console shell: the LoopRail (full width, above the grid) followed by
 * every `console.panel` occupant in a responsive grid. `useSession` arrives
 * on every `conversation.view` entry through the session-scope standard kit
 * (`PropsRuntime<'conversation.view'>` — see ui-slots' `SessionStandardProps`
 * merge); LoopRail is the console shell's own reader of it, the same seat
 * every console.panel occupant already receives.
 */
import { memo, type ReactNode } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { LoopRail } from './LoopRail.tsx'
import styles from './console.module.css'

interface ConsoleViewProps {
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
  renderSlot: (key: 'console.panel', owner: object) => ReactNode
}

export const ConsoleView = memo(function ConsoleView({ useSession, renderSlot }: ConsoleViewProps) {
  return (
    <section data-rheplicant-console className={styles.view}>
      <LoopRail useSession={useSession} />
      <div data-console-grid className={styles.grid}>
        {renderSlot('console.panel', {})}
      </div>
    </section>
  )
})

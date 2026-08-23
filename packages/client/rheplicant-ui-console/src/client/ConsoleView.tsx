/**
 * The console tab: which execution this conversation is looking at, and what
 * this conversation has done.
 *
 * **It used to carry the analysis panels too, and §20.4 took them away.** The
 * same six occupants were registered twice — once into this tab's
 * `console.panel` grid and once into the workbench's `task.panel` — and the
 * pair was already drifting: Model, Exits and the document diff existed on the
 * workbench side only, and every future panel would have needed two
 * registrations or become a third asymmetry. The panels live in the project
 * surface alone now, and `console.panel` is gone entirely rather than left
 * declared and unrendered.
 *
 * What is left is what is genuinely SESSION-shaped, and only that:
 *
 * * `ProjectHeader` — which project, task and execution the conversation is on.
 *   Addressed by the project's own selection (§11.2), so it agrees with the
 *   workbench by construction rather than by being told.
 * * the activity rail — one labelled row per task THIS conversation touched
 *   (§19). The workbench's maturity rail answers the other question, read off
 *   the tree, and survives the session; this one is the log's answer and does
 *   not.
 *
 * `useSession` arrives on every `conversation.view` entry through the
 * session-scope standard kit (`PropsRuntime<'conversation.view'>` — see
 * ui-slots' `SessionStandardProps` merge); `useWorkspaces` arrives through the
 * global seat, and is used only to resolve which project this session is in.
 *
 * @module @rheplicant/dsh-rheplicant-ui-console/client/ConsoleView
 */
import { memo } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { LoopRail } from './LoopRail.tsx'
import { ProjectHeader } from './ProjectHeader.tsx'
import { useConsoleExecution } from './use-console-execution.ts'
import styles from './console.module.css'

interface ConsoleViewProps {
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
  /** Root-scope standard prop; used only to resolve this session's project. */
  useWorkspaces: <T>(selector: (state: {
    items: readonly { workspaceId: string; sessionIds: readonly string[] }[]
  }) => T) => T
}

export const ConsoleView = memo(function ConsoleView({ useSession, useWorkspaces }: ConsoleViewProps) {
  // Still owned here even with no panels below it: this is what PROPOSES the
  // newest execution to the project's selection (§11.2), and the workbench
  // reads that same selection. Dropping it would leave a conversation's own
  // run unable to move the view that shows it.
  const execution = useConsoleExecution(useSession, useWorkspaces)

  return (
    <section data-rheplicant-console className={styles.view}>
      <ProjectHeader execution={execution} />
      {/* Labelled as this CONVERSATION's activity, not the task's state —
          §11.4. The workbench's maturity rail answers the other question. */}
      <div className={styles.activity} data-session-activity>
        <span className={styles.activityLabel}>in this conversation</span>
        <LoopRail useSession={useSession} />
      </div>
    </section>
  )
})

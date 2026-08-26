/**
 * The session-header control that answers "what has THIS conversation done":
 * a button carrying the project name, opening onto the header fields and the
 * activity rail.
 *
 * **It replaces the "Console" tab** (`docs/project-model.md` §23). That tab had
 * been shrinking for two rounds — §20.4 took the panel grid to the workbench,
 * leaving a whole tab holding a header and one rail — and a tab is the wrong
 * shape for something you glance at: you had to LEAVE the conversation to see
 * what the conversation had done. A header control is beside the thing it
 * describes and costs no navigation.
 *
 * **Why this seat and not `shell.overlay`.** The design sketched a floating
 * pill on the frame-wide overlay. Measured 2026-08-25: `shell.overlay` is
 * `scope: 'root'`, so its occupants receive `GlobalStandardProps` only — no
 * `useSession`. All three things relocated here are built on the conversation
 * snapshot, so that seat cannot hold them at all.
 * `conversation.session.header.actions` is `{ kind: 'list', scope: 'session' }`
 * — additive, so nothing shipped is shadowed, and session-scoped, so the
 * standard kit hands over `useSession` — with dsh's own `JobListAction` in the
 * same seat as the shipped precedent for a badge-bearing button over a list.
 *
 * A plain `<details>` rather than dsh's `Menu`, following `PanelsMenu` and
 * `PosteriorPanel`: this codebase's idiom for a disclosure, and it keeps the
 * bundle free of a cross-plugin value import.
 *
 * THREE THINGS MOVED, and the third is the one a tab deletion would have
 * dropped silently:
 *
 * * `ProjectHeader` — which project, task and execution (§6.1).
 * * the activity rail — one labelled row per task this conversation touched
 *   (§19), label included, because without it the rail reads as a statement
 *   about the TASK (§11.4).
 * * `useLoopExecution` — which is not presentation at all: it is what
 *   PROPOSES this conversation's newest execution to the project's selection
 *   (§11.2). Left behind, a conversation's own run could no longer move the
 *   workbench that shows it. It runs whether or not the disclosure is open,
 *   for the same reason.
 *
 * @module @rheplicant/dsh-rheplicant-ui-loop/client/SessionActivity
 */
import { memo } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { LoopRail } from './LoopRail.tsx'
import { ProjectHeader } from './ProjectHeader.tsx'
import { useLoopExecution } from './use-loop-execution.ts'
import styles from './session-activity.module.css'

interface SessionActivityProps {
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
  /** Root-scope standard prop; used only to resolve this session's project. */
  useWorkspaces: <T>(selector: (state: {
    items: readonly { workspaceId: string; sessionIds: readonly string[] }[]
  }) => T) => T
}

export const SessionActivity = memo(function SessionActivity(
  { useSession, useWorkspaces }: SessionActivityProps,
) {
  // Unconditional, and above the `open` check that no longer exists: this is
  // the selection PROPOSAL (§11.2), not a rendering concern. Gating it on the
  // disclosure would mean a run only reached the workbench if someone happened
  // to have this open.
  const execution = useLoopExecution(useSession, useWorkspaces)

  // The project name is the button's whole legend when there is one. Falling
  // back to the fixed word keeps ONE accessible name across both states rather
  // than one that changes when a project resolves.
  const legend = execution.projectName ?? 'this conversation'

  return (
    <details className={styles.root} data-session-activity-root>
      <summary className={styles.trigger} data-session-activity-trigger>
        <span aria-hidden="true" className={styles.mark}>◈</span>
        <span className={styles.legend}>{legend}</span>
      </summary>
      <div className={styles.popover} data-session-activity-popover>
        <ProjectHeader execution={execution} />
        {/* Labelled as this CONVERSATION's activity, not the task's state —
            §11.4. The workbench's maturity rail answers the other question. */}
        <div className={styles.activity} data-session-activity>
          <span className={styles.activityLabel}>in this conversation</span>
          <LoopRail useSession={useSession} />
        </div>
      </div>
    </details>
  )
})

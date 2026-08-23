/**
 * What THIS CONVERSATION did: five stage segments (Author · Validate · Gates ·
 * Run · Diagnostics) rendered full-width in the console tab.
 *
 * **The session half of the split in `docs/project-model.md` §11.4.** It reads
 * the `rheplicant-loop` projection of this session's own durable events, so it
 * answers "what has just happened here" and nothing else. Whether the TASK is
 * trustworthy is a different question with a different source — the tree — and
 * it is answered by the workbench's maturity rail (`ui-project`'s
 * `task-maturity.ts`).
 *
 * The two were one rail until P7c, which is precisely what made a session look
 * like it owned a task: a validate that happened in another conversation was
 * invisible here, and a run recorded here read as a property of the document.
 *
 * All verdict logic lives in `loop-selectors.ts`; this file is presentation
 * only.
 * @module @rheplicant/dsh-rheplicant-ui-console/client/LoopRail
 */
import { memo } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { loopStages, type PassInfo, type StageInfo } from './loop-selectors.ts'
import { EMPTY_LOOP_SNAPSHOT } from './loop-snapshot-builder.ts'
import type { LoopTask } from './loop-tasks.ts'
import styles from './loop-rail.module.css'

interface LoopRailProps {
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
}

/** Scroll a stage's owning panel into view; a missing panel (not mounted, no target) is a silent no-op. */
function scrollToPanel(target: string | undefined): void {
  if (target === undefined) return
  document.querySelector(`[data-panel="${target}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// See ui-kit's Badge.tsx: `noUncheckedIndexedAccess` types every CSS Module
// lookup as possibly `undefined`; `?? ''` documents "known to exist".
const STAGE_DOT_CLASS: Record<StageInfo['state'], string> = {
  ok: styles.dotOk ?? '',
  warn: styles.dotWarn ?? '',
  error: styles.dotError ?? '',
  pending: styles.dotPending ?? '',
  idle: styles.dotIdle ?? '',
}

const PASS_CLASS: Record<PassInfo['state'], string> = {
  ok: styles.passOk ?? '',
  warn: styles.passWarn ?? '',
  error: styles.passError ?? '',
  unknown: styles.passUnknown ?? '',
}

/** Validate's four-pass breakdown, rendered as a chip row under the stage detail. */
const PassChips = memo(function PassChips({ passes }: { passes: readonly PassInfo[] }) {
  return (
    <div className={styles.passRow} data-pass-row>
      {passes.map(pass => (
        <span
          key={pass.id}
          className={`${styles.passChip} ${PASS_CLASS[pass.state]}`}
          data-pass={pass.id}
          data-pass-state={pass.state}
        >
          {pass.id}
        </span>
      ))}
    </div>
  )
})

const Stage = memo(function Stage({ stage }: { stage: StageInfo }) {
  return (
    <button
      type="button"
      className={styles.stage}
      data-loop-stage={stage.id}
      data-stage-state={stage.state}
      onClick={() => scrollToPanel(stage.panelTarget)}
    >
      <span className={styles.head}>
        <span className={`${styles.dot} ${STAGE_DOT_CLASS[stage.state]}`} />
        <span className={styles.label}>{stage.label}</span>
        {stage.stale === true ? <span className={styles.staleMarker} data-loop-stage-stale /> : null}
      </span>
      <span className={styles.detail}>{stage.detail}</span>
      {stage.passes !== undefined ? <PassChips passes={stage.passes} /> : null}
    </button>
  )
})

/**
 * One task's loop, labelled by the task it belongs to.
 *
 * The label is not decoration. Unlabelled rows for two tasks read as one
 * loop, which is the fabrication this grouping exists to stop.
 */
const TaskLoop = memo(function TaskLoop({ task }: { task: LoopTask }) {
  return (
    <div className={styles.taskLoop} data-loop-task={task.taskPath ?? ''}>
      <span className={styles.taskLabel}>
        {task.taskPath ?? 'not filed under a task'}
      </span>
      <nav className={styles.rail} data-loop-rail aria-label={`Workflow loop for ${task.taskPath ?? 'inline work'}`}>
        {loopStages(task).map(stage => <Stage key={stage.id} stage={stage} />)}
      </nav>
    </div>
  )
})

export const LoopRail = memo(function LoopRail({ useSession }: LoopRailProps) {
  const snapshot = useSession(session => session.views.get('rheplicant-loop')) ?? EMPTY_LOOP_SNAPSHOT
  // ONE RAIL PER TASK. A conversation is free to touch several, and folding
  // them into one row put task A's Validate beside task B's Run under a
  // single heading — a loop assembled out of unrelated work.
  return (
    <div className={styles.loops} data-loop-rails="">
      {snapshot.tasks.map(task => (
        <TaskLoop key={task.taskPath ?? ' inline'} task={task} />
      ))}
    </div>
  )
})

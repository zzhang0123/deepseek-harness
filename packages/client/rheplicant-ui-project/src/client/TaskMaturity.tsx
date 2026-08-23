/**
 * The task-maturity rail: how far THIS TASK has got toward being trustworthy.
 *
 * The workbench half of the split in `docs/project-model.md` §11.4. It answers
 * "should I believe this task's results", from evidence on disk, and therefore
 * survives every conversation. The console keeps the other half — what this
 * session just did — which answers a different question from a different
 * source.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/TaskMaturity
 */

import { memo } from 'react'
import { taskMaturity, type MaturityStage, type MaturityInput } from './task-maturity.ts'
import styles from './project-home.module.css'

/** Dot class per state; the vocabulary matches the console's own rail. */
const DOT: Record<MaturityStage['state'], string> = {
  ok: styles.dotOk ?? '',
  warn: styles.dotWarn ?? '',
  error: styles.dotError ?? '',
  idle: styles.dotIdle ?? '',
}

const Stage = memo(function Stage({ stage }: { stage: MaturityStage }) {
  return (
    <div className={styles.maturityStage} data-maturity-stage={stage.id} data-maturity-state={stage.state}>
      <span className={styles.maturityHead}>
        <span className={`${styles.dot} ${DOT[stage.state]}`} />
        <span className={styles.maturityLabel}>{stage.label}</span>
        {/* Rendered only when the comparison was actually made: absent means
            "could not compare", which must not read as "unchanged". */}
        {stage.stale === true && (
          <span className={styles.staleMark} data-maturity-stale title="edited since this ran">
            edited since
          </span>
        )}
      </span>
      <span className={styles.maturityDetail}>{stage.detail}</span>
    </div>
  )
})

/** Everything the rail needs, passed straight through to the selectors. */
export type TaskMaturityProps = MaturityInput

export const TaskMaturity = memo(function TaskMaturity(props: TaskMaturityProps) {
  const stages = taskMaturity(props)
  return (
    <div className={styles.maturity} data-task-maturity>
      {stages.map(stage => <Stage key={stage.id} stage={stage} />)}
    </div>
  )
})

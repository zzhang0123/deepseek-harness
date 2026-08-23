/**
 * The definition checklist: how far this task is from being one you can run.
 *
 * `docs/project-model.md` §7 and §12. The workbench's OTHER rail — maturity
 * asks "should I believe these results" of the tree, this asks "is this a
 * task at all" of the document. Labelled by its source on screen for the same
 * reason P7c labelled the activity strip: unlabelled, a rail reads as a
 * statement about whatever surface it happens to sit on.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/TaskDefinition
 */

import { memo } from 'react'
import { taskDefinition, type DefinitionCriterion, type DefinitionInput } from './task-definition.ts'
import styles from './project-home.module.css'

/**
 * Dot class per state.
 *
 * `unknown` gets its OWN mark rather than borrowing `unmet`'s: "we could not
 * check" painted as "this is wrong" is how someone starts editing a document
 * that was fine.
 */
const DOT: Record<DefinitionCriterion['state'], string> = {
  ok: styles.dotOk ?? '',
  unmet: styles.dotError ?? '',
  unknown: styles.dotIdle ?? '',
}

/** The mark beside a criterion, spelled rather than left to colour alone. */
const MARK: Record<DefinitionCriterion['state'], string> = {
  ok: 'met',
  unmet: 'not yet',
  unknown: 'unknown',
}

const Criterion = memo(function Criterion({ row }: { row: DefinitionCriterion }) {
  return (
    <div
      className={styles.maturityStage}
      data-definition-criterion={row.id}
      data-definition-state={row.state}
    >
      <span className={styles.maturityHead}>
        <span className={`${styles.dot} ${DOT[row.state]}`} />
        <span className={styles.maturityLabel}>{row.label}</span>
        <span className={styles.definitionMark} data-definition-mark={row.state}>
          {MARK[row.state]}
        </span>
      </span>
      <span className={styles.maturityDetail}>{row.detail}</span>
    </div>
  )
})

/** Everything the checklist needs, passed straight through to the selector. */
export type TaskDefinitionProps = DefinitionInput

export const TaskDefinition = memo(function TaskDefinition(props: TaskDefinitionProps) {
  const rows = taskDefinition(props)
  const met = rows.filter(row => row.state === 'ok').length
  return (
    <div className={styles.maturity} data-task-definition data-definition-met={met}>
      {rows.map(row => <Criterion key={row.id} row={row} />)}
      <p className={styles.note}>
        A task is completely defined when all four hold (§7): its inputs resolve, it
        pre-flights clean, every skipped check carries a written reason, and it has a
        name. Only then is running it the obvious next step. A reference that resolves
        OUTSIDE this project still counts — rheplicant places no restriction on where a
        <code> file: </code> may point.
      </p>
    </div>
  )
})

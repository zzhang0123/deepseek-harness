/**
 * The console header: which project, which task, and which execution the
 * panels below are showing (`docs/project-model.md` §6.1).
 *
 * Everything here is read off the `rheplicant-loop` projection — the same
 * folded run events the rest of the console reads. The header asks the host for
 * nothing, which is what lets it keep describing an execution whose results
 * have since been pruned.
 *
 * Presentational: the selection, the list and the fetches live in
 * `useLoopExecution`, because the panels below need the same selection and a
 * header naming one execution above panels drawing another is the exact
 * confusion this console exists to remove.
 *
 * SCOPE is stated on screen rather than only here: the picker offers the
 * PROJECT's executions when the host route can be reached, and falls back to
 * this session's own when it cannot. The two are different lists and the header
 * says which one it is showing.
 * @module @rheplicant/dsh-rheplicant-ui-loop/client/ProjectHeader
 */
import { memo, useCallback } from 'react'
import { Badge } from '@rheplicant/dsh-rheplicant-ui-kit/client'
import { executionTime, type HeaderExecution } from './project-selectors.ts'
import type { LoopExecutionState } from './use-loop-execution.ts'
import styles from './project-header.module.css'

interface ProjectHeaderProps {
  /** The console's selection state — see `useLoopExecution`. */
  execution: LoopExecutionState
}

/** One `label: value` pair. */
const Field = memo(function Field(
  { label, value, mono }: { label: string; value: string; mono?: boolean },
) {
  return (
    <span className={styles.field} data-header-field={label}>
      <span className={styles.label}>{label}:</span>
      <span className={`${styles.value} ${mono === true ? styles.mono : ''}`}>{value}</span>
    </span>
  )
})

export const ProjectHeader = memo(function ProjectHeader({ execution }: ProjectHeaderProps) {
  const { ordered, selected, newest, projectName, projectReadable, pinned, select } = execution
  const onPick = useCallback(
    (event: { target: { value: string } }) => { select(event.target.value) },
    [select],
  )

  if (selected === undefined) {
    return (
      <div className={styles.empty} data-project-header data-header-empty>
        {projectReadable
          ? 'No execution yet in this project — author a task, then run it.'
          : 'No execution yet in this session — author a task, then run it.'}
      </div>
    )
  }

  const time = executionTime(selected.executionId)
  const current = selected.executionId === newest
  const troubled = selected.runsFailed === true || (selected.publication ?? 'ok') !== 'ok'
  return (
    <div className={styles.header} data-project-header>
      {projectName !== undefined && projectName !== '' && (
        <Field label="project" value={projectName} />
      )}
      {selected.task !== undefined && <Field label="task" value={selected.task} />}
      <span className={styles.field} data-header-field="execution">
        <span className={styles.label}>execution:</span>
        {ordered.length > 1
          ? (
            <select
              className={styles.picker}
              aria-label="Execution"
              data-execution-picker
              value={selected.executionId}
              onChange={onPick}
            >
              {ordered.map(row => (
                <option key={row.executionId} value={row.executionId}>{optionLabel(row)}</option>
              ))}
            </select>
          )
          : <span className={`${styles.value} ${styles.mono}`}>{selected.executionId}</span>}
      </span>
      {time !== undefined && (
        <Field label="at" value={`${time} UTC${selected.transport === undefined ? '' : ` · ${selected.transport}`}`} />
      )}
      <span data-execution-freshness={current ? 'current' : 'stale'}>
        {/* `off` rather than a warning tone: a stale selection is a deliberate
            choice someone made, not a problem with the run. */}
        <Badge state={current ? 'ok' : 'off'} reason={freshnessReason(current)}>
          {current ? 'current' : 'stale'}
        </Badge>
      </span>
      {troubled && (
        <span data-execution-status={selected.runsFailed === true ? 'failed' : selected.publication}>
          <Badge state="failed" reason={troubleReason(selected)}>
            {selected.runsFailed === true ? 'failed' : selected.publication}
          </Badge>
        </span>
      )}
      {/* §6.1: rendering another session's results inside this conversation
          without saying so would be a worse version of the bug this design
          exists to kill. */}
      {!selected.fromThisSession && (
        <span className={styles.field} data-execution-foreign>
          <span className={styles.label}>from</span>
          <span className={styles.value}>
            {selected.sessionId === undefined
              ? 'another session'
              : `session ${selected.sessionId.slice(0, 8)}`}
          </span>
        </span>
      )}
      {selected.path !== undefined
        ? <div className={styles.path} data-execution-path>{selected.path}</div>
        : (
          <div className={styles.path} data-execution-unpublished>
            not published — this run kept its results in the session log only
          </div>
        )}
      {/* The rule has to say which rule is in force. Once a selection can be
          PINNED (`docs/project-model.md` §11.2), "showing the newest by
          default" is false exactly when someone has chosen otherwise — and a
          caption that keeps claiming it while an older execution is on screen
          is the kind of quiet lie this header exists to prevent. */}
      <div className={styles.rule} data-header-rule>
        {pinned
          ? `Showing an execution you chose. This list covers all `
            + `${ordered.length} execution${ordered.length === 1 ? '' : 's'} in the project`
            + `${projectReadable ? '' : ' this session produced'}.`
          : projectReadable
            ? `Showing the newest execution by default. This list covers all `
              + `${ordered.length} execution${ordered.length === 1 ? '' : 's'} in the project.`
            : `Showing this session's newest execution by default. This list covers `
              + `the ${ordered.length} run${ordered.length === 1 ? '' : 's'} of this session, `
              + 'not every execution in the project — the project could not be read from here.'}
      </div>
    </div>
  )
})

/** Why the badge reads as it does, on hover. */
function freshnessReason(current: boolean): string {
  return current
    ? 'the newest execution in this list'
    : 'an earlier execution — a newer one exists'
}

/** Why an execution is flagged. */
function troubleReason(execution: HeaderExecution): string {
  if (execution.runsFailed === true) return 'a run inside this execution failed'
  return execution.publication === 'refused'
    ? 'the document was refused, so nothing was published here'
    : 'the execution errored before it finished publishing'
}

/** `13:45:01 · 20260822T… · failed` — enough to tell two runs apart. */
function optionLabel(row: HeaderExecution): string {
  const when = executionTime(row.executionId) ?? '—'
  const trouble = row.runsFailed === true
    ? ' · failed'
    : (row.publication ?? 'ok') !== 'ok' ? ` · ${row.publication}` : ''
  const foreign = row.fromThisSession ? '' : ' · other session'
  return `${when} · ${row.executionId}${trouble}${foreign}`
}

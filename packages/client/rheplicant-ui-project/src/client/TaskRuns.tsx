/**
 * The exits: what this task computes, and what it is not reaching for.
 *
 * `docs/project-model.md` §18 — the philosophy doc's gap 5. It replaces the
 * six empty viz panels that each said "Ask the agent for a nuts run": one
 * sentence per panel, mentioning four of the eighteen exits, and only visible
 * when you happened to be looking at a task that could not fill that panel.
 *
 * **No capability column.** rheplicant has no capability concept in code —
 * see `task-runs.ts`. What is shown instead is what the source defends:
 * whether an exit needs a fitted parameter space, and what it produces.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/TaskRuns
 */

import { memo } from 'react'
import type { DocumentRuns } from '@rheplicant/dsh-rheplicant'
import { exitsInPlay, type ExitInPlay } from './task-runs.ts'
import styles from './project-home.module.css'

const Exit = memo(function Exit({ entry }: { entry: ExitInPlay }) {
  return (
    <li
      className={`${styles.exitRow} ${entry.used ? styles.exitUsed : ''}`}
      data-exit={entry.kind}
      data-exit-used={entry.used ? '' : undefined}
    >
      <span className={styles.exitHead}>
        <span className={styles.mono}>{entry.kind}</span>
        {entry.used && <span className={styles.usedMark}>declared here</span>}
        {entry.fitting && <span className={styles.chip} title="needs a fitted parameter space">fits</span>}
      </span>
      {entry.summary !== null && <p className={styles.exitWhat}>{entry.summary}</p>}
      {entry.products.length > 0 && (
        <p className={styles.exitProducts} data-exit-products="">
          writes {entry.products.join(', ')}
        </p>
      )}
    </li>
  )
})

export const TaskRuns = memo(function TaskRuns({ runs }: { runs: DocumentRuns }) {
  const view = exitsInPlay(runs)
  return (
    <div data-task-runs="">
      <p className={styles.note}>
        This task declares <strong>{view.usedCount}</strong> of the{' '}
        <strong>{runs.exitsTotal}</strong> exits rheplicant runs.
        {view.unusedFitting > 0 && (
          <> {view.unusedFitting} of the rest need a fitted parameter space.</>
        )}
        {' '}Each exit says what it writes — that is what decides whether its results
        can answer your question.
      </p>
      {view.unknown.length > 0 && (
        <p className={styles.warning} data-exit-unknown="">
          This document names {view.unknown.join(', ')}, which is not an exit this grammar
          runs. It is not counted above, and validation reports it.
        </p>
      )}
      <ul className={styles.rows} data-exit-list="">
        {view.entries.map(entry => <Exit key={entry.kind} entry={entry} />)}
      </ul>
      {runs.reserved.length > 0 && (
        <>
          <p className={styles.note} data-exit-reserved="">
            {runs.reserved.length} document keys are RESERVED for capabilities that do not
            ship yet, and are refused if written. This is the one place rheplicant names a
            capability in its own source — everywhere else the four capabilities are prose,
            which is why nothing above claims one.
          </p>
          <ul className={styles.rows}>
            {runs.reserved.map(entry => (
              <li key={entry.key} className={styles.row} data-reserved-key={entry.key}>
                <span className={styles.mono}>{entry.key}</span>
                <span className={styles.meta}>{entry.capability}</span>
                <span className={styles.chip}>{entry.section}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
})

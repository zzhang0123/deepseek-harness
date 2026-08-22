/**
 * The execution a console panel is showing, handed down the owner-props
 * channel — the same way `ConsolePanelLayoutView` reaches every occupant.
 *
 * `docs/project-model.md` §5, §6.2. A panel renders ONE execution, and until
 * now the only execution it could render was whichever the current session's
 * log last carried. Reading the published tree instead is what lets the console
 * show an execution another session produced, and what lets the durable event
 * stop carrying arrays: the folder is the record, the log is the process.
 *
 * The shape deliberately distinguishes three states, because a panel that
 * cannot tell them apart shows "no data" for all three and lies about two:
 *
 * * `runs` present — this is the execution, render it.
 * * `unavailable` — the project could not be read from here (no route, older
 *   harness, headless scaffold). Fall back to the session log.
 * * `unreadable` — the project answered, and this execution's results are gone
 *   or no longer match. Say so, naming nothing that suggests a bug.
 *
 * @module @rheplicant/dsh-rheplicant-ui-kit/client/run/execution-view
 */

import type { AnalysisRun } from './run-selectors.ts'

/** Why an execution's data is not in hand. */
export type ExecutionViewProblem = 'unavailable' | 'unreadable' | 'loading'

/** One execution's projection, as every console panel receives it. */
export interface ConsoleExecutionView {
  /** The execution being shown, when one is selected at all. */
  readonly executionId?: string
  /** The projected runs, absent while loading or when the read failed. */
  readonly runs?: readonly AnalysisRun[]
  /** Set when `runs` is absent, saying which of the three states this is. */
  readonly problem?: ExecutionViewProblem
  /** True when the selection is an execution this session did not produce. */
  readonly foreign?: boolean
}

/**
 * The runs a panel should render: the selected execution's when the console
 * supplied them, and the session log's otherwise.
 *
 * The fallback is not a nicety. A panel rendered outside the console shell — a
 * unit test, an older harness with no project route — has no execution view at
 * all, and rendering nothing there would be a regression disguised as a
 * feature.
 *
 * @param view - the owner-props execution view, absent outside the shell.
 * @param fromLog - what `selectAnalysisRuns` found in the session log.
 * @returns the runs to render.
 */
export function runsToRender(
  view: ConsoleExecutionView | undefined,
  fromLog: readonly AnalysisRun[],
): readonly AnalysisRun[] {
  if (view?.runs !== undefined) return view.runs
  // `unreadable` and `loading` are both answers ABOUT A NAMED EXECUTION, and
  // the log holds a different one. Falling back would draw one execution's
  // data under another's name -- transiently for `loading`, permanently for
  // `unreadable` -- which is the precise wrongness this design exists to
  // remove. A brief empty panel that says "Reading this execution…" is the
  // honest render.
  if (view?.problem === 'unreadable' || view?.problem === 'loading') return []
  // `unavailable` and "no view at all" are different: nothing was claimed
  // about any execution, so the session log is the best source there is.
  return fromLog
}

/**
 * What an empty panel should say, when it is empty for a reason worth naming.
 * @param view - the owner-props execution view.
 * @returns a sentence, or undefined to use the panel's ordinary empty state.
 */
export function executionEmptyReason(view: ConsoleExecutionView | undefined): string | undefined {
  if (view?.problem === 'unreadable') {
    return 'This execution\'s results are no longer readable — they may have been pruned.'
  }
  if (view?.problem === 'loading') return 'Reading this execution…'
  // A published run keeps its arrays in its results folder, not on the event
  // (`docs/project-model.md` §5). So an empty panel here is not "nothing ran" —
  // it is "the results are on disk and this console cannot reach them", and
  // saying the former would send someone looking for a bug in their document.
  if (view?.problem === 'unavailable') {
    return 'The results are in this execution\'s folder, which this console could not read.'
  }
  return undefined
}

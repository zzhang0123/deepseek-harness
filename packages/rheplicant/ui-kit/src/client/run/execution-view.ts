/**
 * The execution a console panel is showing, handed down the owner-props
 * channel — the same way `PanelLayoutView` reaches every occupant.
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
  /**
   * The post-flight gate findings this execution recorded.
   *
   * Declared here because the projection has always carried them and a
   * consumer had to cast to read them — which is how a field ends up read two
   * different ways. `unknown` per finding on purpose: this kit renders none of
   * them, and every consumer that does already owns a `GateFinding` shape it
   * validates against.
   */
  readonly gates?: readonly unknown[]
  /**
   * The signal-path graph of the document this execution RAN.
   *
   * Declared for the same reason `gates` is, and found the same way: the
   * projection has always carried it (`execution.read` reads it back out of
   * `config.input.yaml`), and both hooks were dropping it on the floor. The
   * panel therefore read the SESSION LOG alone — so selecting an execution
   * this conversation did not run drew the open conversation's model under
   * that execution's header. Invisible in any session that has the run,
   * because the two sources then agree; caught by a real end-to-end run.
   *
   * `unknown` on purpose, exactly as `gates` is: this kit renders no graph,
   * and the consumer that does already owns the shape it validates against.
   */
  readonly graph?: unknown
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

/**
 * The graph a panel should render: the selected execution's when the console
 * supplied one, and the session log's otherwise.
 *
 * The same three-state discipline {@link runsToRender} applies, and the stakes
 * are higher here. A model diagram is the most confidently-read thing on the
 * page, so drawing one execution's model under another's name is the most
 * expensive version of the mistake this design exists to prevent.
 *
 * One case differs from `runsToRender`: a view carrying `runs` but no `graph`
 * is a COMPLETE answer about this execution — its document declared no
 * `model:`. Falling back to the log there would invent a diagram for a
 * document that has none.
 *
 * @param view - the owner-props execution view, absent outside the shell.
 * @param fromLog - the graph the session log carries, if any.
 * @returns the graph to render, or undefined to render none.
 */
export function graphToRender(
  view: ConsoleExecutionView | undefined,
  fromLog: unknown,
): unknown {
  if (view?.graph !== undefined) return view.graph
  // An answer ABOUT A NAMED EXECUTION, even a negative one, is not a licence
  // to draw a different execution's model.
  if (view?.problem === 'unreadable' || view?.problem === 'loading') return undefined
  if (view?.runs !== undefined) return undefined
  return fromLog
}

/**
 * The post-flight gate findings a panel should render: the selected
 * execution's when the console supplied them, and the session log's otherwise.
 *
 * The same three-state discipline {@link graphToRender} applies, and for the
 * same reason: a finding is an accusation about a specific run, and attaching
 * one execution's refusal to another's name is worse than showing none.
 *
 * An EMPTY array from the view is a complete answer — this execution recorded
 * no findings — and is returned as such rather than falling through to the
 * log, which would resurrect an older run's refusal under a clean run's name.
 *
 * @param view - the owner-props execution view, absent outside a panel grid.
 * @param fromLog - the findings the session log carries, if any.
 * @returns the findings to render, or undefined to render none.
 */
export function gatesToRender(
  view: ConsoleExecutionView | undefined,
  fromLog: readonly unknown[] | undefined,
): readonly unknown[] | undefined {
  if (view?.gates !== undefined) return view.gates
  if (view?.problem === 'unreadable' || view?.problem === 'loading') return undefined
  // A view carrying runs is a complete answer about this execution even when
  // it names no findings.
  if (view?.runs !== undefined) return undefined
  return fromLog
}

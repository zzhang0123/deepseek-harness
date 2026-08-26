/**
 * The execution view the workbench hands its panels.
 *
 * The same `LoopExecutionView` shape ui-loop builds, so a panel cannot
 * tell which surface it is rendering in — which is what makes "both seats, one
 * selection" (`docs/project-model.md` §11.3) true rather than approximately
 * true.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/use-workbench-execution
 */

import { useEffect, useState } from 'react'
import type { AnalysisRun, LoopExecutionView } from '@rheplicant/dsh-rheplicant-ui-kit/client'
import { fetchExecutionProjection } from './project-overview-client.ts'

/** Nothing selected: the panels render their own empty states. */
const NONE: LoopExecutionView = {}

/**
 * Project the selected execution for the workbench's panels.
 *
 * @param workspaceId - the project, or undefined when none is chosen.
 * @param executionId - the execution, or undefined when none is chosen.
 * @param nonce - bump to re-read the same execution.
 * @returns the view every panel receives through the slot's owner props.
 */
export function useWorkbenchExecution(
  workspaceId: string | undefined,
  executionId: string | undefined,
  nonce = 0,
): LoopExecutionView {
  const [view, setView] = useState<LoopExecutionView>(NONE)

  useEffect(() => {
    if (workspaceId === undefined || executionId === undefined) {
      setView(NONE)
      return
    }
    const controller = new AbortController()
    // `loading` rather than an empty view: a panel told "loading" renders
    // nothing and says so, where an empty view would fall back to a session
    // log the workbench does not have and draw nothing with no explanation.
    setView({ executionId, foreign: false, problem: 'loading' })
    void fetchExecutionProjection(workspaceId, executionId, controller.signal).then((answer) => {
      if (controller.signal.aborted) return
      if (answer === undefined) setView({ executionId, foreign: false, problem: 'unavailable' })
      else if (answer === 'unreadable') setView({ executionId, foreign: false, problem: 'unreadable' })
      // `gates` and `graph` travel too. Keeping only `runs` left the
      // workbench's Gates panel empty for an execution whose tree HAS
      // findings, and its Signal path empty always — the panel then fell back
      // to a session log this surface does not have.
      else {
        setView({
          executionId,
          foreign: false,
          runs: (answer.runs ?? []) as AnalysisRun[],
          // `gates` is SPREAD, never defaulted to `[]`. `RunOutcome.gates` is
          // an optional wire field, so JSON drops the key when nothing was
          // carried — and `?? []` turned "not carried" into "asked and
          // answered", which is the one distinction §28.3 turns on. The panel
          // reads an empty array as a complete answer about the execution;
          // handing it one the wire never sent makes it state a fact nobody
          // measured. Found by review, and the spec could not see it because
          // it supplied `gates: []` to the panel directly.
          ...(answer.gates === undefined ? {} : { gates: answer.gates }),
          ...(answer.graph === undefined ? {} : { graph: answer.graph }),
        })
      }
    })
    return () => { controller.abort() }
  }, [workspaceId, executionId, nonce])

  return view
}

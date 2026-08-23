/**
 * Whether the selected task is DEFINED, checked whenever the selection names
 * one.
 *
 * `docs/project-model.md` §12.7 — it runs on selection rather than behind a
 * button. Both halves of the check are pure functions of the document's text
 * (no build, no file contents read), and §7's whole point is that the next
 * step should be visible without being sought; a checklist you have to ask
 * for is a checklist nobody sees.
 *
 * The same three-state discipline `use-task-document.ts` uses, for the same
 * reason: a document the host REFUSED and a route that could not be reached
 * are different facts, and rendering one as the other sends someone looking
 * for a bug in their own project.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/use-task-definition
 */

import { useEffect, useState } from 'react'
import type { ProjectDefinitionBody } from '@rheplicant/dsh-rheplicant'
import { fetchTaskDefinition } from './project-overview-client.ts'
import type { DefinitionProblem } from './task-definition.ts'

/** What the workbench knows about the check it is showing. */
export interface TaskDefinitionState {
  /** The report, or undefined when it could not be had. */
  readonly report: ProjectDefinitionBody | undefined
  /** Why there is no report, or undefined when there is one. */
  readonly problem: DefinitionProblem | undefined
  /** Which task this describes; never render it under another. */
  readonly shownFor: string | undefined
}

const IDLE: TaskDefinitionState = { report: undefined, problem: undefined, shownFor: undefined }

/**
 * Check the selected task.
 *
 * @param workspaceId - the project, or undefined when none is chosen.
 * @param taskPath - the task, or undefined when none is chosen.
 * @param nonce - bump to re-check the same task.
 * @returns the report and the states around it.
 */
export function useTaskDefinition(
  workspaceId: string | undefined,
  taskPath: string | undefined,
  nonce = 0,
): TaskDefinitionState {
  const [state, setState] = useState<TaskDefinitionState>(IDLE)

  useEffect(() => {
    if (workspaceId === undefined || taskPath === undefined) {
      setState(IDLE)
      return
    }
    const controller = new AbortController()
    const key = `${workspaceId} ${taskPath}`
    // Dropped across a change of TASK, held across a refresh of the same one.
    // Holding another task's verdict under this task's name is the confusion
    // §11 exists to remove, and the digest guard would not catch it: the
    // digests would simply both be "known" and different, reading as "the
    // document changed" rather than "this is the wrong task".
    setState(current => ({
      report: current.shownFor === key ? current.report : undefined,
      problem: 'loading',
      shownFor: key,
    }))
    void fetchTaskDefinition(workspaceId, taskPath, controller.signal).then((answer) => {
      if (controller.signal.aborted) return
      setState({
        report: answer === 'refused' || answer === undefined ? undefined : answer,
        problem: answer === 'refused' ? 'refused' : answer === undefined ? 'unreachable' : undefined,
        shownFor: key,
      })
    })
    return () => { controller.abort() }
  }, [workspaceId, taskPath, nonce])

  return state
}

/**
 * The selected task's signal path and declared physics, needing no execution.
 *
 * `docs/project-model.md` §17. The same three-state discipline every reader
 * here uses, with one addition worth naming: `rheplicant.gui` is an OPTIONAL
 * extra, so "could not be reached" is a normal state on a working install and
 * not a fault to report as one.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/use-document-projection
 */

import { useEffect, useState } from 'react'
import type { ProjectDocumentProjectionBody } from '@rheplicant/dsh-rheplicant'
import { fetchDocumentProjection } from './project-overview-client.ts'

/** What the workbench knows about the projection it is showing. */
export interface DocumentProjectionState {
  readonly projection: ProjectDocumentProjectionBody | undefined
  readonly loading: boolean
  /** True when the host REFUSED the path — different from unreachable. */
  readonly refused: boolean
  /** Which task this describes; never render it under another. */
  readonly shownFor: string | undefined
}

const IDLE: DocumentProjectionState = {
  projection: undefined, loading: false, refused: false, shownFor: undefined,
}

/**
 * The key a projection is held under, and the one definition of it.
 *
 * Exported because the CALLER needs it too: "this state describes the request
 * I just made" is a different fact from `loading`, and only the key can tell
 * them apart. Between a caller changing its arguments and the effect below
 * firing there is a render where `loading` is false and `shownFor` still names
 * the previous request — and reading that as "settled" is how a panel comes to
 * report a failure for a fetch that was never attempted.
 *
 * @param workspaceId - the project.
 * @param taskPath - the task.
 * @param executionId - the execution, for an as-run projection.
 * @returns the key, or undefined when there is nothing to project.
 */
export function projectionKey(
  workspaceId: string | undefined,
  taskPath: string | undefined,
  executionId?: string,
): string | undefined {
  if (workspaceId === undefined || taskPath === undefined) return undefined
  return `${workspaceId} ${taskPath}${executionId === undefined ? '' : ` ${executionId}`}`
}

/**
 * Project a document: the selected task, or the bytes an execution ran.
 *
 * **One hook, two sources (§28.1).** With `executionId` it projects that
 * execution's `config.input.yaml` through the same route and therefore the
 * same renderer, which is what lets the Model section put "as declared"
 * beside "as run" without the two differing in colour before they differ in
 * content.
 *
 * @param workspaceId - the project, or undefined when none is chosen.
 * @param taskPath - the task, or undefined when none is chosen.
 * @param nonce - bump to re-project the same task.
 * @param executionId - project what THIS execution ran instead of the task as
 *   it stands. Absent for the declared projection.
 * @returns the projection and the states around it.
 */
export function useDocumentProjection(
  workspaceId: string | undefined,
  taskPath: string | undefined,
  nonce = 0,
  executionId?: string,
): DocumentProjectionState {
  const [state, setState] = useState<DocumentProjectionState>(IDLE)

  useEffect(() => {
    if (workspaceId === undefined || taskPath === undefined) {
      setState(IDLE)
      return
    }
    const controller = new AbortController()
    // The execution is IN the key: a diagram held across a change of execution
    // would be believed, which is the same hazard the task key exists for.
    const key = projectionKey(workspaceId, taskPath, executionId) as string
    setState(current => ({
      // Held across a refresh of the same task only. A diagram carried across
      // a change of task would be believed, which is the whole hazard.
      projection: current.shownFor === key ? current.projection : undefined,
      loading: true,
      refused: false,
      shownFor: key,
    }))
    void fetchDocumentProjection(
      workspaceId, taskPath, controller.signal, executionId,
    ).then((answer) => {
      if (controller.signal.aborted) return
      setState({
        projection: answer === 'refused' || answer === undefined ? undefined : answer,
        loading: false,
        refused: answer === 'refused',
        shownFor: key,
      })
    })
    return () => { controller.abort() }
  }, [workspaceId, taskPath, nonce, executionId])

  return state
}

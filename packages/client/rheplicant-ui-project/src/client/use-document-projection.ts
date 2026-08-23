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
 * Project the selected task.
 *
 * @param workspaceId - the project, or undefined when none is chosen.
 * @param taskPath - the task, or undefined when none is chosen.
 * @param nonce - bump to re-project the same task.
 * @returns the projection and the states around it.
 */
export function useDocumentProjection(
  workspaceId: string | undefined,
  taskPath: string | undefined,
  nonce = 0,
): DocumentProjectionState {
  const [state, setState] = useState<DocumentProjectionState>(IDLE)

  useEffect(() => {
    if (workspaceId === undefined || taskPath === undefined) {
      setState(IDLE)
      return
    }
    const controller = new AbortController()
    const key = `${workspaceId} ${taskPath}`
    setState(current => ({
      // Held across a refresh of the same task only. A diagram carried across
      // a change of task would be believed, which is the whole hazard.
      projection: current.shownFor === key ? current.projection : undefined,
      loading: true,
      refused: false,
      shownFor: key,
    }))
    void fetchDocumentProjection(workspaceId, taskPath, controller.signal).then((answer) => {
      if (controller.signal.aborted) return
      setState({
        projection: answer === 'refused' || answer === undefined ? undefined : answer,
        loading: false,
        refused: answer === 'refused',
        shownFor: key,
      })
    })
    return () => { controller.abort() }
  }, [workspaceId, taskPath, nonce])

  return state
}

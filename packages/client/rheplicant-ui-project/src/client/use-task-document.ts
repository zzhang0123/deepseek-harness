/**
 * The selected task's document, fetched when the selection names one.
 *
 * The same three-state discipline the overview uses, for the same reason: a
 * document that could not be READ and a task that has no document are
 * different facts, and rendering one as the other sends someone looking for a
 * bug in their own project.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/use-task-document
 */

import { useEffect, useState } from 'react'
import { fetchTaskDocument, type TaskDocumentBody } from './project-overview-client.ts'

/** What the workbench knows about the document it is showing. */
export interface TaskDocumentState {
  readonly loading: boolean
  /** The document, or undefined when it could not be read. */
  readonly document: TaskDocumentBody | undefined
  /** True when the host REFUSED the path — a different fact from unreachable. */
  readonly refused: boolean
  /** Which task {@link document} belongs to; never render it under another. */
  readonly shownFor: string | undefined
}

const IDLE: TaskDocumentState = {
  loading: false, document: undefined, refused: false, shownFor: undefined,
}

/**
 * Fetch the selected task's document.
 *
 * @param workspaceId - the project, or undefined when none is chosen.
 * @param taskPath - the task, or undefined when none is chosen.
 * @param nonce - bump to re-read the same document.
 * @returns the document and the states around it.
 */
export function useTaskDocument(
  workspaceId: string | undefined,
  taskPath: string | undefined,
  nonce = 0,
): TaskDocumentState {
  const [state, setState] = useState<TaskDocumentState>(IDLE)

  useEffect(() => {
    if (workspaceId === undefined || taskPath === undefined) {
      setState(IDLE)
      return
    }
    const controller = new AbortController()
    const key = `${workspaceId} ${taskPath}`
    setState(current => ({
      loading: true,
      // Held across a REFRESH of the same document only. Across a change of
      // task it is dropped, because showing one task's YAML under another
      // task's name is the failure this whole phase exists to remove.
      document: current.shownFor === key ? current.document : undefined,
      refused: false,
      shownFor: key,
    }))
    void fetchTaskDocument(workspaceId, taskPath, controller.signal).then((answer) => {
      if (controller.signal.aborted) return
      setState({
        loading: false,
        document: answer === 'refused' || answer === undefined ? undefined : answer,
        refused: answer === 'refused',
        shownFor: key,
      })
    })
    return () => { controller.abort() }
  }, [workspaceId, taskPath, nonce])

  return state
}

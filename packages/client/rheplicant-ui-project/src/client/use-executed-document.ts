/**
 * The document an execution actually RAN, read back off its own directory.
 *
 * `config.input.yaml` is the exact bytes the run was given — it is what makes
 * "as authored vs as it ran" answerable rather than merely flaggable
 * (`docs/project-model.md` §11.4). Fetched only when an execution is
 * selected, because there is nothing to compare against otherwise.
 *
 * The same three-state discipline every other reader here uses: pruned and
 * unreachable are different facts, and rendering one as the other sends
 * someone looking for a bug in their own project.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/use-executed-document
 */

import { useEffect, useState } from 'react'
import { fetchExecutionArtifact } from './project-overview-client.ts'

/** What the workbench knows about the executed document it is showing. */
export interface ExecutedDocumentState {
  /** The bytes that ran, or undefined when they could not be had. */
  readonly text: string | undefined
  /** True when the project answered that this execution is gone or changed. */
  readonly unreadable: boolean
  readonly loading: boolean
  /** Which execution this describes; never render it under another. */
  readonly shownFor: string | undefined
}

const IDLE: ExecutedDocumentState = {
  text: undefined, unreadable: false, loading: false, shownFor: undefined,
}

/**
 * Read one execution's `config.input.yaml`.
 *
 * @param workspaceId - the project, or undefined when none is chosen.
 * @param executionId - the execution, or undefined when none is chosen.
 * @param nonce - bump to re-read the same execution.
 * @returns the bytes that ran, and the states around them.
 */
export function useExecutedDocument(
  workspaceId: string | undefined,
  executionId: string | undefined,
  nonce = 0,
): ExecutedDocumentState {
  const [state, setState] = useState<ExecutedDocumentState>(IDLE)

  useEffect(() => {
    if (workspaceId === undefined || executionId === undefined) {
      setState(IDLE)
      return
    }
    const controller = new AbortController()
    const key = `${workspaceId} ${executionId}`
    setState(current => ({
      // Held across a refresh of the SAME execution, dropped across a change
      // of execution: diffing the authored document against another
      // execution's bytes would report changes nobody made.
      text: current.shownFor === key ? current.text : undefined,
      unreadable: false,
      loading: true,
      shownFor: key,
    }))
    void fetchExecutionArtifact(workspaceId, executionId, 'config.input.yaml', controller.signal)
      .then((answer) => {
        if (controller.signal.aborted) return
        setState({
          text: answer.ok ? answer.text : undefined,
          unreadable: !answer.ok && answer.reason === 'unreadable',
          loading: false,
          shownFor: key,
        })
      })
    return () => { controller.abort() }
  }, [workspaceId, executionId, nonce])

  return state
}

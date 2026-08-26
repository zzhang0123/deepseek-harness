/**
 * The Model section's two sources, and the guards between them.
 *
 * `docs/project-model.md` §28.1. The workbench used to draw the canonical
 * graph AND carry a `signal-path` panel drawing the selected execution's —
 * two copies of one picture, in two different fixed themes, with neither
 * saying which it was. The panel is gone; the comparison it was accidentally
 * providing lives here, stated, over ONE renderer.
 *
 * It is a hook of its own for the reason the review that prompted it gave:
 * this is forty lines of state, a fetch and three guards, and inlining it put
 * `ProjectHome` within twenty lines of this repo's own file ceiling.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/use-model-source
 */

import { useEffect, useState } from 'react'
import type { ProjectExecutionRow, ProjectTaskRow } from '@rheplicant/dsh-rheplicant'
import { taskSegmentOf } from './home-selectors.ts'
import type { ModelSourceView } from './TaskModel.tsx'
import {
  projectionKey, useDocumentProjection, type DocumentProjectionState,
} from './use-document-projection.ts'

/** What the Model panel needs in order to render either source. */
export interface ModelSourceState {
  /** The as-run projection, IDLE until somebody asks for it. */
  readonly asRun: DocumentProjectionState
  /** True when the as-run projection is the one to draw. */
  readonly comparing: boolean
  /** What `TaskModel` renders its switch from. */
  readonly source: ModelSourceView
}

/** Everything the two sources are derived from. */
export interface ModelSourceInput {
  readonly workspaceId: string | undefined
  readonly taskPath: string | undefined
  readonly executionId: string | undefined
  readonly nonce: number
  /** The selected task's row, absent when the selection names no listed task. */
  readonly task: ProjectTaskRow | undefined
  /** The selected execution's row, absent when it is not in this listing. */
  readonly execution: ProjectExecutionRow | undefined
  /** sha256 of the authored document, absent when it could not be computed. */
  readonly documentDigest: string | undefined
}

/**
 * Resolve which model the section is showing, and whether it may compare.
 *
 * @param input - the selection, the two rows behind it, and the digest.
 * @returns the projection, the flag, and the switch's own view.
 */
export function useModelSource(input: ModelSourceInput): ModelSourceState {
  const [showing, setShowing] = useState<'authored' | 'as-run'>('authored')

  // **The execution has to belong to the selected TASK.** This surface's
  // Executions list is the PROJECT's (§28.4), so the two axes can name
  // different documents — and comparing them would diff one document's bytes
  // against another's and report an edit nobody made. Found by review, on a
  // path two clicks long. The execution row now carries its task as well, so
  // this is the second of two guards rather than the only one.
  const canCompare = input.task !== undefined && input.execution !== undefined
    && input.execution.task === taskSegmentOf(input.task.path)
  const comparing = showing === 'as-run' && canCompare

  // FETCHED ONLY WHEN ASKED FOR: passing `undefined` for the task path is what
  // keeps the hook idle, so the ordinary case costs one projection rather than
  // two. It goes through the SAME route as the authored one, so the two
  // pictures differ only where the DOCUMENTS do.
  const asRun = useDocumentProjection(
    input.workspaceId,
    comparing ? input.taskPath : undefined,
    input.nonce,
    input.executionId,
  )

  // Any selection that makes the comparison impossible puts the section back.
  // Keyed on `canCompare` rather than on the execution id, so a change of TASK
  // resets it too.
  useEffect(() => {
    if (!canCompare) setShowing('authored')
  }, [canCompare])

  // THREE states, and the third is why: between a caller changing the
  // projection hook's arguments and its effect firing there is a render where
  // `loading` is false and `shownFor` still names the previous request.
  // Reading that as settled made the panel report "could not be read back" for
  // a fetch it had not yet attempted. `projectionKey` is that hook's own
  // definition, imported rather than restated.
  const settled = asRun.shownFor === projectionKey(
    input.workspaceId, input.taskPath, input.executionId,
  )
  const state: ModelSourceView['state'] = !comparing
    ? undefined
    : settled && asRun.projection !== undefined
      ? 'ready'
      : settled && !asRun.loading
        ? 'unavailable'
        : 'loading'

  // Whether the authored bytes ARE the executed bytes, from the SIDECAR digest
  // the tree already carries — two decisions in one line. It needs no fetch,
  // so the switch can say whether the two documents differ BEFORE anyone
  // presses it; and it is the same comparison the maturity rail's `edited
  // since` chip makes, so the two cannot disagree. A second derivation of one
  // fact is what §28 exists to remove, not to add.
  const identical = !canCompare || input.execution?.taskDigest === undefined
    || input.documentDigest === undefined
    ? undefined
    : input.execution.taskDigest === input.documentDigest

  return {
    asRun,
    comparing,
    source: {
      showing,
      // The switch appears only when there IS something to compare with — an
      // execution of THIS task.
      ...(canCompare && input.executionId !== undefined
        ? { onShow: setShowing, executionId: input.executionId }
        : {}),
      ...(state === undefined ? {} : { state }),
      ...(identical === undefined ? {} : { identical }),
    },
  }
}

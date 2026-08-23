/**
 * The console's one source of "which execution are we showing, and what is in
 * it" — shared by the header that names it and the panels that render it.
 *
 * `docs/project-model.md` §6.1, §6.2. Both halves have to agree: a header
 * naming one execution above panels drawing another is the exact confusion
 * this console exists to remove, so the selection and its data are owned in one
 * place and handed down.
 *
 * @module @rheplicant/dsh-rheplicant-ui-console/client/use-console-execution
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { AnalysisRun } from '@rheplicant/dsh-rheplicant-ui-kit/client'
import type { ConsoleExecutionView } from '@rheplicant/dsh-rheplicant-ui-kit/client'
import { EMPTY_LOOP_SNAPSHOT } from './loop-snapshot-builder.ts'
import { chooseExecution, proposeExecution, useProjectSelection } from './selection-bridge.ts'
import {
  fetchExecution,
  fetchProjectExecutions,
  type ProjectExecutionsBody,
} from './project-api-client.ts'
import { mergeExecutions, projectName, type HeaderExecution } from './project-selectors.ts'

/** Everything the console shell needs to render a selection. */
export interface ConsoleExecutionState {
  /** Every offerable execution, newest first. */
  readonly ordered: readonly HeaderExecution[]
  /** The one being shown, or undefined when there is none. */
  readonly selected: HeaderExecution | undefined
  /** The newest id, which is what "current" means. */
  readonly newest: string | undefined
  /** The project's name, when it is known. */
  readonly projectName: string | undefined
  /** False when the project routes could not be reached at all. */
  readonly projectReadable: boolean
  /**
   * True when a human pinned this execution, so the newest-by-default rule is
   * NOT what is on screen. The header says which rule is in force, and it can
   * only do that if it is told.
   */
  readonly pinned: boolean
  /** Choose an execution; passing the newest id returns to following it. */
  readonly select: (executionId: string) => void
  /** What every console panel receives through the slot's owner props. */
  readonly executionView: ConsoleExecutionView
}

type SessionReader = <T>(selector: (snapshot: ConversationSnapshot) => T) => T

/** Just enough of the workspace list to find which project this session is in. */
interface WorkspaceListLike {
  items: readonly { workspaceId: string; sessionIds: readonly string[] }[]
}
type WorkspaceReader = <T>(selector: (state: WorkspaceListLike) => T) => T

/**
 * Read the console's selection and the data behind it.
 *
 * The selection is NOT owned here any more (`docs/project-model.md` §11.2). It
 * belongs to the project, so this hook reads and writes the project's, and the
 * session's only remaining job is to say which executions it produced and
 * which project it is in.
 *
 * @param useSession - the standard `conversation.view` session reader.
 * @param useWorkspaces - the standard workspace-list reader, used only to
 *   resolve this session's project.
 * @returns the selection, the list, and the panels' execution view.
 */
export function useConsoleExecution(
  useSession: SessionReader,
  useWorkspaces?: WorkspaceReader,
): ConsoleExecutionState {
  const sessionId = String(useSession(session => session.sessionId))
  // Which project this conversation belongs to. A session belongs to at most
  // one workspace, so this is a lookup, not a choice.
  const workspaceId = useWorkspaces?.(state =>
    state.items.find(row => row.sessionIds.some(id => String(id) === sessionId))?.workspaceId)
  const own = useSession(
    session => session.views.get('rheplicant-loop')?.executions ?? EMPTY_LOOP_SNAPSHOT.executions,
  )

  const [project, setProject] = useState<ProjectExecutionsBody | undefined>(undefined)
  // Re-read the project whenever this session publishes another execution: a
  // run is the only thing that changes the tree from in here.
  const publishedCount = own.length
  useEffect(() => {
    const controller = new AbortController()
    void fetchProjectExecutions(sessionId, controller.signal)
      .then((body) => { if (!controller.signal.aborted) setProject(body) })
    return () => { controller.abort() }
  }, [sessionId, publishedCount])

  const ordered = useMemo(() => mergeExecutions(own, project?.executions), [own, project])
  const newest = ordered[0]?.executionId

  const selection = useProjectSelection(workspaceId)
  const selectedId = selection.executionId
  // A selection naming an execution this project does not offer shows nothing,
  // so fall back to the default rather than rendering an empty console under a
  // name nobody can see in the list.
  const known = selectedId !== undefined && ordered.some(row => row.executionId === selectedId)
  const selected = known ? ordered.find(row => row.executionId === selectedId) : ordered[0]

  // The default rule, stated in §11.2: absent an explicit choice, follow the
  // newest execution. Offered as a PROPOSAL, so it fills the selection for a
  // surface that has none and never overrides one a human pinned.
  useEffect(() => {
    if (newest !== undefined) proposeExecution(workspaceId, newest)
  }, [workspaceId, newest])

  const select = useCallback((executionId: string) => {
    chooseExecution(workspaceId, executionId)
  }, [workspaceId])

  // No "request" machinery any more. P6 needed one because a selection was
  // addressed to a SESSION and had to be carried across a navigation; a
  // project-owned selection is simply already there when this mounts.

  const [projection, setProjection] = useState<
    { id: string; runs?: readonly AnalysisRun[]; problem?: 'unreadable' | 'unavailable' } | undefined
  >(undefined)
  const selectedExecutionId = selected?.executionId
  const published = selected?.path !== undefined
  useEffect(() => {
    if (selectedExecutionId === undefined || !published) {
      setProjection(undefined)
      return
    }
    const controller = new AbortController()
    void fetchExecution(sessionId, selectedExecutionId, controller.signal).then((answer) => {
      if (controller.signal.aborted) return
      if (answer === undefined) setProjection({ id: selectedExecutionId, problem: 'unavailable' })
      else if (answer === 'unreadable') setProjection({ id: selectedExecutionId, problem: 'unreadable' })
      else setProjection({ id: selectedExecutionId, runs: (answer.runs ?? []) as AnalysisRun[] })
    })
    return () => { controller.abort() }
  }, [sessionId, selectedExecutionId, published])

  const executionView = useMemo<ConsoleExecutionView>(() => {
    if (selected === undefined) return {}
    const base = {
      executionId: selected.executionId,
      foreign: !selected.fromThisSession,
    }
    // An unpublished run has no tree to read; its data is on its own event and
    // the log path is not a fallback but the ONLY correct source.
    if (!published) return base
    if (projection?.id !== selected.executionId) return { ...base, problem: 'loading' as const }
    if (projection.runs !== undefined) return { ...base, runs: projection.runs }
    return { ...base, problem: projection.problem }
  }, [selected, published, projection])

  return {
    ordered,
    selected,
    newest,
    projectName: project?.project !== undefined && project.project !== ''
      ? project.project
      : sessionProjectName(own),
    projectReadable: project !== undefined,
    // Only meaningful while the pinned execution is actually offerable; a pin
    // on something this project no longer lists has already fallen back.
    pinned: selection.pinned.execution && known,
    select,
    executionView,
  }
}

/** The project name from this session's own executions, for the fallback path. */
function sessionProjectName(executions: readonly { resultsPath?: string }[]): string | undefined {
  for (let index = executions.length - 1; index >= 0; index -= 1) {
    const found = projectName(executions[index]?.resultsPath)
    if (found !== undefined) return found
  }
  return undefined
}

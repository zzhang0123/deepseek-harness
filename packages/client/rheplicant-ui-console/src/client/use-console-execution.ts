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
  /** Choose an execution; passing the newest id returns to following it. */
  readonly select: (executionId: string) => void
  /** What every console panel receives through the slot's owner props. */
  readonly executionView: ConsoleExecutionView
}

type SessionReader = <T>(selector: (snapshot: ConversationSnapshot) => T) => T

/**
 * Own the console's selection and the data behind it.
 * @param useSession - the standard `conversation.view` session reader.
 * @returns the selection, the list, and the panels' execution view.
 */
export function useConsoleExecution(useSession: SessionReader): ConsoleExecutionState {
  const sessionId = String(useSession(session => session.sessionId))
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
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)

  // Follow the newest execution until someone chooses otherwise, and resume
  // following it if the chosen one leaves the list.
  const known = selectedId !== undefined && ordered.some(row => row.executionId === selectedId)
  useEffect(() => {
    if (selectedId !== undefined && !known) setSelectedId(undefined)
  }, [selectedId, known])
  const selected = known ? ordered.find(row => row.executionId === selectedId) : ordered[0]

  const select = useCallback((executionId: string) => {
    setSelectedId(executionId === newest ? undefined : executionId)
  }, [newest])

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

/**
 * One project's overview, fetched when the home opens on it.
 *
 * Three states the caller must keep apart, because they read differently on
 * screen and confusing them is the failure this whole design exists to avoid:
 *
 * * `loading` with no overview — asked, no answer yet. Render nothing rather
 *   than "empty".
 * * `overview: undefined`, not loading — the project could not be READ from
 *   here (no route plugin, an id the registry dropped). Say so; do not say
 *   "no tasks".
 * * `overview` with empty lists — the project genuinely holds nothing. That is
 *   an invitation to create a task, not a failure.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/use-project-overview
 */

import { useEffect, useState } from 'react'
import { fetchProjectOverview, type ProjectOverviewBody } from './project-overview-client.ts'

/** What the home knows about the project it is showing. */
export interface ProjectOverviewState {
  readonly loading: boolean
  /** The project's contents, or undefined when it could not be read. */
  readonly overview: ProjectOverviewBody | undefined
  /**
   * Which workspace {@link overview} describes.
   *
   * Load-bearing, not bookkeeping: a stale overview may be held on screen
   * through a REFRESH of the same project, and must never be held through a
   * CHANGE of project — that would draw one project's tasks under another
   * project's name, the same class of bug `runsToRender` exists to prevent
   * for executions.
   */
  readonly shownFor: string | undefined
}

const IDLE: ProjectOverviewState = { loading: false, overview: undefined, shownFor: undefined }

/**
 * Fetch one project's overview, re-fetching when the selection changes.
 *
 * @param workspaceId - the project to read, or undefined for "none chosen".
 * @param open - whether the home is showing. A closed home fetches nothing:
 *   this runs a directory walk on the host, and doing one for a surface nobody
 *   is looking at is how a background cost gets attributed to the wrong thing.
 * @param nonce - bump to re-read the same project (the Refresh control). A
 *   results tree changes under the browser, so re-reading has to be possible
 *   without changing the selection.
 * @returns the loading flag, the overview, and which project it describes.
 */
export function useProjectOverview(
  workspaceId: string | undefined,
  open: boolean,
  nonce = 0,
): ProjectOverviewState {
  const [state, setState] = useState<ProjectOverviewState>(IDLE)

  useEffect(() => {
    if (!open || workspaceId === undefined) {
      setState(IDLE)
      return
    }
    const controller = new AbortController()
    setState(current => ({
      loading: true,
      // Held only for a refresh of the SAME project, so Refresh does not blank
      // the page it is refreshing. Dropped the moment the project changes.
      overview: current.shownFor === workspaceId ? current.overview : undefined,
      shownFor: workspaceId,
    }))
    void fetchProjectOverview(workspaceId, controller.signal).then((overview) => {
      if (controller.signal.aborted) return
      setState({ loading: false, overview, shownFor: workspaceId })
    })
    return () => { controller.abort() }
  }, [workspaceId, open, nonce])

  return state
}

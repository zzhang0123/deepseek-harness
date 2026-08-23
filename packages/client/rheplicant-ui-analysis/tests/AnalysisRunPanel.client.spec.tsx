// @vitest-environment jsdom
/**
 * The chat result node's one way to go deeper (`docs/project-model.md` §20.3).
 *
 * The node is the surface anchored to the turn that CAUSED a result, so what
 * matters here is that the action addresses THAT result — and that it is absent
 * whenever pressing it could not honestly do so.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnalysisRunPanel } from '../src/client/AnalysisRunPanel.tsx'
import { setProjectSurface } from '../src/client/project-bridge.ts'
import type { AnalysisRunChatData } from '../src/client/analysis-definition.ts'

// This repo does not run vitest with `globals`, so Testing Library's
// auto-cleanup is never registered — an uncleaned tree leaks into the next test.
afterEach(() => {
  cleanup()
  setProjectSurface(undefined)
})

const WORKSPACES = {
  items: [{ workspaceId: 'ws-1', sessionIds: ['s-1'] }],
}

/** The root-scope workspace reader every slot component receives. */
const useWorkspaces = <T,>(selector: (state: typeof WORKSPACES) => T): T => selector(WORKSPACES)

function draw(data: AnalysisRunChatData, sessionId = 's-1'): void {
  render(
    <AnalysisRunPanel
      {...({ node: { data }, sessionId, useWorkspaces } as unknown as ComponentProps<typeof AnalysisRunPanel>)}
    />,
  )
}

const RAN: AnalysisRunChatData = {
  runs: [{
    name: 'fit',
    kind: 'nuts',
    status: 'ok',
    executionId: 'E1',
    taskPath: 'tasks/fit.yaml',
  }],
}

describe('the action to open a result in the project view', () => {
  it('is offered once the services are reachable', () => {
    setProjectSurface(() => ({ selection: { select: vi.fn() }, workbench: { show: vi.fn() } }))
    draw(RAN)
    expect(screen.getByText('Open in the project view')).toBeTruthy()
  })

  it('carries the execution and task it addresses, so a reader can see what it will select', () => {
    setProjectSurface(() => ({ selection: { select: vi.fn() }, workbench: { show: vi.fn() } }))
    draw(RAN)
    const button = document.querySelector('[data-open-in-project]')
    expect(button?.getAttribute('data-open-in-project')).toBe('E1')
    expect(button?.getAttribute('data-open-in-project-task')).toBe('tasks/fit.yaml')
  })

  it('selects that exact pair and shows the surface', () => {
    const select = vi.fn()
    const show = vi.fn()
    setProjectSurface(() => ({ selection: { select }, workbench: { show } }))
    draw(RAN)
    fireEvent.click(screen.getByText('Open in the project view'))
    expect(select).toHaveBeenCalledWith('ws-1', {
      taskPath: 'tasks/fit.yaml',
      executionId: 'E1',
    })
    expect(show).toHaveBeenCalledWith('ws-1')
  })

  it('is one control per NODE, not per run — every run here came from one event', () => {
    setProjectSurface(() => ({ selection: { select: vi.fn() }, workbench: { show: vi.fn() } }))
    draw({
      runs: [
        { name: 'fwd', kind: 'forward', status: 'ok', executionId: 'E1', taskPath: 'tasks/fit.yaml' },
        { name: 'fit', kind: 'nuts', status: 'ok', executionId: 'E1', taskPath: 'tasks/fit.yaml' },
      ],
    })
    expect(document.querySelectorAll('[data-open-in-project]').length).toBe(1)
  })

  it('is absent with no project surface mounted, rather than present and inert', () => {
    draw(RAN)
    expect(screen.queryByText('Open in the project view')).toBeNull()
  })

  it('is absent for a run that was never published, which has no execution to open', () => {
    setProjectSurface(() => ({ selection: { select: vi.fn() }, workbench: { show: vi.fn() } }))
    draw({ runs: [{ name: 'scratch', kind: 'forward', status: 'ok' }] })
    expect(screen.queryByText('Open in the project view')).toBeNull()
  })

  it('is absent when this session is in no workspace, because there is no project to open', () => {
    setProjectSurface(() => ({ selection: { select: vi.fn() }, workbench: { show: vi.fn() } }))
    draw(RAN, 's-elsewhere')
    expect(screen.queryByText('Open in the project view')).toBeNull()
  })

  it('still draws the result itself when the action is absent', () => {
    draw(RAN)
    expect(document.querySelector('[data-run-name="fit"]')).toBeTruthy()
  })

  it('opens on the first run carrying an identity, when an earlier one has none', () => {
    const select = vi.fn()
    setProjectSurface(() => ({ selection: { select }, workbench: { show: vi.fn() } }))
    draw({
      runs: [
        { name: 'scratch', kind: 'forward', status: 'ok' },
        { name: 'fit', kind: 'nuts', status: 'ok', executionId: 'E9', taskPath: 'tasks/fit.yaml' },
      ],
    })
    fireEvent.click(screen.getByText('Open in the project view'))
    expect(select).toHaveBeenCalledWith('ws-1', { taskPath: 'tasks/fit.yaml', executionId: 'E9' })
  })
})

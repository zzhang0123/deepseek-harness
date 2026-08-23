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
  published: true,
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
      published: true,
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
    draw({ published: false, runs: [{ name: 'scratch', kind: 'forward', status: 'ok' }] })
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
      published: true,
      runs: [
        { name: 'scratch', kind: 'forward', status: 'ok' },
        { name: 'fit', kind: 'nuts', status: 'ok', executionId: 'E9', taskPath: 'tasks/fit.yaml' },
      ],
    })
    fireEvent.click(screen.getByText('Open in the project view'))
    expect(select).toHaveBeenCalledWith('ws-1', { taskPath: 'tasks/fit.yaml', executionId: 'E9' })
  })
})


describe('a run that published nothing', () => {
  /**
   * The wire makes the two cases disjoint: `receipt()` strips a run's arrays
   * when it published, and leaves them when it did not. So a node carrying
   * draws is exactly a node nothing else can draw — and these assert that the
   * node draws them, and does NOT offer a project view that has no folder to
   * open.
   */
  const SCRATCH: AnalysisRunChatData = {
    published: false,
    runs: [{
      name: 'scratch',
      kind: 'nuts',
      status: 'ok',
      executionId: 'E-inline',
      chains: {
        g: [1, 1.1, 1.2, 1.05, 1.08, 1.15],
        'wide.mean': [10, 10.4, 10.8, 11.1, 11.4, 11.7],
        'wide.q05': [9, 9.4, 9.8, 10.1, 10.4, 10.7],
        'wide.q95': [11, 11.4, 11.8, 12.1, 12.4, 12.7],
      },
    }],
  }

  it('draws its chain groups, because nothing else can', () => {
    draw(SCRATCH)
    const draws = document.querySelector('[data-scratch-draws="scratch"]')
    expect(draws).toBeTruthy()
    // The fanned/band grammar is grouped by the SAME ui-kit derivation the
    // project surface uses, not a second implementation.
    expect(draws!.querySelector('[data-chain-group="g"] [data-chart-kind="trace"]')).toBeTruthy()
    expect(draws!.querySelector('[data-chain-group="wide"] [data-band]')).toBeTruthy()
  })

  it('draws an mmodes spectrum the same way', () => {
    draw({
      published: false,
      runs: [{
        name: 'mmode',
        kind: 'mmodes',
        status: 'ok',
        spectrum: [[0.1, 0.2], [0.3, null]],
      }],
    })
    const grid = document.querySelector('[data-scratch-draws="mmode"] [data-spectrum-grid]')
    expect(grid).toBeTruthy()
    expect(grid!.querySelectorAll('[data-cell]').length).toBe(4)
    expect(grid!.querySelectorAll('[data-cell-null]').length).toBe(1)
  })

  it('keeps them closed by default — this is a transcript, not a dashboard', () => {
    draw(SCRATCH)
    expect((document.querySelector('[data-scratch-draws]') as HTMLDetailsElement).open).toBe(false)
  })

  it('says WHY they are here rather than in the project view', () => {
    draw(SCRATCH)
    expect(document.querySelector('[data-scratch-draws]')?.textContent)
      .toContain('published nothing')
  })

  it('does NOT offer the project view, which has no folder to open', () => {
    setProjectSurface(() => ({ selection: { select: vi.fn() }, workbench: { show: vi.fn() } }))
    draw(SCRATCH)
    expect(screen.queryByText('Open in the project view')).toBeNull()
  })

  it('draws nothing for a run that produced no arrays', () => {
    draw({ published: false, runs: [{ name: 'fwd', kind: 'forward', status: 'ok' }] })
    expect(document.querySelector('[data-scratch-draws]')).toBeNull()
  })
})

describe('a run that DID publish', () => {
  it('draws no charts here — its arrays are in its folder, and the project view has them', () => {
    // `receipt()` strips them, so there is nothing to draw even if this tried.
    // The assertion is the OTHER half of the disjointness: one seat per run.
    draw(RAN)
    expect(document.querySelector('[data-scratch-draws]')).toBeNull()
  })
})


describe('a historical event carrying an explicit null', () => {
  /**
   * The same wire shape that crashed the viz panels, on the surface that draws
   * them now. This node is a CHAT node, so the blast radius is the whole
   * transcript block — the failure mode already recorded for
   * `RunDiagnostics.notes`.
   */
  it('draws nothing for null chains rather than crashing the node', () => {
    expect(() => {
      draw({ published: false, runs: [{ name: 'fit', kind: 'nuts', status: 'ok', chains: null } as never] })
    }).not.toThrow()
    expect(document.querySelector('[data-scratch-draws]')).toBeNull()
    // The run row itself still renders: the guard degrades the charts, not the
    // result.
    expect(document.querySelector('[data-run-name="fit"]')).toBeTruthy()
  })

  it('draws nothing for a null spectrum rather than crashing the node', () => {
    expect(() => {
      draw({ published: false, runs: [{ name: 'mmode', kind: 'mmodes', status: 'ok', spectrum: null } as never] })
    }).not.toThrow()
    expect(document.querySelector('[data-scratch-draws]')).toBeNull()
    expect(document.querySelector('[data-run-name="mmode"]')).toBeTruthy()
  })
})

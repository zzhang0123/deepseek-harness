// @vitest-environment jsdom
/**
 * The spectrum panel's heatmap.
 *
 * Retired from `rheplicant-ui-console-load.e2e.ts` and
 * `rheplicant-console-charts.e2e.ts` — §20.4 removed the console grid those
 * drove, and the workbench that replaced it reads the published tree, so a
 * seeded never-published run has no browser surface left. The assertions
 * themselves were about this component, and they still are.
 */
import { cleanup, render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { SpectrumPanel } from '../src/client/SpectrumPanel.tsx'

afterEach(() => { cleanup() })

const NO_SESSION = { views: new Map(), chat: { nodes: new Map() }, nodes: [] }
const useSession = <T,>(selector: (snapshot: ConversationSnapshot) => T): T =>
  selector(NO_SESSION as unknown as ConversationSnapshot)

/** The m-mode magnitudes the retired browser fixture seeded, verbatim. */
const MMODE = {
  name: 'mmode',
  kind: 'mmodes',
  status: 'ok' as const,
  spectrum: [[0, 1, 2, 3, 4], [1, 2, 3, 4, 5], [2, 3, 4, 5, 6], [3, 4, 5, 6, 7], [4, 5, 6, 7, 8]],
}

function draw(runs: readonly unknown[] = [MMODE]): void {
  render(<SpectrumPanel {...({ useSession, execution: { executionId: 'E1', runs } } as unknown as ComponentProps<typeof SpectrumPanel>)} />)
}

describe('the spectrum panel', () => {
  it('names itself in the shared panel chrome', () => {
    draw()
    expect(document.querySelector('[data-panel="spectrum"] [data-panel-title]')?.textContent)
      .toBe('Spectrum')
  })

  it('renders the run and every heatmap cell', () => {
    draw()
    expect(document.querySelectorAll('[data-spectrum-run][data-run-name="mmode"]').length).toBe(1)
    // The chart kit's HeatMap emits one `[data-cell]` per magnitude.
    expect(document.querySelectorAll('[data-cell]').length).toBe(25)
  })

  it('renders no row for a run with no spectrum', () => {
    draw([{ name: 'fit', kind: 'nuts', status: 'ok' }])
    expect(document.querySelectorAll('[data-spectrum-run]').length).toBe(0)
  })

  it('marks a non-finite cell rather than painting it as a magnitude', () => {
    // Ported from `rheplicant-console-charts.e2e.ts`: a null cell is a draw
    // whose value was not finite, and colouring it would put a number on
    // screen that the run never produced.
    draw([{
      name: 'mmode',
      kind: 'mmodes',
      status: 'ok' as const,
      spectrum: [[0.1, 0.2, 0.3, 0.4], [0.5, null, 0.7, 0.8], [0.9, 1, 1.1, 1.2], [1.3, 1.4, 1.5, 1.6]],
    }])
    const run = document.querySelector('[data-spectrum-run][data-run-name="mmode"]')!
    expect(run.querySelectorAll('[data-cell]').length).toBe(16)
    expect(run.querySelectorAll('[data-cell-null]').length).toBe(1)
    expect(run.querySelectorAll('[data-ramp]').length).toBe(1)
  })
})

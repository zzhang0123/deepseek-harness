// @vitest-environment jsdom
/**
 * The signal-path panel's legend: four distinct chips, each its own element.
 *
 * **Ported from `rheplicant-console-loop.e2e.ts`.** That scenario drove this
 * panel through the console's `console.panel` grid; §20.4 removed the grid,
 * and the workbench that replaced it hands its panels an empty conversation,
 * so a seeded log-only graph has no browser surface left.
 *
 * The regression this guards is a DOM-level one — the chips once had no
 * separating whitespace between them and read as one run of concatenated text
 * (`sourcetransformprocessingwire`) — so `textContent` on each chip is exactly
 * the right check, and it needs no layout.
 */
import { cleanup, render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { SignalPathPanel } from '../src/client/SignalPathPanel.tsx'

afterEach(() => { cleanup() })

const GRAPH = {
  graph: 'single-antenna',
  lit: ['sky'],
  skipped: [],
  svg: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" role="img"></svg>',
}

const useSession = <T,>(selector: (snapshot: ConversationSnapshot) => T): T =>
  selector({ views: new Map(), chat: { nodes: new Map() }, nodes: [] } as unknown as ConversationSnapshot)

function draw(execution: unknown): void {
  render(<SignalPathPanel {...({ useSession, execution } as unknown as ComponentProps<typeof SignalPathPanel>)} />)
}

describe('the signal-path panel', () => {
  it('draws the SELECTED execution\'s graph, with no conversation anywhere', () => {
    draw({ executionId: 'E1', runs: [], graph: GRAPH })
    expect(document.querySelector('[data-panel="signal-path"] [data-panel-title]')?.textContent)
      .toBe('Signal path')
    expect(document.querySelector('[data-signal-path-legend]')).toBeTruthy()
  })

  it('renders four chips, each carrying its OWN text and nothing of a neighbour\'s', () => {
    draw({ executionId: 'E1', runs: [], graph: GRAPH })
    const legend = document.querySelector('[data-signal-path-legend]')!
    expect(legend.querySelectorAll('[data-legend-node]').length).toBe(4)
    for (const kind of ['source', 'transform', 'processing', 'wire']) {
      const chip = legend.querySelector(`[data-legend-node="${kind}"]`)!
      // textContent, not innerText: the bug was DOM-level concatenation.
      expect(chip.textContent).toBe(kind)
      expect(chip.querySelectorAll('[data-legend-swatch]').length).toBe(1)
    }
  })

  it('draws nothing for an execution whose document declared no model', () => {
    // A view carrying runs and no graph is a COMPLETE answer; inventing a
    // diagram from somewhere else would be the most expensive guess available.
    draw({ executionId: 'E1', runs: [] })
    expect(document.querySelector('[data-signal-path-legend]')).toBeNull()
    expect(document.body.textContent).toContain('No signal path yet')
  })
})

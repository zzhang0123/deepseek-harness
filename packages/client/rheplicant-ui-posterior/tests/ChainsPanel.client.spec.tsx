// @vitest-environment jsdom
/**
 * The chains panel's rendering: one row per run that carries draws.
 *
 * Retired from `rheplicant-ui-console-load.e2e.ts` for the reason
 * `PosteriorPanel.client.spec.tsx` records — §20.4 removed the console grid,
 * and a never-published run has no browser surface left.
 */
import { cleanup, render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { ChainsPanel } from '../src/client/ChainsPanel.tsx'

afterEach(() => { cleanup() })

const NO_SESSION = { views: new Map(), chat: { nodes: new Map() }, nodes: [] }
const useSession = <T,>(selector: (snapshot: ConversationSnapshot) => T): T =>
  selector(NO_SESSION as unknown as ConversationSnapshot)

const FIT = {
  name: 'fit',
  kind: 'nuts',
  status: 'ok' as const,
  chains: { g: [1.0, 1.1, 1.2, 1.05, 1.08, 1.15], amp: [0.5, 0.51, 0.49, 0.52, 0.5, 0.5] },
}

function draw(runs: readonly unknown[] = [FIT]): void {
  render(<ChainsPanel {...({ useSession, execution: { executionId: 'E1', runs } } as unknown as ComponentProps<typeof ChainsPanel>)} />)
}

describe('the chains panel', () => {
  it('names itself in the shared panel chrome', () => {
    draw()
    expect(document.querySelector('[data-panel="chains"] [data-panel-title]')?.textContent)
      .toBe('Chains')
  })

  it('renders one row per run carrying draws', () => {
    draw()
    expect(document.querySelectorAll('[data-chains-run][data-run-name="fit"]').length).toBe(1)
  })

  it('renders no row for a run with no draws', () => {
    draw([{ name: 'fwd', kind: 'forward', status: 'ok' }])
    expect(document.querySelectorAll('[data-chains-run]').length).toBe(0)
  })
})


describe('a historical event carrying an explicit null', () => {
  // See `PosteriorPanel.client.spec.tsx` for why `null` is a real wire shape.
  it('renders its empty state instead of crashing', () => {
    expect(() => { draw([{ name: 'fit', kind: 'nuts', status: 'ok', chains: null }]) }).not.toThrow()
    expect(document.querySelectorAll('[data-chains-run]').length).toBe(0)
    expect(document.querySelector('[data-panel="chains"]')).toBeTruthy()
  })
})

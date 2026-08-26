// @vitest-environment jsdom
/**
 * The Gates panel: one card per priced check, the run's post-flight findings,
 * and the two always-on informational checks.
 *
 * **Ported from `rheplicant-console-loop.e2e.ts`.** This panel used to have a
 * seat in the console's `console.panel` grid, driven off the session log;
 * §20.4 removed the grid, and the workbench that replaced it hands its panels
 * an EMPTY conversation (§11.5) and reads the published tree — so a seeded,
 * never-published gates report has no browser surface left. The assertions are
 * the same ones, against the same fixture values.
 */
import { cleanup, render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { GatesPanel } from '../src/client/GatesPanel.tsx'

afterEach(() => { cleanup() })

/** The verbatim skip reason, asserted byte-for-byte: a reason is never paraphrased. */
const IDENTIFIABILITY_SKIP_REASON =
  'Skipped pending a redesigned prior — rank test would reject every current draft.'

const CHECKS = [
  {
    check: 'linearity', mode: 'refuse', id: 'C12', state: 'refuse', record: true,
    reason: null, where: 'inference.checks.linearity', rtol: null,
  },
  {
    check: 'identifiability', mode: 'skip', id: 'C13', state: 'skip', record: false,
    reason: IDENTIFIABILITY_SKIP_REASON, where: 'inference.checks.identifiability', rtol: 0.01,
  },
  {
    check: 'prior_sensitivity', mode: 'skip', id: 'C19', state: 'off', record: false,
    reason: null, where: 'inference.checks.prior_sensitivity', rtol: null,
  },
]

const FINDING = {
  check: 'C12',
  severity: 'refuse',
  where: 'inference.checks.linearity',
  message: 'Linearity departure exceeds tolerance for operator NoiseWave.',
}

/**
 * The loop projection this panel reads its priced checks from. One task, so
 * `soleTask` accepts it — a conversation with several tasks makes the panel
 * DECLINE rather than guess which one it is showing (§19.1).
 */
const SNAPSHOT = {
  tasks: [{
    taskPath: 'tasks/global-signal-fit.yaml',
    gates: { report: { checks: CHECKS, runs: [], warnings: [] }, document: {}, transport: 'local', seq: 4 },
    executions: [],
    latestSeq: 4,
  }],
  executions: [],
}

const useSession = <T,>(selector: (snapshot: ConversationSnapshot) => T): T =>
  selector({
    views: new Map([['rheplicant-loop', SNAPSHOT]]),
    chat: { nodes: new Map() },
    nodes: [],
  } as unknown as ConversationSnapshot)

function draw(): void {
  render(
    <GatesPanel
      {...({
        useSession,
        execution: { executionId: 'E1', runs: [], gates: [FINDING] },
      } as unknown as ComponentProps<typeof GatesPanel>)}
    />,
  )
}

describe('the gates panel', () => {
  it('takes its findings from the EXECUTION, not from whatever the log last ran', () => {
    // The gap §20.4 exposed: this panel read the log alone, and the workbench
    // hands its panels an empty conversation on purpose — so every execution
    // read "no gates evidence yet", including ones whose tree records a refusal.
    render(
      <GatesPanel
        {...({
          useSession: <T,>(selector: (s: ConversationSnapshot) => T): T => selector({
            views: new Map(), chat: { nodes: new Map() }, nodes: [],
          } as unknown as ConversationSnapshot),
          execution: { executionId: 'E1', runs: [], gates: [FINDING] },
        } as unknown as ComponentProps<typeof GatesPanel>)}
      />,
    )
    expect(document.querySelectorAll('[data-gate-finding]').length).toBe(1)
    // And it says why the priced checks are absent rather than leaving a space
    // that reads as "this document declares no checks".
    expect(document.querySelector('[data-gate-checks-absent]')).toBeTruthy()
  })

  it('renders an execution\'s EMPTY findings as a complete answer, not as a reason to show the log\'s', () => {
    render(
      <GatesPanel
        {...({ useSession, execution: { executionId: 'E2', runs: [], gates: [] } } as unknown as ComponentProps<typeof GatesPanel>)}
      />,
    )
    expect(document.querySelectorAll('[data-gate-finding]').length).toBe(0)
  })

  it('says the execution could not be read, rather than that nothing ran', () => {
    render(
      <GatesPanel
        {...({
          useSession: <T,>(selector: (s: ConversationSnapshot) => T): T => selector({
            views: new Map(), chat: { nodes: new Map() }, nodes: [],
          } as unknown as ConversationSnapshot),
          execution: { executionId: 'E3', problem: 'unreadable' },
        } as unknown as ComponentProps<typeof GatesPanel>)}
      />,
    )
    expect(document.body.textContent).toContain('no longer readable')
  })

  it('names itself in the shared panel chrome', () => {
    draw()
    expect(document.querySelector('[data-panel="gates"] [data-panel-title]')?.textContent).toBe('Gates')
  })

  it('renders one card per priced check', () => {
    draw()
    expect(document.querySelectorAll('[data-gate-check]').length).toBe(3)
  })

  it('shows a refused check with its state, its badge and its mono path', () => {
    draw()
    const card = document.querySelector('[data-gate-check][data-check="linearity"]')!
    expect(card.getAttribute('data-check-state')).toBe('refuse')
    expect(card.querySelector('[data-badge-state]')?.getAttribute('data-badge-state')).toBe('refuse')
    expect(card.querySelector('[data-check-where] code')?.textContent)
      .toBe('inference.checks.linearity')
  })

  it('renders a skip\'s reason VERBATIM, never paraphrased', () => {
    draw()
    const card = document.querySelector('[data-gate-check][data-check="identifiability"]')!
    expect(card.getAttribute('data-check-state')).toBe('skip')
    expect(card.querySelector('[data-gate-reason]')?.textContent).toBe(IDENTIFIABILITY_SKIP_REASON)
  })

  it('renders no reason block for an `off` check, which is never asked for one', () => {
    draw()
    const card = document.querySelector('[data-gate-check][data-check="prior_sensitivity"]')!
    expect(card.getAttribute('data-check-state')).toBe('off')
    expect(card.querySelectorAll('[data-gate-reason]').length).toBe(0)
  })

  it('renders the execution\'s post-flight finding', () => {
    draw()
    const findings = document.querySelectorAll('[data-gate-finding]')
    expect(findings.length).toBe(1)
    expect(findings[0]?.getAttribute('data-check')).toBe('C12')
    expect(findings[0]?.getAttribute('data-severity')).toBe('refuse')
  })

  it('renders both always-on checks, each closed with its note in the DOM', () => {
    draw()
    for (const [id, note] of [['C16', 'ADC saturation'], ['C18', 'two-sigma cross-check']] as const) {
      const block = document.querySelector(`[data-always-on-check="${id}"]`)!
      expect(block.querySelector('[data-always-on-summary]')).toBeTruthy()
      const details = block.querySelector('[data-always-on-details]') as HTMLDetailsElement
      // Closed by default: `<details>` keeps its content in the DOM but
      // unpainted, so this reads `textContent` without opening it.
      expect(details.open).toBe(false)
      expect(details.querySelector('[data-always-on-note]')?.textContent).toContain(note)
    }
  })
})

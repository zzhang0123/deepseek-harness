// @vitest-environment jsdom
/**
 * The console header (`docs/project-model.md` §6.1): which project, task and
 * execution the panels below are showing.
 *
 * Presentational only — the selection and its fetches live in
 * `useConsoleExecution`, and are tested there.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectHeader } from '../src/client/ProjectHeader.tsx'
import type { HeaderExecution } from '../src/client/project-selectors.ts'
import type { ConsoleExecutionState } from '../src/client/use-console-execution.ts'

afterEach(cleanup)

const OLDER = '20260822T090000Z-3f9ac2b1-aaaaaa'
const NEWER = '20260822T134501Z-3f9ac2b1-k7m2xq'

function row(id: string, over: Partial<HeaderExecution> = {}): HeaderExecution {
  return {
    executionId: id,
    task: 'tasks/fit',
    path: `results/tasks/fit/${id}/`,
    transport: 'local',
    fromThisSession: true,
    ...over,
  }
}

/** Render the header over a fixed selection state. */
function mount(ordered: HeaderExecution[], over: Partial<ConsoleExecutionState> = {}) {
  const select = vi.fn()
  const state: ConsoleExecutionState = {
    ordered,
    selected: ordered[0],
    newest: ordered[0]?.executionId,
    projectName: 'rhino-2026',
    projectReadable: true,
    select,
    executionView: {},
    ...over,
  }
  render(<ProjectHeader execution={state} />)
  return select
}

describe('with nothing to show', () => {
  it('says so plainly instead of rendering an empty header', () => {
    mount([], { selected: undefined, newest: undefined })
    expect(screen.getByText(/No execution yet in this project/)).toBeTruthy()
  })

  it('scopes the message to the session when the project could not be read', () => {
    mount([], { selected: undefined, newest: undefined, projectReadable: false })
    expect(screen.getByText(/No execution yet in this session/)).toBeTruthy()
  })
})

describe('naming the execution', () => {
  it('names the project, the task and the execution', () => {
    mount([row(NEWER)])
    expect(screen.getByText('rhino-2026')).toBeTruthy()
    expect(screen.getByText('tasks/fit')).toBeTruthy()
    expect(screen.getByText(NEWER)).toBeTruthy()
  })

  it('shows the published path a user would copy', () => {
    mount([row(NEWER)])
    expect(document.querySelector('[data-execution-path]')?.textContent)
      .toBe(`results/tasks/fit/${NEWER}/`)
  })

  it('reads the time off the id, and names the transport', () => {
    mount([row(NEWER)])
    expect(screen.getByText('13:45:01 UTC · local')).toBeTruthy()
  })

  it('marks the selected execution current when it is the newest', () => {
    mount([row(NEWER)])
    expect(document.querySelector('[data-execution-freshness]')?.getAttribute('data-execution-freshness'))
      .toBe('current')
  })

  it('marks anything else stale', () => {
    mount([row(OLDER), row(NEWER)], { selected: row(OLDER), newest: NEWER })
    expect(document.querySelector('[data-execution-freshness]')?.getAttribute('data-execution-freshness'))
      .toBe('stale')
  })

  it('says a run published nothing rather than showing a path it does not have', () => {
    mount([row(NEWER, { path: undefined, task: 'tasks/scratch' })])
    expect(document.querySelector('[data-execution-unpublished]')).toBeTruthy()
    expect(document.querySelector('[data-execution-path]')).toBeNull()
  })

  it('distinguishes a failed RUN from a refused PUBLICATION', () => {
    mount([row(NEWER, { runsFailed: true })])
    expect(document.querySelector('[data-execution-status="failed"]')).toBeTruthy()
    cleanup()
    mount([row(NEWER, { publication: 'refused' })])
    expect(document.querySelector('[data-execution-status="refused"]')).toBeTruthy()
  })

  it('says when the execution came from another session', () => {
    // §6.1: rendering another session's results inside this conversation
    // without saying so would be worse than not showing them at all.
    mount([row(NEWER, { fromThisSession: false, sessionId: 'S-other99' })])
    expect(document.querySelector('[data-execution-foreign]')?.textContent).toContain('S-other9')
  })

  it('says nothing about another session for one this session produced', () => {
    mount([row(NEWER)])
    expect(document.querySelector('[data-execution-foreign]')).toBeNull()
  })
})

describe('the picker', () => {
  it('stays away when there is nothing to pick between', () => {
    mount([row(NEWER)])
    expect(document.querySelector('[data-execution-picker]')).toBeNull()
  })

  it('offers every execution and reports the choice', () => {
    const select = mount([row(NEWER), row(OLDER)])
    const picker = document.querySelector('[data-execution-picker]') as HTMLSelectElement
    expect([...picker.querySelectorAll('option')].map(o => o.value)).toEqual([NEWER, OLDER])
    fireEvent.change(picker, { target: { value: OLDER } })
    expect(select).toHaveBeenCalledWith(OLDER)
  })

  it('labels each option well enough to tell two runs of one task apart', () => {
    mount([row(NEWER), row(OLDER, { runsFailed: true, fromThisSession: false })])
    expect([...document.querySelectorAll('[data-execution-picker] option')].map(o => o.textContent))
      .toEqual([`13:45:01 · ${NEWER}`, `09:00:00 · ${OLDER} · failed · other session`])
  })

  it('states which list it is showing', () => {
    mount([row(NEWER), row(OLDER)])
    expect(document.querySelector('[data-header-rule]')?.textContent)
      .toMatch(/all 2 executions in the project/)
    cleanup()
    mount([row(NEWER), row(OLDER)], { projectReadable: false })
    expect(document.querySelector('[data-header-rule]')?.textContent)
      .toMatch(/not every execution in the project/)
  })
})

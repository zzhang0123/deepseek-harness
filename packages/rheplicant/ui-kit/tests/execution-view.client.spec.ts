import { describe, expect, it } from 'vitest'
import { executionEmptyReason, graphToRender, runsToRender } from '../src/client/run/execution-view.ts'
import type { AnalysisRun } from '../src/client/run/run-selectors.ts'

const fromTree = [{ name: 'tree', kind: 'nuts', status: 'ok' }] as unknown as AnalysisRun[]
const fromLog = [{ name: 'log', kind: 'nuts', status: 'ok' }] as unknown as AnalysisRun[]

describe('runsToRender', () => {
  it('renders the selected execution when the console supplied it', () => {
    expect(runsToRender({ runs: fromTree }, fromLog)).toBe(fromTree)
  })

  it('falls back to the log outside the console shell', () => {
    // A panel in a unit test, or an older harness with no project route, has
    // no execution view at all. Rendering nothing there would be a regression
    // dressed as a feature.
    expect(runsToRender(undefined, fromLog)).toBe(fromLog)
  })

  it('falls back to the log when the project could not be reached', () => {
    expect(runsToRender({ problem: 'unavailable' }, fromLog)).toBe(fromLog)
  })

  it('renders NOTHING when the project says this execution is gone', () => {
    // The one case where falling back is wrong: the log holds a DIFFERENT
    // execution, and drawing it under this one's name is precisely the
    // wrongness this design exists to remove.
    expect(runsToRender({ executionId: 'E', problem: 'unreadable' }, fromLog)).toEqual([])
  })

  it('renders nothing while a read is in flight rather than flashing the log', () => {
    // The log holds the PREVIOUS execution. Showing it under the newly
    // selected one's name is the same wrongness as `unreadable`, just brief.
    expect(runsToRender({ executionId: 'E', problem: 'loading' }, fromLog)).toEqual([])
  })
})

describe('executionEmptyReason', () => {
  it('names the state worth naming', () => {
    expect(executionEmptyReason({ problem: 'unreadable' })).toMatch(/no longer readable/)
    expect(executionEmptyReason({ problem: 'loading' })).toMatch(/Reading/)
  })

  it('says nothing when the panel is empty for the ordinary reason', () => {
    // No execution selected, or one with nothing in it: the panel keeps its
    // own words ("Ask the agent for a nuts run"), which are the right ones.
    expect(executionEmptyReason(undefined)).toBeUndefined()
    expect(executionEmptyReason({})).toBeUndefined()
  })
})

describe('the reason an empty panel is empty', () => {
  it('explains that a published run keeps its arrays on disk', () => {
    // After the event became a receipt (§5), an empty viz panel is no longer
    // "nothing ran" — it is "the results are in the folder and this console
    // could not read it". Saying the former sends someone hunting a bug in
    // their document.
    expect(executionEmptyReason({ problem: 'unavailable' }))
      .toMatch(/folder, which this console could not read/)
  })
})

const treeGraph = { nodes: [{ id: 'tree' }] }
const logGraph = { nodes: [{ id: 'log' }] }

describe('graphToRender', () => {
  /**
   * The signal path used to read the SESSION LOG alone, which meant selecting
   * an execution this session did not run drew the open conversation's model
   * under that execution's header. Found by a real end-to-end run, not by a
   * test: in a session that HAS the run, the two sources agree and the bug is
   * invisible.
   */
  it('renders the selected execution\'s graph when the console supplied it', () => {
    expect(graphToRender({ graph: treeGraph }, logGraph)).toBe(treeGraph)
  })

  it('falls back to the log outside the console shell', () => {
    expect(graphToRender(undefined, logGraph)).toBe(logGraph)
  })

  it('falls back to the log when the project could not be reached', () => {
    expect(graphToRender({ problem: 'unavailable' }, logGraph)).toBe(logGraph)
  })

  it('renders NOTHING when the project says this execution is gone', () => {
    // Same rule as `runsToRender`, and for a stronger reason: a model diagram
    // is the most confidently-read thing on the page, so showing the wrong
    // one is the most expensive mistake available here.
    expect(graphToRender({ problem: 'unreadable' }, logGraph)).toBeUndefined()
  })

  it('renders NOTHING while the execution is still being read', () => {
    expect(graphToRender({ problem: 'loading' }, logGraph)).toBeUndefined()
  })

  it('does not fall back for an execution that simply declares no model', () => {
    // `runs` present with no `graph` is a complete answer about this
    // execution: it declared no `model:`. Reaching for the log there would
    // invent a diagram for a document that has none.
    expect(graphToRender({ runs: [] }, logGraph)).toBeUndefined()
  })
})

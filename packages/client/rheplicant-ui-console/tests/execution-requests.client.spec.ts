import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearExecutionRequest,
  peekExecutionRequest,
  requestExecution,
  resetExecutionRequests,
  subscribeExecutionRequests,
} from '../src/client/execution-requests.ts'

afterEach(() => { resetExecutionRequests() })

describe('a request for one session', () => {
  it('is absent until someone makes one', () => {
    expect(peekExecutionRequest('S-1')).toBeUndefined()
  })

  it('is readable by the session it names, and only that one', () => {
    requestExecution('S-1', 'EXEC-1')
    expect(peekExecutionRequest('S-1')).toBe('EXEC-1')
    expect(peekExecutionRequest('S-2')).toBeUndefined()
  })

  it('keeps one request per session, so two projects do not collide', () => {
    requestExecution('S-1', 'EXEC-1')
    requestExecution('S-2', 'EXEC-2')
    expect(peekExecutionRequest('S-1')).toBe('EXEC-1')
    expect(peekExecutionRequest('S-2')).toBe('EXEC-2')
  })

  it('replaces an unconsumed request rather than queueing behind it', () => {
    // Two clicks before the console reads either: the SECOND is what the
    // person asked for, and arriving at the first would be a surprise.
    requestExecution('S-1', 'EXEC-1')
    requestExecution('S-1', 'EXEC-2')
    expect(peekExecutionRequest('S-1')).toBe('EXEC-2')
  })

  it('is gone once cleared, so re-opening a session does not jump back', () => {
    // The request is an instruction, not a preference. Leaving it set would
    // make a session that someone later returns to snap to an execution they
    // chose once, long ago.
    requestExecution('S-1', 'EXEC-1')
    clearExecutionRequest('S-1')
    expect(peekExecutionRequest('S-1')).toBeUndefined()
  })

  it('clears only the session named', () => {
    requestExecution('S-1', 'EXEC-1')
    requestExecution('S-2', 'EXEC-2')
    clearExecutionRequest('S-1')
    expect(peekExecutionRequest('S-2')).toBe('EXEC-2')
  })
})

describe('subscribers', () => {
  it('wake on a new request, because the console may already be open', () => {
    // The home renders in `shell.overlay`, which is shown whether or not a
    // session is open. Picking an execution in the session already on screen
    // navigates nowhere, so a mount-time read would never see the request.
    const woke = vi.fn()
    subscribeExecutionRequests(woke)
    requestExecution('S-1', 'EXEC-1')
    expect(woke).toHaveBeenCalledTimes(1)
  })

  it('wake on a clear as well, so a consumed request stops being applied', () => {
    const woke = vi.fn()
    requestExecution('S-1', 'EXEC-1')
    subscribeExecutionRequests(woke)
    clearExecutionRequest('S-1')
    expect(woke).toHaveBeenCalledTimes(1)
  })

  it('do not wake for a clear that changed nothing', () => {
    const woke = vi.fn()
    subscribeExecutionRequests(woke)
    clearExecutionRequest('S-unknown')
    expect(woke).not.toHaveBeenCalled()
  })

  it('do not wake for a repeat of the request already standing', () => {
    requestExecution('S-1', 'EXEC-1')
    const woke = vi.fn()
    subscribeExecutionRequests(woke)
    requestExecution('S-1', 'EXEC-1')
    expect(woke).not.toHaveBeenCalled()
  })

  it('stop waking once unsubscribed', () => {
    const woke = vi.fn()
    const stop = subscribeExecutionRequests(woke)
    stop()
    requestExecution('S-1', 'EXEC-1')
    expect(woke).not.toHaveBeenCalled()
  })
})

describe('what a request refuses to be', () => {
  it('ignores an empty session or execution rather than storing a blank', () => {
    requestExecution('', 'EXEC-1')
    requestExecution('S-1', '')
    expect(peekExecutionRequest('')).toBeUndefined()
    expect(peekExecutionRequest('S-1')).toBeUndefined()
  })
})

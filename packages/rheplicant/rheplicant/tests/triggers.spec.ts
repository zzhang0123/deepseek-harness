import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  TRIGGERS_FILE, dueTriggers, durationMs, nextFireAt, readTriggers, writeTriggers,
  type TriggerRecord,
} from '@rheplicant/dsh-rheplicant/triggers'

let workspace: string
beforeEach(() => { workspace = mkdtempSync(join(tmpdir(), 'rheplicant-triggers-')) })

/** One record, with only what an assertion needs stated. */
function trigger(over: Partial<TriggerRecord> = {}): TriggerRecord {
  return { name: 'nightly', task: 'tasks/demo.yaml', every: 'PT10M', enabled: true, ...over }
}

/** Write raw text where the registry lives. */
function raw(text: string): void {
  mkdirSync(join(workspace, '.rheplicant-agent'), { recursive: true })
  writeFileSync(join(workspace, TRIGGERS_FILE), text, 'utf8')
}

describe('reading the registry', () => {
  it('reports ABSENT for a project that has never had one', () => {
    expect(readTriggers(workspace)).toEqual({ state: 'absent', triggers: [] })
  })

  it('reports UNREADABLE separately from absent', () => {
    // Both mean "nothing will fire", and reporting them alike would render a
    // corrupt file as "this project has no schedules" — a confident answer to a
    // question nothing could answer.
    raw('{ not json')
    const registry = readTriggers(workspace)
    expect(registry.state).toBe('unreadable')
    expect(registry.triggers).toEqual([])
  })

  it('refuses the WHOLE file when one entry is malformed, rather than dropping it', () => {
    // Filtering the bad row would run a SUBSET of what the person asked for
    // while reporting success. A schedule that quietly does less than it says
    // is the failure the design leads with.
    raw(JSON.stringify([trigger(), { name: 'broken' }]))
    const registry = readTriggers(workspace)
    expect(registry.state).toBe('unreadable')
    expect(registry.triggers).toEqual([])
  })

  it('refuses a duplicate name, because the name IS the identity', () => {
    raw(JSON.stringify([trigger({ name: 'a' }), trigger({ name: 'a', task: 'other.yaml' })]))
    expect(readTriggers(workspace).state).toBe('unreadable')
  })

  it('refuses an entry whose cadence this layer will not act on', () => {
    raw(JSON.stringify([trigger({ every: 'P1M' })]))
    expect(readTriggers(workspace).state).toBe('unreadable')
  })

  it('round-trips through the writer', () => {
    const written = writeTriggers(workspace, [trigger(), trigger({ name: 'weekly', every: 'P7D' })])
    expect(written).toBe(join(workspace, TRIGGERS_FILE))
    const registry = readTriggers(workspace)
    expect(registry.state).toBe('ok')
    expect(registry.triggers.map(row => row.name)).toEqual(['nightly', 'weekly'])
  })

  it('creates its state directory rather than requiring one', () => {
    expect(() => writeTriggers(workspace, [trigger()])).not.toThrow()
  })
})

describe('the cadence', () => {
  it.each([
    ['PT30S', 30_000],
    ['PT10M', 600_000],
    ['PT2H', 7_200_000],
    ['P1D', 86_400_000],
    ['P1DT12H', 129_600_000],
  ])('reads %s', (every, ms) => {
    expect(durationMs(every)).toBe(ms)
  })

  it.each(['P1M', 'P1Y', 'P2W'])('REFUSES %s, because it is not a fixed length', (every) => {
    // `P1M` is 28 to 31 days. A schedule expressed in months has no single
    // answer to "when next", and picking one would invent a convention the
    // person never agreed to. `P30D` says thirty days and means it.
    expect(durationMs(every)).toBeUndefined()
  })

  it.each(['', 'P', 'PT', 'PT0S', '10m', 'every 10 minutes'])('refuses %s', (every) => {
    // `P` and `PT` parse structurally and mean nothing; a zero cadence would
    // fire forever.
    expect(durationMs(every)).toBeUndefined()
  })
})

describe('when a trigger is due', () => {
  const now = Date.parse('2026-08-26T12:00:00Z')

  it('is due IMMEDIATELY when it has never fired', () => {
    // The person asked for it to run every ten minutes. Making them wait ten
    // minutes for the first one answers a question they did not ask.
    expect(nextFireAt(trigger(), now)).toBe(now)
    expect(dueTriggers([trigger()], now)).toHaveLength(1)
  })

  it('is due one period after its last ATTEMPT', () => {
    const fired = trigger({ lastFiredAt: '2026-08-26T11:55:00Z' })
    expect(nextFireAt(fired, now)).toBe(Date.parse('2026-08-26T12:05:00Z'))
    expect(dueTriggers([fired], now)).toHaveLength(0)
  })

  it('counts a FAILED attempt, so a broken run cannot fire in a loop', () => {
    // `lastFiredAt` is written after the attempt whatever its outcome. Writing
    // it only on success would make a task that refuses re-fire on every tick.
    const justTried = trigger({ lastFiredAt: new Date(now).toISOString() })
    expect(dueTriggers([justTried], now)).toHaveLength(0)
  })

  it('is never due while disabled', () => {
    expect(nextFireAt(trigger({ enabled: false }), now)).toBeUndefined()
    expect(dueTriggers([trigger({ enabled: false })], now)).toHaveLength(0)
  })

  it('treats an unparseable lastFiredAt as never fired rather than as never due', () => {
    // The failure of the alternative is a trigger that silently stops forever
    // because one timestamp got corrupted.
    expect(nextFireAt(trigger({ lastFiredAt: 'yesterday' }), now)).toBe(now)
  })

  it('fires a long-overdue trigger ONCE, never once per missed window', () => {
    // Three days late on a ten-minute cadence is 432 missed windows. The answer
    // is a list of triggers, not a count — "three days of runs" is a claim
    // about time that did not happen.
    const stale = trigger({ lastFiredAt: '2026-08-23T12:00:00Z' })
    expect(dueTriggers([stale], now)).toEqual([stale])
  })

  it('keeps registry order, so a tick is deterministic', () => {
    const a = trigger({ name: 'a' })
    const b = trigger({ name: 'b' })
    expect(dueTriggers([a, b], now).map(row => row.name)).toEqual(['a', 'b'])
  })
})

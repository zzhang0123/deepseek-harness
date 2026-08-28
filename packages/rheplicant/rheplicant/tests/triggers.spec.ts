import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  MIN_ROUTINE_PERIOD_MS, TRIGGERS_FILE, cadenceOf, dueTriggers, durationMs, isRoutine,
  nextDailyAt, nextFireAt, readTriggers, setTriggerEnabled, writeTriggers,
  type RoutineTrigger, type TaskTrigger, type TriggerRecord,
} from '@rheplicant/dsh-rheplicant/triggers'

let workspace: string
beforeEach(() => { workspace = mkdtempSync(join(tmpdir(), 'rheplicant-triggers-')) })

/**
 * One record, with only what an assertion needs stated.
 *
 * Typed against `TaskTrigger` rather than the union, which is what it builds
 * and what every caller overrides. `Partial<TriggerRecord>` distributes over
 * the union and, under `exactOptionalPropertyTypes`, offers each member an
 * `undefined` its own optionals do not accept — so the spread stopped
 * typechecking the moment a second optional field joined `RoutineTrigger`.
 * The `routine()` helper below has always been written this way.
 */
function trigger(over: Partial<TaskTrigger> = {}): TaskTrigger {
  return { name: 'nightly', task: 'tasks/demo.yaml', every: 'PT10M', enabled: true, ...over }
}

/** One ROUTINE record — a prompt on a cadence, with no task at all. */
function routine(over: Partial<RoutineTrigger> = {}): RoutineTrigger {
  return { name: 'morning', action: 'routine', prompt: 'Summarise yesterday', every: 'PT30M', enabled: true, ...over }
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

describe('what a trigger DOES when it comes due', () => {
  it('reads a record with NO action as a task run', () => {
    // Every registry on disk was written before routines existed, and all of
    // them hold task triggers. Making those files say so would be a migration
    // for a fact the reader can supply, and a migration that runs against a
    // file the person hand-edits is a migration that eventually loses one.
    raw(JSON.stringify([trigger()]))
    const registry = readTriggers(workspace)
    expect(registry.state).toBe('ok')
    expect(isRoutine(registry.triggers[0]!)).toBe(false)
  })

  it('accepts a routine, which carries a PROMPT where a task run carries a task', () => {
    raw(JSON.stringify([routine()]))
    const registry = readTriggers(workspace)
    expect(registry.state).toBe('ok')
    const row = registry.triggers[0]!
    expect(isRoutine(row)).toBe(true)
    expect(isRoutine(row) && row.prompt).toBe('Summarise yesterday')
  })

  it('refuses a routine with no prompt, naming the field', () => {
    // A routine with nothing to say would open a session and sit there, which
    // costs a model call to produce nothing.
    raw(JSON.stringify([{ name: 'a', action: 'routine', every: 'PT30M', enabled: true }]))
    const registry = readTriggers(workspace)
    expect(registry.state).toBe('unreadable')
    expect(registry.state === 'unreadable' && registry.reason).toContain('prompt')
  })

  it('refuses a task run with no task, naming the field', () => {
    raw(JSON.stringify([{ name: 'a', every: 'PT10M', enabled: true }]))
    const registry = readTriggers(workspace)
    expect(registry.state).toBe('unreadable')
    expect(registry.state === 'unreadable' && registry.reason).toContain('task')
  })

  it('refuses an action it does not know, rather than treating it as a run', () => {
    // Defaulting an unknown action to `run` would silently do the wrong thing
    // to a file written by a newer version of this package.
    raw(JSON.stringify([{ name: 'a', action: 'deploy', task: 't.yaml', every: 'PT10M', enabled: true }]))
    expect(readTriggers(workspace).state).toBe('unreadable')
  })

  it('refuses a routine faster than the floor, because every fire spends money', () => {
    // A task run costs compute the person already owns. A routine costs a MODEL
    // CALL, so an accidental `PT10S` is a bill rather than a busy laptop. Same
    // five-minute floor DSH's own scheduler uses, and for the same reason.
    raw(JSON.stringify([routine({ every: 'PT1M' })]))
    const registry = readTriggers(workspace)
    expect(registry.state).toBe('unreadable')
    expect(registry.state === 'unreadable' && registry.reason).toContain('PT5M')
  })

  it('accepts a routine exactly AT the floor', () => {
    expect(durationMs('PT5M')).toBe(MIN_ROUTINE_PERIOD_MS)
    raw(JSON.stringify([routine({ every: 'PT5M' })]))
    expect(readTriggers(workspace).state).toBe('ok')
  })

  it('lets a TASK RUN keep a cadence below the routine floor, and the asymmetry is the point', () => {
    // The floor is about model spend, not about the clock, so it applies where
    // the spending happens and nowhere else.
    raw(JSON.stringify([trigger({ every: 'PT30S' })]))
    expect(readTriggers(workspace).state).toBe('ok')
  })

  it('round-trips a mixed registry, since one project may have both kinds', () => {
    writeTriggers(workspace, [trigger(), routine()])
    const registry = readTriggers(workspace)
    expect(registry.state).toBe('ok')
    expect(registry.triggers.map(isRoutine)).toEqual([false, true])
  })

  it('judges both kinds due by the same clock', () => {
    // The action decides what happens, never WHEN. Two schedulers with two
    // notions of "due" is the thing this record exists to prevent.
    const now = Date.parse('2026-08-26T12:00:00Z')
    expect(nextFireAt(routine(), now)).toBe(now)
    expect(dueTriggers([routine({ lastFiredAt: '2026-08-26T11:59:00Z' })], now)).toHaveLength(0)
  })
})

describe('toggling one trigger, the board\'s only write', () => {
  it('flips the named one and leaves every other field alone', () => {
    writeTriggers(workspace, [trigger({ lastFiredAt: '2026-08-27T00:00:00.000Z' }), routine()])
    const outcome = setTriggerEnabled(workspace, 'nightly', false)
    expect(outcome.ok).toBe(true)
    const [first, second] = readTriggers(workspace).triggers
    expect(first).toMatchObject({ name: 'nightly', enabled: false, lastFiredAt: '2026-08-27T00:00:00.000Z' })
    expect(second).toMatchObject({ name: 'morning', enabled: true })
  })

  it('toggles a routine by the same route, since the switch is not about the kind', () => {
    writeTriggers(workspace, [routine()])
    expect(setTriggerEnabled(workspace, 'morning', false).ok).toBe(true)
    expect(readTriggers(workspace).triggers[0]!.enabled).toBe(false)
  })

  it('REFUSES an unreadable registry rather than overwriting it', () => {
    // Writing over a file we could not parse would discard schedules the person
    // set and report success.
    raw('{ not json')
    const outcome = setTriggerEnabled(workspace, 'nightly', false)
    expect(outcome).toMatchObject({ ok: false, code: 'registry_unreadable' })
    // And the bytes are still there for someone to repair.
    expect(readTriggers(workspace).state).toBe('unreadable')
  })

  it('says not-found rather than creating one', () => {
    writeTriggers(workspace, [trigger()])
    expect(setTriggerEnabled(workspace, 'ghost', false)).toMatchObject({
      ok: false, code: 'schedule_not_found',
    })
    expect(readTriggers(workspace).triggers).toHaveLength(1)
  })

  it('says not-found on an ABSENT registry, never writing a file to hold one row', () => {
    expect(setTriggerEnabled(workspace, 'nightly', false)).toMatchObject({ ok: false })
    expect(readTriggers(workspace).state).toBe('absent')
  })

  it('re-reads before writing, so a toggle cannot resurrect a removed trigger', () => {
    // Three writers touch this file: the tool, the firing loop's stamp, and
    // this. A toggle holding a stale snapshot would write back the list as it
    // stood when the page loaded.
    writeTriggers(workspace, [trigger({ name: 'a' }), trigger({ name: 'b' })])
    writeTriggers(workspace, [trigger({ name: 'b' })])
    expect(setTriggerEnabled(workspace, 'b', false).ok).toBe(true)
    expect(readTriggers(workspace).triggers.map(row => row.name)).toEqual(['b'])
  })
})

describe('the wall-clock selector', () => {
  /** Local wall-clock fields of an instant, which is what `dailyAt` names. */
  function wall(at: number): { h: number; m: number; s: number; ms: number } {
    const d = new Date(at)
    return { h: d.getHours(), m: d.getMinutes(), s: d.getSeconds(), ms: d.getMilliseconds() }
  }

  // Every assertion here is ZONE-INDEPENDENT on purpose. Pinning TZ in the spec
  // would test one zone and pass everywhere; asserting the local wall fields and
  // the ordering tests the property the feature actually claims, in whatever
  // zone the machine is set to — including the CI runner's.
  describe('nextDailyAt', () => {
    it('lands on the requested wall time, whatever the zone', () => {
      const from = Date.parse('2026-08-28T00:00:00Z')
      expect(wall(nextDailyAt('08:00', from))).toEqual({ h: 8, m: 0, s: 0, ms: 0 })
      expect(wall(nextDailyAt('23:45', from))).toEqual({ h: 23, m: 45, s: 0, ms: 0 })
      expect(wall(nextDailyAt('00:00', from))).toEqual({ h: 0, m: 0, s: 0, ms: 0 })
    })

    it('is always in the FUTURE of the instant it is asked about', () => {
      // The one property the firing loop depends on: a target at or before now
      // would fire again on the very next tick, forever.
      for (const hhmm of ['00:00', '08:00', '12:30', '23:59']) {
        for (const hour of [0, 6, 12, 18, 23]) {
          const from = new Date(2026, 7, 28, hour, 30, 0, 0).getTime()
          expect(nextDailyAt(hhmm, from)).toBeGreaterThan(from)
        }
      }
    })

    it('never looks further ahead than one day', () => {
      const from = new Date(2026, 7, 28, 9, 0, 0, 0).getTime()
      for (const hhmm of ['00:00', '08:00', '09:00', '23:59']) {
        expect(nextDailyAt(hhmm, from) - from).toBeLessThanOrEqual(25 * 3_600_000)
      }
    })

    it('takes TODAY when the target is still ahead, and tomorrow once it has passed', () => {
      const before = new Date(2026, 7, 28, 7, 59, 0, 0).getTime()
      const after = new Date(2026, 7, 28, 8, 1, 0, 0).getTime()
      expect(new Date(nextDailyAt('08:00', before)).getDate()).toBe(28)
      expect(new Date(nextDailyAt('08:00', after)).getDate()).toBe(29)
    })

    it('DOES NOT DRIFT — the answer depends on the clock, never on when it last ran', () => {
      // This is the whole reason the selector exists. `every` computes
      // `lastFiredAt + period`, so a harness that was down for three hours
      // moves every subsequent firing three hours later, permanently. Two very
      // different last-fire instants on the same day must give one answer.
      const punctual = new Date(2026, 7, 27, 8, 0, 0, 0).getTime()
      const late = new Date(2026, 7, 27, 11, 17, 42, 0).getTime()
      expect(nextDailyAt('08:00', punctual)).toBe(nextDailyAt('08:00', late))
    })
  })

  describe('the record, and which selector it carries', () => {
    it('reads an interval record as an interval', () => {
      expect(cadenceOf(trigger())).toEqual({ kind: 'every', text: 'PT10M' })
    })

    it('reads a wall-clock record as wall-clock', () => {
      raw(JSON.stringify([{ name: 'dawn', task: 't.yaml', dailyAt: '08:00', enabled: true }]))
      const registry = readTriggers(workspace)
      expect(registry.state).toBe('ok')
      expect(cadenceOf(registry.triggers[0]!)).toEqual({ kind: 'dailyAt', text: '08:00' })
    })

    it('refuses BOTH selectors, and refuses NEITHER', () => {
      // Exactly one, in both directions — the same rule the tool applies to
      // task/prompt, for the same reason: two answers to "when" is worse than
      // none, because one of them silently wins.
      raw(JSON.stringify([{ name: 'a', task: 't.yaml', every: 'PT10M', dailyAt: '08:00', enabled: true }]))
      expect(readTriggers(workspace).state).toBe('unreadable')
      raw(JSON.stringify([{ name: 'a', task: 't.yaml', enabled: true }]))
      expect(readTriggers(workspace).state).toBe('unreadable')
    })

    it.each(['8:00', '08:0', '0800', '24:00', '08:60', 'morning', '08:00:00'])(
      'refuses %s as a wall-clock time', (dailyAt) => {
        raw(JSON.stringify([{ name: 'a', task: 't.yaml', dailyAt, enabled: true }]))
        expect(readTriggers(workspace).state).toBe('unreadable')
      })

    it.each(['00:00', '08:00', '23:59', '12:30'])('accepts %s', (dailyAt) => {
      raw(JSON.stringify([{ name: 'a', task: 't.yaml', dailyAt, enabled: true }]))
      expect(readTriggers(workspace).state).toBe('ok')
    })

    it('exempts a wall-clock ROUTINE from the PT5M floor, which is about intervals', () => {
      // The floor exists because a short INTERVAL spends a model call over and
      // over. Daily is daily; there is no interval to be too short.
      raw(JSON.stringify([{ name: 'a', action: 'routine', prompt: 'hi', dailyAt: '08:00', enabled: true }]))
      expect(readTriggers(workspace).state).toBe('ok')
    })
  })

  describe('when a wall-clock trigger is due', () => {
    it('is due immediately when it has never fired, like every other kind', () => {
      const now = new Date(2026, 7, 28, 9, 0, 0, 0).getTime()
      const dawn = { name: 'dawn', task: 't.yaml', dailyAt: '08:00', enabled: true } as unknown as TriggerRecord
      expect(nextFireAt(dawn, now)).toBe(now)
      expect(dueTriggers([dawn], now)).toHaveLength(1)
    })

    it('answers the next wall time once it has fired, not a period after the firing', () => {
      const now = new Date(2026, 7, 28, 9, 0, 0, 0).getTime()
      const fired = new Date(2026, 7, 28, 8, 0, 30, 0)
      const dawn = {
        name: 'dawn', task: 't.yaml', dailyAt: '08:00', enabled: true,
        lastFiredAt: fired.toISOString(),
      } as unknown as TriggerRecord
      const due = nextFireAt(dawn, now)!
      expect(wall(due)).toEqual({ h: 8, m: 0, s: 0, ms: 0 })
      expect(new Date(due).getDate()).toBe(29)
      expect(dueTriggers([dawn], now)).toHaveLength(0)
    })

    it('fires ONCE when the harness was down across the window, not once per missed day', () => {
      const now = new Date(2026, 7, 28, 9, 0, 0, 0).getTime()
      const stale = {
        name: 'dawn', task: 't.yaml', dailyAt: '08:00', enabled: true,
        lastFiredAt: new Date(2026, 7, 24, 8, 0, 0, 0).toISOString(),
      } as unknown as TriggerRecord
      expect(dueTriggers([stale], now)).toHaveLength(1)
    })

    it('is never due while disabled, like every other kind', () => {
      const now = Date.now()
      const off = { name: 'dawn', task: 't.yaml', dailyAt: '08:00', enabled: false } as unknown as TriggerRecord
      expect(nextFireAt(off, now)).toBeUndefined()
    })
  })
})

describe('the session a routine last opened', () => {
  it('is accepted as a string and carried through the read', () => {
    raw(JSON.stringify([{
      name: 'brief', action: 'routine', prompt: 'Check the fits',
      every: 'PT30M', enabled: true, lastSessionId: 'session-42',
    }]))
    const registry = readTriggers(workspace)
    expect(registry.state).toBe('ok')
    expect((registry.triggers[0] as RoutineTrigger).lastSessionId).toBe('session-42')
  })

  it('is optional — a registry that has never fired is not malformed', () => {
    // Absent for three ordinary reasons: a task trigger, a routine that has
    // not fired, and a composition with no agent where none can.
    raw(JSON.stringify([{
      name: 'brief', action: 'routine', prompt: 'Check the fits',
      every: 'PT30M', enabled: true,
    }]))
    expect(readTriggers(workspace).state).toBe('ok')
  })

  it('makes the WHOLE file unreadable when it is present and not a string', () => {
    // The value is handed straight to the host's session opener by the surface
    // that reads it, so a number here is a host this build does not understand
    // — and one bad row never silently becomes a shorter list.
    raw(JSON.stringify([{
      name: 'brief', action: 'routine', prompt: 'Check the fits',
      every: 'PT30M', enabled: true, lastSessionId: 7,
    }]))
    const registry = readTriggers(workspace)
    expect(registry.state).toBe('unreadable')
    // The file's own idiom: `reason` lives on one member of the union, so the
    // narrowing is part of the expectation rather than an assertion above it.
    expect(registry.state === 'unreadable' && registry.reason).toContain('lastSessionId')
  })

  it('is refused on a TASK record too, rather than ignored for being irrelevant', () => {
    // A task trigger has no reading for the field, but a malformed value is
    // still a file this reader will not act on — and saying so is the reader's
    // whole contract.
    raw(JSON.stringify([{
      name: 'ten', task: 'tasks/fit.yaml', every: 'PT10M', enabled: true, lastSessionId: false,
    }]))
    expect(readTriggers(workspace).state).toBe('unreadable')
  })
})

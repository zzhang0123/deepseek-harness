import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { TriggerFiring, inject, routineRunner, stampFired, stampSession, type FiredRun, type FiringDeps } from '@rheplicant/dsh-rheplicant/trigger-loop'
import type { RanRoutine } from '@rheplicant/dsh-rheplicant/routine'
import { TRIGGERS_FILE, readTriggers, writeTriggers, type RoutineTrigger, type TaskTrigger, type TriggerRecord } from '@rheplicant/dsh-rheplicant/triggers'

/** A fixed instant, so every expectation about "the next window" is arithmetic. */
const NOON = Date.parse('2026-08-26T12:00:00.000Z')
const MINUTE = 60_000

let workspace: string
/** Every `(workspace, task)` a fire asked for, in order. */
let fired: { workspace: string; task: string }[]
/** Every report the loop made, as `level: message`. */
let said: string[]
/** What each fire's promise does; the default resolves immediately. */
let answer: (task: string) => Promise<FiredRun>
/** Every `(workspace, routine name)` a routine fire asked for, in order. */
let opened: { workspace: string; name: string }[]
/** What each routine's promise does; the default resolves immediately. */
let routineAnswer: (name: string) => Promise<RanRoutine>

/** A registry file written verbatim, so a malformed one can be tested. */
function registry(text: string): void {
  mkdirSync(join(workspace, '.rheplicant-agent'), { recursive: true })
  writeFileSync(join(workspace, TRIGGERS_FILE), text)
}

/**
 * One well-formed trigger, with the fields a test does not care about filled in.
 *
 * `TaskTrigger`, not the union — see the same helper in `triggers.spec.ts` for
 * why the union stopped typechecking under `exactOptionalPropertyTypes`.
 */
function trigger(overrides: Partial<TaskTrigger> = {}): TaskTrigger {
  return { name: 'ten', task: 'tasks/fit.yaml', every: 'PT10M', enabled: true, ...overrides }
}

/** One well-formed ROUTINE, which carries a prompt where the above carries a task. */
function routine(overrides: Partial<RoutineTrigger> = {}): RoutineTrigger {
  return { name: 'brief', action: 'routine', prompt: 'Check the overnight fits', every: 'PT30M', enabled: true, ...overrides }
}

/** The registry as it now stands on disk. */
function onDisk(): readonly TriggerRecord[] {
  const answered = readTriggers(workspace)
  expect(answered.state).toBe('ok')
  return answered.triggers
}

/** A promise whose settlement the test controls. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

/** Let every already-settled promise callback run. */
async function settle(): Promise<void> {
  await new Promise(resume => { setImmediate(resume) })
}

/**
 * The loop, over one project, with the fakes above.
 *
 * **An override of `undefined` REMOVES that dep**, rather than setting it to
 * `undefined`. Two tests say `{ routine: undefined }` to mean "a composition
 * that mounts no agent", and under `exactOptionalPropertyTypes` an optional
 * property does not accept the value `undefined` — so what those tests meant
 * is now what they do, stated here instead of resting on a compiler flag
 * being off.
 */
function loop(deps: { [K in keyof FiringDeps]?: FiringDeps[K] | undefined } = {}): TriggerFiring {
  // Annotated, and the overrides applied afterwards rather than spread in:
  // an annotation of `Record<string, unknown>` here would take the contextual
  // typing away from the four fakes below and every parameter would be `any`.
  const base: FiringDeps = {
    projects: () => [workspace],
    run: (project, task) => {
      fired.push({ workspace: project, task })
      return answer(task)
    },
    report: (level, message) => { said.push(`${level}: ${message}`) },
    routine: (project, trig) => {
      opened.push({ workspace: project, name: trig.name })
      return routineAnswer(trig.name)
    },
  }
  const merged = { ...base } as Record<string, unknown>
  for (const [key, value] of Object.entries(deps)) {
    if (value === undefined) delete merged[key]
    else merged[key] = value
  }
  return new TriggerFiring(merged as unknown as FiringDeps)
}

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'rheplicant-loop-'))
  fired = []
  said = []
  opened = []
  answer = () => Promise.resolve({ executionId: 'EXEC-1' })
  routineAnswer = () => Promise.resolve({ sessionId: 'session-1' })
})

describe('stamping an attempt', () => {
  it('records the attempt on the named trigger and leaves the others alone', () => {
    writeTriggers(workspace, [trigger({ name: 'a' }), trigger({ name: 'b' })])

    expect(stampFired(workspace, 'b', NOON)).toBe(true)

    const [a, b] = onDisk()
    expect(a?.lastFiredAt).toBeUndefined()
    expect(b?.lastFiredAt).toBe('2026-08-26T12:00:00.000Z')
  })

  it('re-reads the file rather than writing back a snapshot it was holding', () => {
    // Two writers touch this file — the loop and the `rheplicant_trigger`
    // tool. A run that started ten minutes ago must not write back the list as
    // it stood when it started, silently undoing what was scheduled since.
    writeTriggers(workspace, [trigger({ name: 'a' })])
    writeTriggers(workspace, [trigger({ name: 'a' }), trigger({ name: 'added-since' })])

    stampFired(workspace, 'a', NOON)

    expect(onDisk().map(row => row.name)).toEqual(['a', 'added-since'])
  })

  it('refuses to write over a registry it could not read', () => {
    // Overwriting a file we could not parse would discard schedules the person
    // set and report success — the loudest form of the failure this design
    // leads with.
    registry('{ not json')

    expect(stampFired(workspace, 'a', NOON)).toBe(false)
    expect(readFileSync(join(workspace, TRIGGERS_FILE), 'utf8')).toBe('{ not json')
  })

  it('answers false for a trigger the registry no longer holds', () => {
    writeTriggers(workspace, [trigger({ name: 'a' })])

    expect(stampFired(workspace, 'gone', NOON)).toBe(false)
    expect(onDisk()[0]?.lastFiredAt).toBeUndefined()
  })
})

describe('what is due', () => {
  it('fires a trigger that has never fired, and stamps the attempt', async () => {
    writeTriggers(workspace, [trigger()])

    loop().tick(NOON)
    await settle()

    expect(fired).toEqual([{ workspace, task: 'tasks/fit.yaml' }])
    expect(onDisk()[0]?.lastFiredAt).toBe('2026-08-26T12:00:00.000Z')
  })

  it('leaves a disabled trigger alone without touching its record', async () => {
    writeTriggers(workspace, [trigger({ enabled: false })])

    loop().tick(NOON)
    await settle()

    expect(fired).toEqual([])
    expect(onDisk()[0]?.lastFiredAt).toBeUndefined()
  })

  it('does not fire before the window', async () => {
    writeTriggers(workspace, [trigger({ lastFiredAt: new Date(NOON - 9 * MINUTE).toISOString() })])

    loop().tick(NOON)
    await settle()

    expect(fired).toEqual([])
  })

  it('fires again once the window has passed', async () => {
    writeTriggers(workspace, [trigger({ lastFiredAt: new Date(NOON - 11 * MINUTE).toISOString() })])

    loop().tick(NOON)
    await settle()

    expect(fired).toHaveLength(1)
  })

  it('fires nothing at all when the registry is absent', async () => {
    loop().tick(NOON)
    await settle()

    expect(fired).toEqual([])
    expect(said).toEqual([])
  })
})

describe('missed windows are not caught up', () => {
  it('fires a three-day-overdue trigger ONCE, not once per missed window', async () => {
    // "Three days of runs" is a claim about time that did not happen. The
    // answer is a LIST of due triggers, never a count of windows.
    const threeDays = new Date(NOON - 3 * 24 * 60 * MINUTE).toISOString()
    writeTriggers(workspace, [trigger({ lastFiredAt: threeDays })])

    loop().tick(NOON)
    await settle()

    expect(fired).toHaveLength(1)
  })

  it('schedules the next window from the attempt, never from the window it missed', async () => {
    // Stamping `lastFiredAt + period` instead of `now` would leave the trigger
    // still overdue, and the very next tick would fire it again — a burst of
    // identical runs, which is the backlog this rule exists to refuse.
    const threeDays = new Date(NOON - 3 * 24 * 60 * MINUTE).toISOString()
    writeTriggers(workspace, [trigger({ lastFiredAt: threeDays })])
    const firing = loop()

    firing.tick(NOON)
    await settle()
    firing.tick(NOON + MINUTE)
    await settle()

    expect(fired).toHaveLength(1)
    expect(onDisk()[0]?.lastFiredAt).toBe('2026-08-26T12:00:00.000Z')
  })
})

describe('an overlapping fire skips rather than queueing', () => {
  it('does not start a second run of a task that is still running', async () => {
    // Queueing builds an unbounded backlog on a task slower than its own
    // cadence, and the backlog's failure mode — a burst of identical runs hours
    // later — is much worse than a gap.
    const inFlight = deferred<FiredRun>()
    answer = () => inFlight.promise
    writeTriggers(workspace, [trigger()])
    const firing = loop()

    firing.tick(NOON)
    await settle()
    firing.tick(NOON + 11 * MINUTE)
    await settle()

    expect(fired).toHaveLength(1)
    expect(firing.running).toBe(1)
    expect(said.some(line => line.includes('skipped'))).toBe(true)
  })

  it('stamps the skipped attempt too, so a long run does not skip on every tick', async () => {
    // The record's own word is "last ATTEMPTED to fire", and a skip is an
    // attempt. Without the stamp, a task running for an hour under a ten-minute
    // cadence would log a skip on every one of the 240 ticks in between.
    const inFlight = deferred<FiredRun>()
    answer = () => inFlight.promise
    writeTriggers(workspace, [trigger()])
    const firing = loop()

    firing.tick(NOON)
    await settle()
    firing.tick(NOON + 11 * MINUTE)
    await settle()

    expect(onDisk()[0]?.lastFiredAt).toBe(new Date(NOON + 11 * MINUTE).toISOString())
  })

  it('runs the task again once the earlier run has finished', async () => {
    const inFlight = deferred<FiredRun>()
    answer = () => inFlight.promise
    writeTriggers(workspace, [trigger()])
    const firing = loop()

    firing.tick(NOON)
    await settle()
    inFlight.resolve({ executionId: 'EXEC-1' })
    await settle()
    answer = () => Promise.resolve({ executionId: 'EXEC-2' })
    firing.tick(NOON + 11 * MINUTE)
    await settle()

    expect(fired).toHaveLength(2)
    expect(firing.running).toBe(0)
  })

  it('keys the skip on the TASK, so two triggers on one task never run it twice at once', async () => {
    // Two schedules for one piece of work are still one piece of work, and
    // running it twice concurrently is the hazard either way.
    const inFlight = deferred<FiredRun>()
    answer = () => inFlight.promise
    writeTriggers(workspace, [
      trigger({ name: 'a', task: 'tasks/fit.yaml' }),
      trigger({ name: 'b', task: 'tasks/fit.yaml' }),
    ])

    loop().tick(NOON)
    await settle()

    expect(fired).toHaveLength(1)
  })

  it('fires two DIFFERENT tasks in the same tick', async () => {
    const inFlight = deferred<FiredRun>()
    answer = () => inFlight.promise
    writeTriggers(workspace, [
      trigger({ name: 'a', task: 'tasks/fit.yaml' }),
      trigger({ name: 'b', task: 'tasks/scan.yaml' }),
    ])

    loop().tick(NOON)
    await settle()

    expect(fired.map(entry => entry.task)).toEqual(['tasks/fit.yaml', 'tasks/scan.yaml'])
  })

  it('fires one project once even when the registry lists it twice', async () => {
    // Two workspace records may name one directory. Walking it twice would make
    // the second fire skip against the first — a self-inflicted overlap that
    // looks exactly like a real one.
    const inFlight = deferred<FiredRun>()
    answer = () => inFlight.promise
    writeTriggers(workspace, [trigger()])

    loop({ projects: () => [workspace, workspace] }).tick(NOON)
    await settle()

    expect(fired).toHaveLength(1)
    expect(said).toEqual([])
  })
})

describe('failure does not disable', () => {
  it('leaves the trigger enabled when the run rejects, and says the schedule continues', async () => {
    // Auto-disabling would silently stop a schedule the person is still
    // expecting — the failure this design leads with, wearing a helpful face.
    answer = () => Promise.reject(new Error('the task file is gone'))
    writeTriggers(workspace, [trigger()])

    loop().tick(NOON)
    await settle()

    expect(onDisk()[0]?.enabled).toBe(true)
    expect(said.some(line => line.startsWith('warn:') && line.includes('the task file is gone'))).toBe(true)
    expect(said.some(line => line.includes('The schedule continues.'))).toBe(true)
  })

  it('fires again at the next window after a failure', async () => {
    answer = () => Promise.reject(new Error('nope'))
    writeTriggers(workspace, [trigger()])
    const firing = loop()

    firing.tick(NOON)
    await settle()
    firing.tick(NOON + 11 * MINUTE)
    await settle()

    expect(fired).toHaveLength(2)
  })

  it('cannot become a hot retry loop: a failed fire has already moved its window', async () => {
    // The stamp is written when the attempt STARTS, so a fire that fails in its
    // first millisecond does not come due again on the very next tick.
    answer = () => Promise.reject(new Error('nope'))
    writeTriggers(workspace, [trigger()])
    const firing = loop()

    firing.tick(NOON)
    await settle()
    firing.tick(NOON + 1000)
    await settle()

    expect(fired).toHaveLength(1)
  })

  it('reports a refused or errored run as an ordinary fire, because it published a tree', async () => {
    // `publishTaskRun` resolves for every outcome rheplicant reports. A refusal
    // is rheplicant declining an unsound document — worth recording repeatedly
    // while the document is unchanged, not worth stopping the schedule for.
    writeTriggers(workspace, [trigger()])

    loop().tick(NOON)
    await settle()

    expect(said).toEqual([`info: trigger ten: ran tasks/fit.yaml as execution EXEC-1`])
  })
})

describe('an unreadable registry', () => {
  it('fires nothing and never honours part of it', async () => {
    registry(JSON.stringify([trigger({ name: 'good' }), { name: 'bad' }]))

    loop().tick(NOON)
    await settle()

    expect(fired).toEqual([])
  })

  it('says so once rather than on every tick', async () => {
    // A poll that logged the same corrupt file every fifteen seconds would bury
    // the one message worth acting on under a thousand copies of it.
    registry('{ not json')
    const firing = loop()

    firing.tick(NOON)
    firing.tick(NOON + MINUTE)
    firing.tick(NOON + 2 * MINUTE)
    await settle()

    expect(said).toHaveLength(1)
    expect(said[0]).toContain('cannot be read')
    expect(said[0]).toContain('Nothing in it will fire.')
  })

  it('says so again when the reason changes', async () => {
    const firing = loop()
    registry('{ not json')
    firing.tick(NOON)
    registry('{"not":"a list"}')
    firing.tick(NOON + MINUTE)
    await settle()

    expect(said).toHaveLength(2)
  })

  it('says when the file becomes readable again, so the log records how it ended', async () => {
    const firing = loop()
    registry('{ not json')
    firing.tick(NOON)
    writeTriggers(workspace, [trigger({ enabled: false })])
    firing.tick(NOON + MINUTE)
    await settle()

    expect(said[1]).toContain('is readable again')
  })

  it('does not fire a trigger whose record vanished between the read and the stamp', async () => {
    // The narrow window where the registry changes under one tick. Driven here
    // through the recovery report, which is the one callback that runs between
    // the registry read and the fire.
    const firing = loop({
      report: (level, message) => {
        said.push(`${level}: ${message}`)
        if (message.includes('readable again')) writeTriggers(workspace, [])
      },
    })
    registry('{ not json')
    firing.tick(NOON)
    writeTriggers(workspace, [trigger()])
    firing.tick(NOON + MINUTE)
    await settle()

    expect(fired).toEqual([])
    expect(said.some(line => line.startsWith('warn:') && line.includes('no longer in'))).toBe(true)
  })
})

describe('stopping', () => {
  it('aborts every run it started, so disposal does not leave work behind', async () => {
    const inFlight = deferred<FiredRun>()
    let aborted = false
    answer = () => inFlight.promise
    writeTriggers(workspace, [trigger()])
    const firing = loop({
      run: (_project, task, signal) => {
        fired.push({ workspace, task })
        signal.addEventListener('abort', () => { aborted = true })
        return inFlight.promise
      },
    })

    firing.tick(NOON)
    await settle()
    firing.stop()

    expect(aborted).toBe(true)
    expect(firing.running).toBe(0)
  })
})

describe('a routine opens a session where a task run publishes an execution', () => {
  it('reaches the routine runner and never the task publisher', async () => {
    writeTriggers(workspace, [routine()])
    loop().tick(NOON)
    await settle()
    expect(opened).toEqual([{ workspace, name: 'brief' }])
    expect(fired).toEqual([])
  })

  it('names the session it opened, because that is where the work now is', async () => {
    routineAnswer = () => Promise.resolve({ sessionId: 'session-abc' })
    writeTriggers(workspace, [routine()])
    loop().tick(NOON)
    await settle()
    expect(said.join('\n')).toContain('session-abc')
  })

  it('keys overlap by the TRIGGER, since a routine has no task to collide over', async () => {
    // A task run keys by task: two triggers naming one task are two schedules
    // for one piece of work. A routine's work IS its own conversation, so two
    // routines in one project never collide and both run.
    const held = deferred<RanRoutine>()
    routineAnswer = () => held.promise
    writeTriggers(workspace, [routine({ name: 'a' }), routine({ name: 'b' })])
    loop().tick(NOON)
    await settle()
    expect(opened.map(row => row.name)).toEqual(['a', 'b'])
    held.resolve({ sessionId: 'session-1' })
  })

  it('skips a routine whose previous run has not finished', async () => {
    const held = deferred<RanRoutine>()
    routineAnswer = () => held.promise
    writeTriggers(workspace, [routine()])
    const firing = loop()
    firing.tick(NOON)
    await settle()
    firing.tick(NOON + 31 * MINUTE)
    await settle()
    expect(opened).toHaveLength(1)
    expect(said.join('\n')).toMatch(/skipped/)
    held.resolve({ sessionId: 'session-1' })
  })

  it('refuses to fire a routine in a composition that mounts no agent, and SAYS SO', async () => {
    // A headless composition has no `agents`, so a routine there cannot run at
    // all. Doing nothing quietly would be this design's own leading failure —
    // a schedule that silently did not run.
    writeTriggers(workspace, [routine()])
    loop({ routine: undefined }).tick(NOON)
    await settle()
    expect(opened).toEqual([])
    expect(said.join('\n')).toMatch(/warn:.*routines cannot run/i)
  })

  it('still stamps the attempt when it cannot run, so it warns once per WINDOW not once per tick', async () => {
    // Without the stamp, a fifteen-second tick would bury the one message worth
    // acting on under four copies a minute.
    writeTriggers(workspace, [routine()])
    const firing = loop({ routine: undefined })
    firing.tick(NOON)
    firing.tick(NOON + MINUTE)
    await settle()
    expect(said.filter(line => /routines cannot run/i.test(line))).toHaveLength(1)
    expect(onDisk()[0]!.lastFiredAt).toBe(new Date(NOON).toISOString())
  })

  it('keeps the schedule when a routine throws, exactly as a task run does', async () => {
    routineAnswer = () => Promise.reject(new Error('no credential'))
    writeTriggers(workspace, [routine()])
    loop().tick(NOON)
    await settle()
    expect(said.join('\n')).toContain('The schedule continues.')
    expect(onDisk()[0]!.enabled).toBe(true)
  })

  it('fires both kinds from ONE registry in one tick, in registry order', async () => {
    // One clock, two actions. Two registries with two notions of "due" is what
    // putting `action` on this record avoided.
    writeTriggers(workspace, [trigger(), routine()])
    loop().tick(NOON)
    await settle()
    expect(fired.map(row => row.task)).toEqual(['tasks/fit.yaml'])
    expect(opened.map(row => row.name)).toEqual(['brief'])
  })
})

describe('what the plugin declares to cordis', () => {
  it('declares inject as a flat array, because this cordis has no OPTIONAL form', () => {
    // `Inject` is either an array of names or a name-to-intercept-config map,
    // and BOTH mean required. A `{ required, optional }` object is not a third
    // form — it is read as two services literally named `required` and
    // `optional`, and the entry then hangs forever:
    //
    //   1 entry did not activate
    //   trigger-loop: pending (waiting for services: required, optional)
    //
    // Measured in a real boot 2026-08-27. `tsc` passes it, so this assertion is
    // the only cheap thing between that mistake and a dead harness. The three
    // services a ROUTINE needs are resolved at fire time instead.
    expect(Array.isArray(inject)).toBe(true)
    expect(inject).toEqual(['rheplicant', 'workspaceRegistry'])
  })
})

describe('recording the session a routine opened', () => {
  it('writes it on the named trigger and leaves the others alone', () => {
    writeTriggers(workspace, [routine({ name: 'a' }), routine({ name: 'b' })])

    expect(stampSession(workspace, 'b', 'session-42')).toBe(true)

    const [a, b] = onDisk() as readonly RoutineTrigger[]
    expect(a?.lastSessionId).toBeUndefined()
    expect(b?.lastSessionId).toBe('session-42')
  })

  it('leaves the attempt stamp alone, and vice versa', () => {
    // Two different facts on one record, written by two different moments of
    // one firing — the attempt before it starts, the session when it opens.
    // Either overwriting the other would lose the one a surface reads.
    writeTriggers(workspace, [routine({ name: 'a' })])

    stampFired(workspace, 'a', NOON)
    stampSession(workspace, 'a', 'session-42')

    const [a] = onDisk() as readonly RoutineTrigger[]
    expect(a?.lastFiredAt).toBe('2026-08-26T12:00:00.000Z')
    expect(a?.lastSessionId).toBe('session-42')

    stampFired(workspace, 'a', NOON + MINUTE)
    expect((onDisk()[0] as RoutineTrigger).lastSessionId).toBe('session-42')
  })

  it('re-reads the file rather than writing back a snapshot', () => {
    writeTriggers(workspace, [routine({ name: 'a' })])
    writeTriggers(workspace, [routine({ name: 'a' }), routine({ name: 'added-since' })])

    stampSession(workspace, 'a', 'session-42')

    expect(onDisk().map(row => row.name)).toEqual(['a', 'added-since'])
  })

  it('refuses to write over a registry it could not read', () => {
    registry('{ not json')
    expect(stampSession(workspace, 'a', 'session-42')).toBe(false)
  })

  it('answers false for a trigger the file no longer holds', () => {
    writeTriggers(workspace, [routine({ name: 'a' })])
    expect(stampSession(workspace, 'gone', 'session-42')).toBe(false)
  })

  it('writes a record the reader will still accept', () => {
    // The registry is hand-editable and every read goes through one gate. A
    // stamp that produced a record that gate refuses would make the whole
    // project's schedules unreadable — silently, one firing later.
    writeTriggers(workspace, [routine({ name: 'a' })])
    stampFired(workspace, 'a', NOON)
    stampSession(workspace, 'a', 'session-42')
    expect(readTriggers(workspace).state).toBe('ok')
  })
})


describe('the runner that joins a session to its schedule', () => {
  /** A session that records nothing and settles at once. */
  const session = (id: string) => ({
    sessionId: id,
    say: () => {},
    settle: () => Promise.resolve(),
    close: () => Promise.resolve(),
  })

  it('writes the opened session onto the trigger that opened it', async () => {
    // The end-to-end of the host half, with no model call: a real registry on
    // disk, the real runner, and a fake that only knows how to be a session.
    writeTriggers(workspace, [routine({ name: 'brief' }), routine({ name: 'other' })])

    await routineRunner(() => Promise.resolve(session('session-42')))(
      workspace, routine({ name: 'brief' }), new AbortController().signal)

    const [brief, other] = onDisk() as readonly RoutineTrigger[]
    expect(brief?.lastSessionId).toBe('session-42')
    expect(other?.lastSessionId).toBeUndefined()
  })

  it('writes it while the routine is still running, not after it finishes', async () => {
    // The reason the hook exists at all. Asserted by reading the FILE from
    // inside the turn — if the write happened on completion, this is undefined.
    writeTriggers(workspace, [routine({ name: 'brief' })])
    let duringTurn: string | undefined

    await routineRunner(() => Promise.resolve({
      ...session('session-42'),
      say: () => { duringTurn = (onDisk()[0] as RoutineTrigger).lastSessionId },
    }))(workspace, routine({ name: 'brief' }), new AbortController().signal)

    expect(duringTurn).toBe('session-42')
  })

  it('runs the routine anyway when the registry cannot be written', async () => {
    // The trigger was removed between the fire and the open, so there is
    // nothing to write it onto. The turn still happens: the work is the point
    // and the record is bookkeeping.
    writeTriggers(workspace, [])
    let said = 0

    const ran = await routineRunner(() => Promise.resolve({
      ...session('session-42'),
      say: () => { said += 1 },
    }))(workspace, routine({ name: 'gone' }), new AbortController().signal)

    expect(said).toBe(1)
    expect(ran.sessionId).toBe('session-42')
  })

  it('runs the routine anyway when the registry is unreadable', async () => {
    registry('{ not json')
    const ran = await routineRunner(() => Promise.resolve(session('session-42')))(
      workspace, routine({ name: 'brief' }), new AbortController().signal)
    expect(ran.sessionId).toBe('session-42')
    // And it did NOT overwrite the file it could not parse.
    expect(readTriggers(workspace).state).toBe('unreadable')
  })
})

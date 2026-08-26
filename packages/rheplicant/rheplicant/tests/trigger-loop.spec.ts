import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { TriggerFiring, stampFired, type FiredRun, type FiringDeps } from '@rheplicant/dsh-rheplicant/trigger-loop'
import { TRIGGERS_FILE, readTriggers, writeTriggers, type TriggerRecord } from '@rheplicant/dsh-rheplicant/triggers'

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

/** A registry file written verbatim, so a malformed one can be tested. */
function registry(text: string): void {
  mkdirSync(join(workspace, '.rheplicant-agent'), { recursive: true })
  writeFileSync(join(workspace, TRIGGERS_FILE), text)
}

/** One well-formed trigger, with the fields a test does not care about filled in. */
function trigger(overrides: Partial<TriggerRecord> = {}): TriggerRecord {
  return { name: 'ten', task: 'tasks/fit.yaml', every: 'PT10M', enabled: true, ...overrides }
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

/** The loop, over one project, with the fakes above. */
function loop(deps: Partial<FiringDeps> = {}): TriggerFiring {
  return new TriggerFiring({
    projects: () => [workspace],
    run: (project, task) => {
      fired.push({ workspace: project, task })
      return answer(task)
    },
    report: (level, message) => { said.push(`${level}: ${message}`) },
    ...deps,
  })
}

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'rheplicant-loop-'))
  fired = []
  said = []
  answer = () => Promise.resolve({ executionId: 'EXEC-1' })
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

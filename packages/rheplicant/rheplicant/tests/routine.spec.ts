import { describe, expect, it, vi } from 'vitest'
import { routineFraming, runRoutine, type RoutineDeps, type RoutineSession } from '@rheplicant/dsh-rheplicant/routine'
import type { RoutineTrigger } from '@rheplicant/dsh-rheplicant/triggers'

const now = Date.parse('2026-08-27T06:00:00Z')

/** One routine record, with only what an assertion needs stated. */
function routine(over: Partial<RoutineTrigger> = {}): RoutineTrigger {
  return { name: 'morning', action: 'routine', prompt: 'Summarise yesterday', every: 'PT30M', enabled: true, ...over }
}

/** A session that records what was said to it and how it was ended. */
function fakeSession(): RoutineSession & { said: string[]; order: string[] } {
  const said: string[] = []
  const order: string[] = []
  return {
    sessionId: 'session-fake',
    said,
    order,
    say(text) { said.push(text); order.push('say') },
    async settle() { order.push('settle') },
    async close() { order.push('close') },
  }
}

describe('the framing a routine opens its turn with', () => {
  const text = routineFraming({ trigger: routine(), occurrenceAt: now })

  it('says NOBODY IS WAITING, which is the one thing the model cannot infer', () => {
    // A routine turn looks exactly like a person typing, and a model that
    // assumes one will ask a clarifying question into an empty room and stop.
    // Every other field here is data; this sentence is the behaviour.
    expect(text).toMatch(/nobody is at the keyboard/i)
  })

  it('names the routine, so a transcript says which schedule opened it', () => {
    expect(text).toContain('routine_name: "morning"')
  })

  it('carries the cadence VERBATIM, the same word the record holds', () => {
    // `project-model.md` §27.2: `PT30M`, not "every thirty minutes". Prose here
    // would make this module the owner of a translation for every duration the
    // grammar allows.
    expect(text).toContain('cadence: PT30M')
  })

  it('states the occurrence as UTC RFC 3339', () => {
    expect(text).toContain('occurrence_at: 2026-08-27T06:00:00.000Z')
  })

  it('JSON-encodes the prompt, so a multi-line one cannot blur into the framing', () => {
    const multi = routineFraming({ trigger: routine({ prompt: 'one\ntwo: three' }), occurrenceAt: now })
    expect(multi).toContain('routine_prompt: "one\\ntwo: three"')
    // And the framing stays one field per line however odd the prompt is.
    expect(multi.split('\n').filter(line => line.startsWith('routine_prompt:'))).toHaveLength(1)
  })

  it('is deterministic, so an unchanged routine produces an unchanged prefix', () => {
    expect(routineFraming({ trigger: routine(), occurrenceAt: now })).toBe(text)
  })
})

describe('running one routine', () => {
  it('opens the session in the PROJECT directory, never anywhere else', async () => {
    // A routine belongs to a project — that is the only place its record can
    // live — so the session it opens belongs there too. It is also what puts
    // the row in that project's sidebar group rather than under Ungrouped.
    const session = fakeSession()
    const open = vi.fn(async () => session)
    await runRoutine({ open } satisfies RoutineDeps, { workspace: '/p/demo', trigger: routine(), now })
    expect(open).toHaveBeenCalledWith('/p/demo')
  })

  it('says the framing, waits for the turn, and only THEN closes', async () => {
    // Closing before the turn settles would dispose the agent mid-answer and
    // leave a truncated transcript — the routine would have run and left a
    // record of having not quite run.
    const session = fakeSession()
    await runRoutine({ open: async () => session }, { workspace: '/p/demo', trigger: routine(), now })
    expect(session.order).toEqual(['say', 'settle', 'close'])
    expect(session.said).toHaveLength(1)
  })

  it('reports the session it opened, so the log can name it', async () => {
    const ran = await runRoutine({ open: async () => fakeSession() }, { workspace: '/p/demo', trigger: routine(), now })
    expect(ran.sessionId).toBe('session-fake')
  })

  it('CLOSES the session even when the turn throws', async () => {
    // A model error must not leak a live agent. Left undisposed, one broken
    // routine on a thirty-minute cadence accumulates a live agent every half
    // hour for as long as the harness runs.
    const session = fakeSession()
    const failing: RoutineSession = { ...session, settle: async () => { throw new Error('model refused') } }
    await expect(runRoutine({ open: async () => failing }, { workspace: '/p/demo', trigger: routine(), now }))
      .rejects.toThrow('model refused')
    expect(session.order).toContain('close')
  })

  it('lets a failure to OPEN surface, rather than reporting a run that did not happen', async () => {
    await expect(runRoutine({ open: async () => { throw new Error('no model configured') } },
      { workspace: '/p/demo', trigger: routine(), now })).rejects.toThrow('no model configured')
  })
})

describe('a wall-clock routine\'s framing', () => {
  it('states the wall time, and never the word undefined', () => {
    // `every` became optional when `dailyAt` landed, and a template literal
    // swallows undefined — so this exact message went out to the model reading
    // `cadence: undefined` and no typecheck objected.
    const dawn = { name: 'dawn', action: 'routine', prompt: 'go', dailyAt: '08:00', enabled: true } as unknown as RoutineTrigger
    const text = routineFraming({ trigger: dawn, occurrenceAt: now })
    expect(text).toContain('cadence: 08:00')
    expect(text).not.toContain('undefined')
  })

  it('still states an interval routine\'s interval', () => {
    expect(routineFraming({ trigger: routine(), occurrenceAt: now })).toContain('cadence: PT30M')
  })
})

describe('telling the caller which session opened', () => {
  const run = { workspace: '/p', trigger: routine(), now }

  it('reports the id as soon as the session exists, before the turn is said', async () => {
    // The whole point of the callback rather than the return value: a routine
    // that runs for ten minutes is reachable for those ten minutes, and one
    // whose harness dies mid-turn still left a findable transcript.
    const session = fakeSession()
    const seen: string[] = []
    await runRoutine({
      open: () => Promise.resolve(session),
      opened: (id) => { seen.push(id); session.order.push('opened') },
    }, run)
    expect(seen).toEqual(['session-fake'])
    expect(session.order).toEqual(['opened', 'say', 'settle', 'close'])
  })

  it('is optional, so the framing and the sequence stay testable without one', async () => {
    const session = fakeSession()
    const ran = await runRoutine({ open: () => Promise.resolve(session) }, run)
    expect(ran.sessionId).toBe('session-fake')
    expect(session.order).toEqual(['say', 'settle', 'close'])
  })

  it('reports the same id the call returns', async () => {
    const session = fakeSession()
    const seen: string[] = []
    const ran = await runRoutine({
      open: () => Promise.resolve(session),
      opened: (id) => { seen.push(id) },
    }, run)
    expect(seen).toEqual([ran.sessionId])
  })

  it('does not cost the routine its turn when the recorder throws', async () => {
    // Recording WHERE a turn happened is bookkeeping. A routine that opened and
    // was then abandoned over a failed note is the worse of the two outcomes by
    // a wide margin — the whole point of a routine is that it runs.
    const session = fakeSession()
    const ran = await runRoutine({
      open: () => Promise.resolve(session),
      opened: () => { throw new Error('registry went away') },
    }, run)
    expect(ran.sessionId).toBe('session-fake')
    expect(session.said).toHaveLength(1)
    expect(session.order).toEqual(['say', 'settle', 'close'])
  })

  it('still closes the session when the recorder throws', async () => {
    // The `finally` is what guarantees it, and a throw from a new call placed
    // inside the `try` is exactly the way that guarantee gets lost.
    const session = fakeSession()
    let closed = false
    await runRoutine({
      open: () => Promise.resolve({ ...session, close: async () => { closed = true } }),
      opened: () => { throw new Error('nope') },
    }, run)
    expect(closed).toBe(true)
  })
})

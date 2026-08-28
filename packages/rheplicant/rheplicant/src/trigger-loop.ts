/**
 * The firing loop: the one genuinely new machine the trigger design needed.
 *
 * `docs/superpowers/specs/2026-08-26-trigger-registry-design.md` §6. Everything
 * else in that design was a record, a reader or a writer; this is the part that
 * makes a schedule happen, and §9 named it the only piece with no template
 * already in the repo.
 *
 * **The limitation is stated first, here as there, because it decides whether
 * the feature is worth having: this fires only while the harness is running.**
 * A "nightly" trigger on a sleeping laptop does not fire. Two things follow and
 * neither is negotiable:
 *
 * 1. The UI says so — the Setups column renders the cadence beside "while the
 *    harness is running", never on its own.
 * 2. **No system state, ever.** This installs no cron entry, no launchd plist,
 *    no systemd timer. `project-model.md` §9.1 drew that line for the much
 *    smaller case of `git` — *"the agent never runs git: it writes a file"* —
 *    and a scheduler that edits the user's system is the same trespass at a
 *    much larger size.
 *
 * **On fire it calls the same publisher a chat run calls** ({@link
 * publishTaskRun}), so there is no second definition of what an execution is.
 * Per design §7 a fired run produces an ordinary execution with `sessionId`
 * absent and NO durable event: the `rheplicant/run` event is appended to a
 * session log, and inventing a session to hold one would put a conversation in
 * the transcript that no person had.
 *
 * **Resolution.** This polls. A trigger fires at the first tick at or after it
 * comes due — never early, at most one tick late. The tick is therefore a floor
 * on the cadence this can actually keep, which matters only for cadences of the
 * same order as the tick: a `PT10S` trigger under a 15-second tick fires every
 * 15 seconds, not every 10. It is configurable for exactly that reason.
 *
 * @module @rheplicant/dsh-rheplicant/trigger-loop
 */

import { randomUUID } from 'node:crypto'

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import { boundContextSummary, createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-workspace'

import { publishTaskRun } from './publish.ts'
import { runRoutine, type RanRoutine, type RoutineDeps } from './routine.ts'
import {
  TRIGGERS_FILE, dueTriggers, isRoutine, readTriggers, writeTriggers,
  type RoutineTrigger, type TriggerRecord, type TriggerRegistry,
} from './triggers.ts'
import { asTransport } from './types.ts'
import type {} from './index.ts'

/** Stable Cordis plugin name. */
export const name = 'rheplicant-trigger-loop'

/**
 * Services required before anything can fire.
 *
 * `workspaceRegistry` is what makes this project-scoped without a session:
 * a trigger belongs to a project, and the registry is the host's own list of
 * them. No `sessions`, deliberately — design §1: the general case was always
 * the session-free one.
 *
 * **`agents`, `sessions` and `agentDefaultModel` are NOT here, and a routine
 * needs all three.** They are resolved at fire time instead, for two reasons
 * that both had to be learned:
 *
 * 1. **This cordis has no optional inject.** `Inject` is either an array of
 *    names or a name-to-intercept-config map, and both mean REQUIRED. A
 *    `{ required, optional }` object is not a third form — it is read as two
 *    services literally named `required` and `optional`, and the entry hangs
 *    forever. Measured 2026-08-27 in a real boot: *"1 entry did not activate —
 *    trigger-loop: pending (waiting for services: required, optional)"*. The
 *    typecheck passes it, so only a boot finds it.
 * 2. **Requiring them would be wrong even if it were possible.** A headless
 *    composition has no agents and must still fire its task triggers, which
 *    need none of the three.
 *
 * Resolving at fire time also settles load order for free — the same reason
 * `ui-loop`'s `selection-bridge.ts` re-calls its lookup rather than caching a
 * miss: a service that mounts after this one is found on the next read instead
 * of being absent forever.
 */
export const inject = ['rheplicant', 'workspaceRegistry']

/** How often the loop looks, and therefore the finest cadence it can keep. */
const DEFAULT_TICK_MS = 15_000

/** Plugin config: which transport a fired run uses, and how often to look. */
export interface Config {
  readonly transport?: string
  readonly tickMs?: number
}

export const Config: z<Config> = z.object({
  transport: z.string().default('local'),
  // The resolution, not the cadence. See the module note: a trigger fires at
  // the first tick at or after it is due.
  tickMs: z.natural().default(DEFAULT_TICK_MS),
})

/** One fired run, narrowed to what the loop reports about it. */
export interface FiredRun {
  readonly executionId: string
}

/** What the firing loop needs from the world, so its rules can be tested without one. */
export interface FiringDeps {
  /** Every project the harness knows, as directories. Read fresh each tick. */
  readonly projects: () => readonly string[]
  /** Run one task in one project and publish it. */
  readonly run: (workspace: string, task: string, signal: AbortSignal) => Promise<FiredRun>
  /**
   * Open a session in one project and give it a routine's prompt.
   *
   * **Absent is a composition fact, not a convenience.** It is undefined
   * exactly when this harness has no agent to open a session with, and the
   * three states discipline applies to it like everything else here: a routine
   * that comes due in such a composition is REPORTED as unrunnable, never
   * skipped in silence.
   */
  readonly routine?: (workspace: string, trigger: RoutineTrigger, signal: AbortSignal) => Promise<RanRoutine>
  /** Say what happened, for a host log — never for a transcript (design §7). */
  readonly report: (level: 'info' | 'warn', message: string) => void
}

/**
 * Record that a trigger ATTEMPTED to fire.
 *
 * **Its false is load-bearing**, unlike {@link stampSession}'s: a firing whose
 * attempt could not be recorded must not happen, because the next tick would
 * find the same trigger due and fire it again. See {@link stampTrigger} for
 * the write discipline both share.
 *
 * @param workspace - the project directory.
 * @param triggerName - the trigger's identity.
 * @param at - the instant of the attempt, epoch ms.
 * @returns true when the stamp landed; false when the registry was unreadable
 *   or no longer holds a trigger by that name.
 */
export function stampFired(workspace: string, triggerName: string, at: number): boolean {
  return stampTrigger(workspace, triggerName, { lastFiredAt: new Date(at).toISOString() })
}

/**
 * Record the session a routine's firing just opened.
 *
 * **It is not an error for this to fail.** The routine is already open and
 * doing its work; all that is lost is a control on a card. So the caller does
 * not treat false as a reason to stop — unlike {@link stampFired}, whose
 * failure means we could not record having fired at all.
 *
 * Only ever called for a routine. `lastSessionId` is a `RoutineTrigger` field
 * and a task trigger deliberately opens no session, so calling this for one
 * would put a field on a record that has no reading for it.
 *
 * @param workspace - the project directory.
 * @param triggerName - the trigger's identity.
 * @param sessionId - the session that is now open.
 * @returns true when the record landed.
 */
export function stampSession(workspace: string, triggerName: string, sessionId: string): boolean {
  return stampTrigger(workspace, triggerName, { lastSessionId: sessionId })
}

/** What a firing may write back onto its own record. Nothing else. */
interface TriggerStamp {
  readonly lastFiredAt?: string
  readonly lastSessionId?: string
}

/**
 * Apply one stamp to one trigger, re-reading the registry first.
 *
 * Always a fresh read-modify-write, never a patch applied to a snapshot the
 * caller was holding. Two writers touch this file — this loop and the
 * `rheplicant_trigger` tool — and a run that started ten minutes ago must not
 * write back the list as it stood when it started, silently undoing whatever
 * was scheduled in between. Both halves run synchronously, so nothing
 * interleaves within one call.
 *
 * **It refuses to write over an unreadable registry.** Overwriting a file we
 * could not parse would discard schedules the person set and report success —
 * the loudest form of the failure this design leads with.
 *
 * @param workspace - the project directory.
 * @param triggerName - the trigger's identity.
 * @param stamp - the fields to set on that one record.
 * @returns true when the write landed; false when the registry was unreadable
 *   or no longer holds a trigger by that name.
 */
function stampTrigger(
  workspace: string,
  triggerName: string,
  stamp: TriggerStamp,
): boolean {
  const registry = readTriggers(workspace)
  if (registry.state !== 'ok') return false
  const index = registry.triggers.findIndex(trigger => trigger.name === triggerName)
  if (index < 0) return false
  // The cast is safe BY THE TYPE ABOVE, not by inspection: `TriggerStamp` can
  // set only two optional strings, neither of which is a discriminant, so the
  // spread cannot turn one member of the union into a malformed other. A
  // `Partial<TriggerRecord>` here would not have that property — it could set
  // `action` and leave the record without the field that action requires.
  writeTriggers(workspace, registry.triggers.map((trigger, at) =>
    (at === index ? { ...trigger, ...stamp } as TriggerRecord : trigger)))
  return true
}

/**
 * The routine runner, with the recording of where each firing went.
 *
 * A named function rather than a closure inside `apply()`, because the one
 * line it exists for — the `opened` hook — is the whole join between "a
 * session was created" and "a card can reach it", and a join that only exists
 * inside a cordis `apply` is a join no test can reach either.
 *
 * @param open - how to open a session in one project. `sessionOpener(ctx)` in
 *   the real composition; anything at all in a test.
 * @returns the runner the firing loop calls for a due routine.
 */
export function routineRunner(open: RoutineDeps['open']): NonNullable<FiringDeps['routine']> {
  return (workspace, trigger, _signal) =>
    runRoutine(
      {
        open,
        // Recorded at OPEN, so the card can reach a routine that is still
        // running and so a harness that dies mid-turn still leaves the
        // transcript findable. The false return is deliberately not acted on:
        // the routine is already going, and what was lost is a control on a
        // card.
        opened: (sessionId) => { stampSession(workspace, trigger.name, sessionId) },
      },
      { workspace, trigger, now: Date.now() },
    )
}

/**
 * The routine runner a composition without an agent does not have.
 *
 * `fire` returns before it can be called — the check is three lines above the
 * only use — so this exists to keep that branch's type honest without a
 * non-null assertion. If it ever runs, the message is the bug report.
 */
const unrunnableRoutine = (): Promise<RanRoutine> =>
  Promise.reject(new Error('rheplicant trigger loop: a routine reached the runner in a composition that has none'))

/** One error, as a sentence a host log can carry. */
function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The three rules of design §6.1, holding one map of what is in flight.
 *
 * Separate from the cordis plugin below so that "skip rather than queue", "no
 * catch-up" and "failure does not disable" are testable by calling {@link tick}
 * with a clock, which is the same reason the registry's arithmetic lives apart
 * from its file.
 */
export class TriggerFiring {
  /** Runs in flight, keyed by `(workspace, task)` — see {@link tick}. */
  private readonly inFlight = new Map<string, AbortController>()
  /** The last unreadable-registry reason reported per project, so it is said once. */
  private readonly reported = new Map<string, string>()

  constructor(private readonly deps: FiringDeps) {}

  /** How many fired runs have not finished. Exposed for tests and diagnostics. */
  get running(): number {
    return this.inFlight.size
  }

  /**
   * Look at every project once and fire what is due.
   *
   * **No catch-up is expressible here, by construction.** `dueTriggers` answers
   * a LIST, never a count of missed windows, and the stamp below is `now` rather
   * than `lastFiredAt + period` — so a harness started after three days fires
   * each overdue trigger once and schedules the next from now. "Three days of
   * runs" is a claim about time that did not happen.
   *
   * @param now - the instant to judge against.
   */
  tick(now: number): void {
    // Deduplicated: two workspace records may name one directory, and firing a
    // project's triggers twice per tick would make the second fire skip against
    // the first — a self-inflicted overlap that looks like a real one.
    for (const workspace of new Set(this.deps.projects())) {
      const registry = readTriggers(workspace)
      this.reportRegistry(workspace, registry)
      // `absent` and `unreadable` both mean nothing fires; only `ok` has a list
      // worth walking, and an unreadable file is never partially honoured.
      if (registry.state !== 'ok') continue
      for (const trigger of dueTriggers(registry.triggers, now)) {
        this.fire(workspace, trigger, now)
      }
    }
  }

  /** Abort every run this loop started, and forget them. */
  stop(): void {
    for (const controller of this.inFlight.values()) controller.abort()
    this.inFlight.clear()
  }

  /**
   * One due trigger: stamp the attempt, then either start it or skip it.
   *
   * **The stamp comes first and happens on BOTH paths**, which is design §6.1's
   * *"`lastFiredAt` is written after the attempt, whatever its outcome"*. A skip
   * IS an attempt — the record's own word is "last ATTEMPTED to fire" — and
   * stamping it is what keeps a task slower than its own cadence from logging a
   * skip on every tick for the whole run. Stamping before rather than after the
   * run matters for the other half of the same rule: a fire that fails in its
   * first millisecond has already moved its next window, so a task file that
   * has been deleted cannot become a hot retry loop.
   *
   * **Overlap skips, and never queues.** Queueing builds an unbounded backlog
   * on a task slower than its cadence, and that backlog's failure mode — a
   * burst of identical runs hours later — is much worse than a gap. The key is
   * the TASK, not the trigger: two triggers naming one task are two schedules
   * for one piece of work, and running it twice at once is the hazard either
   * way.
   */
  private fire(workspace: string, trigger: TriggerRecord, now: number): void {
    // **The key is the unit of work, and it differs by action deliberately.** A
    // task run keys by TASK, because two triggers naming one task are two
    // schedules for one piece of work and running it twice at once is the
    // hazard either way. A routine has no task; its work IS its own
    // conversation, so two routines in one project never collide, and the key
    // is the trigger's own name.
    //
    // The separator is a NUL because a path may contain anything else. It was a
    // RAW NUL BYTE in this source until 2026-08-27 — same value, but it made
    // the whole file `Binary file matches` to grep. `\0` is the identical
    // character written so the file stays text.
    const key = isRoutine(trigger)
      ? `${workspace}\0routine:${trigger.name}`
      : `${workspace}\0${trigger.task}`
    if (!stampFired(workspace, trigger.name, now)) {
      // The registry changed under us between the read and here — removed, or
      // corrupted by another writer. Do not fire against a record we can no
      // longer record having fired.
      this.deps.report('warn',
        `trigger ${trigger.name}: not fired — its record is no longer in ${TRIGGERS_FILE}`)
      return
    }
    // Checked AFTER the stamp, so an unrunnable routine says this once per
    // WINDOW rather than once per tick — a fifteen-second tick would otherwise
    // bury the one message worth acting on under four copies a minute. The
    // stamp is right on its own terms too: a composition does not grow an agent
    // between two ticks, so retrying sooner would find the same answer.
    const openRoutine = this.deps.routine
    if (isRoutine(trigger) && openRoutine === undefined) {
      this.deps.report('warn',
        `trigger ${trigger.name}: not fired — this composition mounts no agent, so routines cannot run here.`)
      return
    }
    // What the log calls the work, in the skip line and the failure line alike.
    const subject = isRoutine(trigger) ? 'its session' : trigger.task
    if (this.inFlight.has(key)) {
      this.deps.report('info',
        `trigger ${trigger.name}: skipped — ${subject} is still running from an earlier fire`)
      return
    }
    const controller = new AbortController()
    this.inFlight.set(key, controller)
    // A thunk per action rather than a ternary, so `isRoutine`'s narrowing does
    // the work a cast would otherwise have to: inside each branch the record IS
    // the kind that branch handles, and neither branch can reach the other's
    // field.
    const work = isRoutine(trigger)
      ? (signal: AbortSignal): Promise<string> =>
          (openRoutine ?? unrunnableRoutine)(workspace, trigger, signal)
            .then(ran => `opened session ${ran.sessionId}`)
      : (signal: AbortSignal): Promise<string> =>
          this.deps.run(workspace, trigger.task, signal)
            .then(fired => `ran ${trigger.task} as execution ${fired.executionId}`)
    void work(controller.signal)
      .then((outcome) => {
        this.deps.report('info', `trigger ${trigger.name}: ${outcome}`)
      })
      .catch((error: unknown) => {
        // **Failure does not disable.** Auto-disabling would silently stop a
        // schedule the person is still expecting, which is the failure this
        // whole design leads with wearing a helpful face.
        //
        // A DOCUMENT REFUSAL LANDS HERE, not above — measured 2026-08-26
        // against a live compute service. rheplicant declining an unsound
        // document comes back as an error over the transport, so
        // `publishTaskRun` rejects. The tree is still published (upstream
        // renames it with a `.refused-<hash>` suffix, which is where
        // `listExecutions` reads the status from), and it still appears on
        // every reading surface — it simply has no sidecar of ours, because
        // the throw happened before there was an outcome to write one from.
        // The schedule continues either way, which is the rule that matters:
        // a refusal is worth recording repeatedly while the document is
        // unchanged.
        this.deps.report('warn',
          `trigger ${trigger.name}: ${subject} did not run — ${reason(error)}. The schedule continues.`)
      })
      .finally(() => { this.inFlight.delete(key) })
  }

  /**
   * Say once — not every tick — that a project's registry cannot be read.
   *
   * A poll that logged the same corrupt file every fifteen seconds would bury
   * the one message worth acting on under a thousand copies of it. Reported
   * again when the REASON changes, and once more when the file becomes readable,
   * so the log says how the state ended as well as that it started.
   */
  private reportRegistry(workspace: string, registry: TriggerRegistry): void {
    const said = this.reported.get(workspace)
    if (registry.state === 'unreadable') {
      if (said === registry.reason) return
      this.reported.set(workspace, registry.reason)
      this.deps.report('warn',
        `${workspace}: ${TRIGGERS_FILE} cannot be read — ${registry.reason}. Nothing in it will fire.`)
      return
    }
    if (said === undefined) return
    this.reported.delete(workspace)
    this.deps.report('info', `${workspace}: ${TRIGGERS_FILE} is readable again.`)
  }
}

/**
 * Build the routine runner out of a real context, or answer undefined.
 *
 * **Undefined is the honest answer for a composition without an agent**, and
 * the loop above turns it into a reported refusal rather than silence. A
 * headless tree has no `agents` at all; asking it to open a session would fail
 * inside a run nobody is watching, at whatever hour the schedule chose.
 *
 * The sequence is DSH's own, from `@deepseek-ai/dsh-headless`: create on a
 * fresh id, wait for the new agent to reach idle, open one ordinary turn, wait
 * again, flush, release. Nothing here is invented, which is the point — a
 * routine's turn should be an ordinary turn in every respect a person can see.
 *
 * **No `origin: 'subagent'`, deliberately.** That marker hides a session from
 * the sidebar projection, and a routine nobody can find in the sidebar is a
 * routine that did not deliver. The session belongs to the project's group, in
 * the list, beside the ones a person opened by hand.
 *
 * @param ctx - the plugin context.
 * @returns how to open a session; it throws if this tree cannot.
 */
function sessionOpener(ctx: Context): RoutineDeps['open'] {
  return async (workspace: string) => {
    // Resolved HERE rather than in `apply` — see the note on `inject`. A miss
    // at mount time would be permanent; a miss here is just this firing.
    const agents = ctx.get('agents')
    const sessions = ctx.get('sessions')
    const models = ctx.get('agentDefaultModel')
    if (agents === undefined || sessions === undefined || models === undefined) {
      throw new Error(
        'this composition mounts no agent, so routines cannot run here')
    }
    const selection = models.currentSelection()
    const handle = await agents.create({
      sessionId: SessionId(`session-${randomUUID()}`),
      // The project directory, and it is the whole reason a routine must belong
      // to a project: this is the field that puts the session in that project's
      // sidebar group rather than under Ungrouped.
      meta: { cwd: workspace },
      agentOptions: { provider: selection.provider, model: selection.model },
      setup: (agentCtx) => {
        installModelSelection(agentCtx, { current: selection, assembled: undefined })
      },
    })
    const { agent } = handle
    await agent.whenIdle()
    return {
      sessionId: agent.id,
      say: (text) => {
        agent.followup(createUserMessage({
          content: [{ type: 'text', text }],
          // `plugin` rather than `user`, because no user typed it, and `notice`
          // — *a one-off account of something that just happened* — because
          // that is exactly what a schedule coming due is.
          source: {
            kind: 'plugin',
            plugin: 'rheplicant-trigger',
            form: 'notice',
            summary: boundContextSummary('a routine opened this session on its schedule'),
          },
        }))
      },
      // Flush BEFORE the release: `dispose()` unregisters the live session, and
      // what the person opens from the sidebar afterwards is the persisted log.
      settle: async () => {
        await agent.whenIdle()
        await sessions.flush(agent.session)
      },
      close: () => handle.dispose(),
    }
  }
}

/**
 * Mount the firing loop.
 *
 * @param ctx - the plugin context, with `rheplicant` and `workspaceRegistry`.
 * @param config - the transport a fired run uses, and the poll resolution.
 */
export function apply(ctx: Context, config: Config): void {
  // Validated at mount, not at fire time: a profile that names a transport
  // nobody registered should fail where the profile is read, not silently at
  // three in the morning inside a run nobody is watching.
  const transport = asTransport(config.transport ?? 'local', 'rheplicant trigger loop')
  const logger = ctx.logger('rheplicant-trigger')
  const opener = sessionOpener(ctx)
  const firing = new TriggerFiring({
    projects: () => ctx.workspaceRegistry.list().map(workspace => workspace.path),
    run: (workspace, task, signal) =>
      publishTaskRun(ctx.rheplicant, { workspace, task, transport, signal }),
    report: (level, message) => { logger[level](message) },
    // **The abort signal is not wired through to a routine**, and that is a
    // stated gap rather than an oversight. `stop()` aborts what a task run is
    // doing because `publishTaskRun` listens; a turn in progress is owned by
    // the agent, and the agent is owned by this context, so disposal already
    // takes it down by the ordinary route. Threading the signal into
    // `agent.cancel` would add a second way to stop one turn, and the loop
    // would then own a decision — cancel mid-answer, or let it finish — that
    // belongs to whoever is disposing the harness.
    routine: routineRunner(opener),
  })

  ctx.effect(() => {
    // No immediate tick: the first look is one interval in. A never-fired
    // trigger is due immediately (design's `nextFireAt`), so ticking inside
    // `apply` would run every scheduled task while the host is still composing
    // itself — and the fifteen seconds bought back are worth nothing to a
    // schedule measured in minutes.
    const timer = setInterval(() => { firing.tick(Date.now()) }, config.tickMs ?? DEFAULT_TICK_MS)
    // A background poller must never be the reason a process refuses to exit.
    timer.unref()
    return () => {
      clearInterval(timer)
      firing.stop()
    }
  })
}

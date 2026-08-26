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

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-workspace'

import { publishTaskRun } from './publish.ts'
import {
  TRIGGERS_FILE, dueTriggers, readTriggers, writeTriggers, type TriggerRecord, type TriggerRegistry,
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
  /** Say what happened, for a host log — never for a transcript (design §7). */
  readonly report: (level: 'info' | 'warn', message: string) => void
}

/**
 * Record that a trigger ATTEMPTED to fire, re-reading the registry first.
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
 * @param at - the instant of the attempt, epoch ms.
 * @returns true when the stamp landed; false when the registry was unreadable
 *   or no longer holds a trigger by that name.
 */
export function stampFired(workspace: string, triggerName: string, at: number): boolean {
  const registry = readTriggers(workspace)
  if (registry.state !== 'ok') return false
  const index = registry.triggers.findIndex(trigger => trigger.name === triggerName)
  if (index < 0) return false
  const stamped = new Date(at).toISOString()
  writeTriggers(workspace, registry.triggers.map((trigger, at_) =>
    (at_ === index ? { ...trigger, lastFiredAt: stamped } : trigger)))
  return true
}

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
    const key = `${workspace} ${trigger.task}`
    if (!stampFired(workspace, trigger.name, now)) {
      // The registry changed under us between the read and here — removed, or
      // corrupted by another writer. Do not fire against a record we can no
      // longer record having fired.
      this.deps.report('warn',
        `trigger ${trigger.name}: not fired — its record is no longer in ${TRIGGERS_FILE}`)
      return
    }
    if (this.inFlight.has(key)) {
      this.deps.report('info',
        `trigger ${trigger.name}: skipped — ${trigger.task} is still running from an earlier fire`)
      return
    }
    const controller = new AbortController()
    this.inFlight.set(key, controller)
    void this.deps.run(workspace, trigger.task, controller.signal)
      .then((fired) => {
        // A REFUSED or errored run reaches here too, having published its own
        // tree: `publishTaskRun` resolves for every outcome rheplicant reports.
        // That is the point of §6.1's third rule — a refusal is rheplicant
        // declining an unsound document, which is worth recording repeatedly
        // while the document is unchanged.
        this.deps.report('info',
          `trigger ${trigger.name}: ran ${trigger.task} as execution ${fired.executionId}`)
      })
      .catch((error: unknown) => {
        // **Failure does not disable.** Auto-disabling would silently stop a
        // schedule the person is still expecting, which is the failure this
        // whole design leads with wearing a helpful face.
        this.deps.report('warn',
          `trigger ${trigger.name}: ${trigger.task} did not run — ${reason(error)}. The schedule continues.`)
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
  const firing = new TriggerFiring({
    projects: () => ctx.workspaceRegistry.list().map(workspace => workspace.path),
    run: (workspace, task, signal) =>
      publishTaskRun(ctx.rheplicant, { workspace, task, transport, signal }),
    report: (level, message) => { logger[level](message) },
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

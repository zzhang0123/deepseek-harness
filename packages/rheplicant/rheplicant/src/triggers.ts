/**
 * The trigger registry: what a project has asked to run on its own.
 *
 * `docs/superpowers/specs/2026-08-26-trigger-registry-design.md`. A Trigger is
 * the fourth entity (§3 there), identified by `(workspaceId, triggerName)` and
 * NOT by the task it names — a trigger keyed by task path would silently become
 * a trigger for nothing the moment the task was renamed, where one that NAMES a
 * task can say "the task this names is gone". A reference is not a key, which is
 * the rule `project-model.md` §11 applied to sessions.
 *
 * It cannot live in the task document: upstream owns that grammar and refuses
 * unknown keys, so a `trigger:` section would mean this repo forking a grammar
 * §18.2 forbids forking. So it is a sibling file, and being a separately
 * addressed file is what makes it an entity rather than a property.
 *
 * **This module reads and writes; it never fires.** The firing loop is a host
 * plugin, and keeping the record separate from the clock is what lets the rules
 * in §6.1 of the design — skip rather than queue, no catch-up, failure does not
 * disable — be tested as arithmetic.
 *
 * @module @rheplicant/dsh-rheplicant/triggers
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { STATE_DIR } from './project.ts'

// Re-exported at its historical name: `project.ts` owns the layout, because
// that is the module the managed `.gitignore` block is written from and a path
// it must ignore cannot be owned by a module it does not import.
export { STATE_DIR }

/** Where the registry lives, project-relative. */
export const TRIGGERS_FILE = join(STATE_DIR, 'triggers.json')

/**
 * What a trigger DOES when it comes due.
 *
 * The record was single-purpose until 2026-08-27: a trigger re-ran a task and
 * published it, full stop. `run` is that, unchanged. `routine` is the second
 * kind, and the reason it is a field on the SAME record rather than a second
 * registry beside it is that the action decides what happens and never WHEN —
 * `nextFireAt` and `dueTriggers` are shared, deliberately, because two notions
 * of "due" in one project is the drift this entity exists to prevent.
 */
export type TriggerAction = 'run' | 'routine'

/** What every trigger carries, whatever it does. */
interface TriggerCommon {
  /** This trigger's identity within its project. */
  readonly name: string
  /**
   * The INTERVAL cadence, as an ISO-8601 duration the file holds verbatim.
   *
   * **Exactly one of `every` and `dailyAt`, enforced at read time rather than
   * in the type.** The type could carry the union — `action` does — but the
   * cost lands somewhere the discriminant does not: `action` distinguishes two
   * kinds of trigger, so a caller almost always wants one branch or the other,
   * while the cadence is read by every renderer at once and would make each of
   * them narrow before it could print a string. {@link cadenceOf} answers that
   * in one call instead, and {@link recordProblem} is the single gate every
   * read already passes through.
   */
  readonly every?: string
  /**
   * The WALL-CLOCK cadence: a 24-hour `HH:MM` in the host's local time.
   *
   * **This is not a second way to say the same thing — it says something
   * `every` cannot.** `every` computes `lastFiredAt + period`, and the stamp is
   * written at the ATTEMPT, so a harness that was down for three hours moves
   * every subsequent firing three hours later, permanently. A daily interval
   * drifts; a daily wall time does not, because the answer depends on the clock
   * rather than on when it last ran.
   *
   * **Host-local, and that has to be said on screen.** There is no `timeZone`
   * field: the firing loop runs on one machine and reads that machine's clock,
   * which makes the host's zone the only answer it could give honestly. A
   * laptop that travels therefore changes what `08:00` means, so every surface
   * that renders this says whose clock it is.
   *
   * DST is the platform's answer, deliberately: `Date.prototype.setHours`
   * resolves a spring-forward gap by moving to the next existing instant and a
   * fall-back overlap to the first of the two — which is the same rule DSH's
   * own `@deepseek-ai/dsh-schedule` records for its absolute `at`, so the two
   * schedulers in this harness do not disagree about the two odd days a year.
   */
  readonly dailyAt?: string
  /** False disables it without removing it — the state a person can toggle. */
  readonly enabled: boolean
  /**
   * When it last ATTEMPTED to fire, whatever the outcome.
   *
   * Written after the attempt rather than after a success, so a skipped or
   * failed fire cannot cause the next one to fire immediately (design §6.1).
   * Absent until the first attempt.
   */
  readonly lastFiredAt?: string
}

/**
 * Re-run one task file and publish it — the original trigger, unchanged.
 *
 * **`action` is optional and absent means this**, which is not laziness: every
 * registry already on disk was written before routines existed and all of them
 * hold task runs. Rewriting those files to state a fact the reader can supply
 * would be a migration, and a migration that runs against a file people
 * hand-edit is one that eventually loses somebody's schedule.
 *
 * Leaves NO conversation (`project-model.md` §27.4): a published execution is
 * not a thing anyone said.
 */
export interface TaskTrigger extends TriggerCommon {
  readonly action?: 'run'
  /** The task it names, workspace-relative. May name a task that is gone. */
  readonly task: string
}

/**
 * Open a session in the project and give it a prompt — a routine.
 *
 * **This one DOES leave a conversation**, and that reverses §27.4 for this
 * action only. The reason the earlier rule gave — *"inventing a session to hold
 * one would put a conversation in the transcript that nobody had"* — is exactly
 * right about a task run and exactly wrong about a routine: here the
 * conversation IS the deliverable. Someone who asks for a recurring
 * conversation has not had one invented for them; they have been given the one
 * they asked for.
 *
 * It carries a prompt and no task, because the model can reach `rheplicant_run`
 * itself. A routine that wants a task run says so in its prompt, which keeps
 * this record from growing a second way to name the same work.
 */
export interface RoutineTrigger extends TriggerCommon {
  readonly action: 'routine'
  /** What to say when the session opens. Verbatim, never templated. */
  readonly prompt: string
  /**
   * The session the last firing opened.
   *
   * **Written at OPEN, not at completion**, so it is the session this routine
   * is in now while a long one is still running — which is exactly when
   * somebody wants to look — and so a harness that dies mid-turn still leaves
   * the transcript findable.
   *
   * **On the routine and not on {@link TriggerCommon}.** A task trigger
   * deliberately leaves no conversation (`project-model.md` §27.4): it
   * publishes an execution, and inventing a session to hold one would put a
   * conversation in the transcript that nobody had. A field that is absent by
   * design on half a union is a field that cannot be read, so it lives on the
   * half where it means something.
   *
   * Absent until the first firing, and absent forever on a composition that
   * mounts no agent — where a routine cannot run at all. A surface reading it
   * must therefore treat absence as "nothing to open yet" rather than as an
   * error, and must not treat presence as a promise: a session can be deleted
   * from the sidebar while this record still names it.
   */
  readonly lastSessionId?: string
}

/** One trigger, as the file holds it. */
export type TriggerRecord = TaskTrigger | RoutineTrigger

/**
 * The floor on a routine's cadence.
 *
 * **A task run costs compute the person already owns; a routine costs a MODEL
 * CALL.** An accidental `PT10S` is therefore a bill rather than a busy laptop,
 * and it is the kind of mistake that runs all night before anyone sees it. Five
 * minutes is DSH's own `MIN_EVERY_INTERVAL_SECONDS`, adopted rather than
 * invented so the two schedulers in this harness agree about what is too often.
 *
 * The floor applies to routines and NOT to task runs, and the asymmetry is the
 * point: it is about spending, not about the clock.
 */
export const MIN_ROUTINE_PERIOD_MS = 300_000

/**
 * Whether this trigger opens a session, narrowing the record for the caller.
 *
 * A type guard rather than an `action` comparison because `action` is optional
 * on the run side, so only a guard narrows the union at every call site.
 *
 * @param trigger - the record.
 * @returns true when it is a routine.
 */
export function isRoutine(trigger: TriggerRecord): trigger is RoutineTrigger {
  return trigger.action === 'routine'
}

/**
 * What the registry says, in three states that must not be collapsed.
 *
 * `absent` and `unreadable` both mean "no trigger will fire", and reporting
 * them the same way would be the failure this codebase keeps refusing: a
 * corrupt file would render as "this project has no schedules", which is a
 * confident answer to a question nothing could answer.
 */
export type TriggerRegistry =
  | { readonly state: 'absent'; readonly triggers: readonly TriggerRecord[] }
  | { readonly state: 'ok'; readonly triggers: readonly TriggerRecord[] }
  | { readonly state: 'unreadable'; readonly triggers: readonly TriggerRecord[]; readonly reason: string }

/**
 * What is wrong with one unknown value, or undefined when it is a usable record.
 *
 * **It answers with a REASON rather than a boolean**, because the reader's
 * whole contract is that a registry it will not act on says why. The single
 * message this used to build — *"needs name, task, every as a supported
 * duration, and enabled"* — listed `task` unconditionally, which stopped being
 * true the moment a routine could carry a prompt instead.
 *
 * @param value - one parsed entry.
 * @returns the problem, or undefined when the entry is a trigger.
 */
function recordProblem(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return 'is not an object'
  const row = value as Record<string, unknown>
  const text = (key: string): boolean => typeof row[key] === 'string' && row[key] !== ''
  if (!text('name')) return 'needs a non-empty name'
  if (typeof row.enabled !== 'boolean') return 'needs enabled to be true or false'
  if (row.lastFiredAt !== undefined && typeof row.lastFiredAt !== 'string') {
    return 'has a lastFiredAt that is not a string'
  }
  // Checked here beside `lastFiredAt` rather than in the routine branch below,
  // even though only a routine carries one. A task record that somehow holds
  // the field is not made valid by being a task, and the reader's whole
  // contract is that a registry it will not act on says why — including about
  // a field it will then ignore.
  if (row.lastSessionId !== undefined && typeof row.lastSessionId !== 'string') {
    return 'has a lastSessionId that is not a string'
  }
  // EXACTLY ONE CADENCE, refused in both directions. Neither leaves the firing
  // loop with no answer to "when"; both give it two, and one of them would
  // silently win — the same rule, for the same reason, as the tool's
  // task/prompt pair.
  const hasEvery = text('every')
  const hasDaily = text('dailyAt')
  if (hasEvery === hasDaily) {
    return 'needs exactly one of every (an interval) or dailyAt (a wall-clock HH:MM)'
  }
  let period: number | undefined
  if (hasDaily) {
    if (!DAILY_AT.test(row.dailyAt as string)) {
      return `has a dailyAt that is not a 24-hour HH:MM (${String(row.dailyAt)})`
    }
  } else {
    period = durationMs(row.every as string)
    if (period === undefined) return `has a cadence this layer will not act on (${String(row.every)})`
  }
  // Absent means `run` — see TaskTrigger. An action that is present and unknown
  // is refused rather than defaulted: a file written by a newer version of this
  // package would otherwise be silently run as something it does not say.
  const action = row.action ?? 'run'
  if (action === 'run') {
    return text('task') ? undefined : 'needs a non-empty task'
  }
  if (action !== 'routine') return `has an action this version does not know (${String(action)})`
  if (!text('prompt')) return 'needs a non-empty prompt'
  // The floor is about INTERVALS. It exists because a short one spends a model
  // call over and over; a wall-clock cadence is daily by construction, so there
  // is no interval for it to be too short.
  if (period !== undefined && period < MIN_ROUTINE_PERIOD_MS) {
    return `is a routine faster than PT5M (${String(row.every)}), and every routine fire spends a model call`
  }
  return undefined
}

/**
 * Read a project's registry.
 *
 * A file that parses but holds a malformed entry is `unreadable` rather than
 * silently filtered: dropping one row would run a SUBSET of what the person
 * asked for while reporting success, and a schedule that quietly does less than
 * it says is the failure mode the whole design leads with.
 *
 * @param workspace - the project directory (canonical).
 * @returns the registry, in one of its three states.
 */
export function readTriggers(workspace: string): TriggerRegistry {
  let text: string
  try {
    text = readFileSync(join(workspace, TRIGGERS_FILE), 'utf8')
  } catch {
    return { state: 'absent', triggers: [] }
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { state: 'unreadable', triggers: [], reason: 'the file is not valid JSON' }
  }
  if (!Array.isArray(value)) {
    return { state: 'unreadable', triggers: [], reason: 'the file does not hold a list of triggers' }
  }
  for (const [index, entry] of value.entries()) {
    const problem = recordProblem(entry)
    if (problem !== undefined) {
      return { state: 'unreadable', triggers: [], reason: `entry ${index} ${problem}` }
    }
  }
  const names = new Set<string>()
  for (const entry of value as TriggerRecord[]) {
    if (names.has(entry.name)) {
      return { state: 'unreadable', triggers: [], reason: `two triggers are named ${entry.name}` }
    }
    names.add(entry.name)
  }
  return { state: 'ok', triggers: value as TriggerRecord[] }
}

/**
 * Replace a project's registry.
 *
 * The whole list, never a patch: the file is small, and a read-modify-write of
 * the whole thing is the only form that cannot leave a half-applied change
 * behind. Creates the state directory when it is missing.
 *
 * @param workspace - the project directory (canonical).
 * @param triggers - the complete list.
 * @returns the path written.
 */
export function writeTriggers(workspace: string, triggers: readonly TriggerRecord[]): string {
  const path = join(workspace, TRIGGERS_FILE)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(triggers, null, 2)}\n`, 'utf8')
  return path
}

/** What a toggle did, in the three states its caller must not collapse. */
export type ToggleOutcome =
  | { readonly ok: true; readonly trigger: TriggerRecord }
  | { readonly ok: false; readonly code: 'schedule_not_found' }
  | { readonly ok: false; readonly code: 'registry_unreadable'; readonly reason: string }

/**
 * Enable or disable one trigger, re-reading the registry first.
 *
 * **The one WRITE this module offers a caller other than the tool**, and it
 * exists because the board can toggle. Everything else about a trigger — its
 * prompt, its task, its cadence — is still authored by asking the agent, so
 * this is not a general editing seam and must not grow into one: it flips a
 * boolean a person can already see, and that is the whole reason it is safe to
 * put behind a switch rather than behind a sentence.
 *
 * **It refuses an unreadable registry**, like {@link stampFired} and the tool.
 * Writing over a file we could not parse would discard schedules the person set
 * and report success — the loudest form of this design's leading failure.
 *
 * A fresh read-modify-write, never a patch onto a snapshot the caller held:
 * three writers touch this file now (the tool, the firing loop's stamp, and
 * this), and a toggle must not resurrect a trigger removed in between.
 *
 * @param workspace - the project directory (canonical).
 * @param name - the trigger's identity within that project.
 * @param enabled - the state to set.
 * @returns what happened, in three states.
 */
export function setTriggerEnabled(
  workspace: string,
  name: string,
  enabled: boolean,
): ToggleOutcome {
  const registry = readTriggers(workspace)
  if (registry.state === 'unreadable') {
    return { ok: false, code: 'registry_unreadable', reason: registry.reason }
  }
  const index = registry.triggers.findIndex(trigger => trigger.name === name)
  if (index < 0) return { ok: false, code: 'schedule_not_found' }
  const next = registry.triggers.map(trigger =>
    (trigger.name === name ? { ...trigger, enabled } : trigger))
  writeTriggers(workspace, next)
  return { ok: true, trigger: next[index]! }
}

/** A trigger's cadence, narrowed so a renderer needs no optional handling. */
export type TriggerCadence =
  | { readonly kind: 'every'; readonly text: string }
  | { readonly kind: 'dailyAt'; readonly text: string }

/** The `HH:MM` a wall-clock cadence is written in. 24-hour, zero-padded. */
export const DAILY_AT = /^(?:[01]\d|2[0-3]):[0-5]\d$/

/**
 * Which cadence this record carries, and its verbatim text.
 *
 * One call for every surface that renders a cadence, so none of them has to
 * know that two optional fields stand for one required fact. The text is
 * VERBATIM in both arms — `project-model.md` §27.2's rule does not change
 * because the grammar grew.
 *
 * @param trigger - the record.
 * @returns the cadence, discriminated.
 */
export function cadenceOf(trigger: TriggerRecord): TriggerCadence {
  return trigger.dailyAt === undefined
    ? { kind: 'every', text: trigger.every ?? '' }
    : { kind: 'dailyAt', text: trigger.dailyAt }
}

/**
 * The next instant at which the host's local clock reads `HH:MM`, strictly
 * after `from`.
 *
 * **Strictly after, and that is load-bearing.** A target at or equal to the
 * instant it is computed from is a target the firing loop would find due on its
 * very next tick, and again on the one after that.
 *
 * **It does not read `Date.now()`.** The answer is a function of the argument
 * alone, which is what lets the drift property be tested: two different
 * last-fire instants on the same day must produce one answer, and they do,
 * because the day is the only thing either of them contributes.
 *
 * DST is `setHours`/`setDate`'s answer rather than one invented here — see the
 * note on {@link TriggerCommon.dailyAt}.
 *
 * @param dailyAt - `HH:MM`, 24-hour, host-local.
 * @param from - the instant to look forward from, epoch ms.
 * @returns the next matching instant, epoch ms.
 */
export function nextDailyAt(dailyAt: string, from: number): number {
  const hours = Number(dailyAt.slice(0, 2))
  const minutes = Number(dailyAt.slice(3, 5))
  const at = new Date(from)
  at.setHours(hours, minutes, 0, 0)
  if (at.getTime() <= from) at.setDate(at.getDate() + 1)
  return at.getTime()
}

/**
 * One ISO-8601 duration in milliseconds, or undefined when it is not one this
 * layer will act on.
 *
 * **Deliberately a SUBSET.** Weeks, months and years are refused, and the
 * reason is that they are not fixed lengths: `P1M` is 28 to 31 days, so a
 * schedule expressed in months has no single answer to "when next", and a
 * scheduler that picked one would be inventing a convention the person never
 * agreed to. `P30D` says thirty days and means it.
 *
 * @param every - the duration text, verbatim from the record.
 * @returns milliseconds, or undefined when unsupported.
 */
export function durationMs(every: string): number | undefined {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(every)
  if (match === null) return undefined
  const [, days, hours, minutes, seconds] = match
  const total =
    Number(days ?? 0) * 86_400_000
    + Number(hours ?? 0) * 3_600_000
    + Number(minutes ?? 0) * 60_000
    + Number(seconds ?? 0) * 1000
  // `P` and `PT` parse but mean nothing; a zero cadence would fire forever.
  return total > 0 ? total : undefined
}

/**
 * When a trigger is next due, or undefined when it is not.
 *
 * A trigger that has NEVER fired is due immediately — the person asked for it
 * to run every ten minutes, and making them wait ten minutes for the first one
 * would answer a question they did not ask.
 *
 * @param trigger - the record.
 * @param now - the instant to judge against.
 * @returns the due instant in epoch ms, or undefined when disabled or unusable.
 */
export function nextFireAt(trigger: TriggerRecord, now: number): number | undefined {
  if (!trigger.enabled) return undefined
  // A never-fired trigger is due immediately in BOTH arms, and for the reason
  // that has nothing to do with which cadence it carries: the person asked for
  // this to happen, and making them wait one window for the first one answers a
  // question they did not ask.
  const last = trigger.lastFiredAt === undefined ? undefined : Date.parse(trigger.lastFiredAt)
  const anchor = last === undefined || Number.isNaN(last) ? undefined : last
  if (trigger.dailyAt !== undefined) {
    if (!DAILY_AT.test(trigger.dailyAt)) return undefined
    return anchor === undefined ? now : nextDailyAt(trigger.dailyAt, anchor)
  }
  const period = durationMs(trigger.every ?? '')
  if (period === undefined) return undefined
  return anchor === undefined ? now : anchor + period
}

/**
 * Which triggers are due, given the clock.
 *
 * **No catch-up is expressible here, by construction.** The answer is a list of
 * triggers, never a count of missed windows: a harness started after three days
 * fires each due trigger ONCE, because "three days of runs" is a claim about
 * time that did not happen (design §6.1).
 *
 * @param triggers - the registry's list.
 * @param now - the instant to judge against.
 * @returns the due ones, in registry order.
 */
export function dueTriggers(
  triggers: readonly TriggerRecord[],
  now: number,
): readonly TriggerRecord[] {
  return triggers.filter((trigger) => {
    const due = nextFireAt(trigger, now)
    return due !== undefined && due <= now
  })
}

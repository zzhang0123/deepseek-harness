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

/** The directory this layer keeps its own project-level state in. */
export const STATE_DIR = '.rheplicant-agent'

/**
 * Where the registry lives, project-relative.
 *
 * Close to the per-execution sidecar's name (`.rheplicant-agent.json`) on
 * purpose — both are marked as this layer's own — but a DIRECTORY at the
 * project root rather than a file inside a tree. They never collide.
 */
export const TRIGGERS_FILE = join(STATE_DIR, 'triggers.json')

/** One trigger, as the file holds it. */
export interface TriggerRecord {
  /** This trigger's identity within its project. */
  readonly name: string
  /** The task it names, workspace-relative. May name a task that is gone. */
  readonly task: string
  /** The cadence, as an ISO-8601 duration the file holds verbatim. */
  readonly every: string
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

/** Whether one unknown value is a usable trigger record. */
function isRecord(value: unknown): value is TriggerRecord {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  const text = (key: string): boolean => typeof row[key] === 'string' && row[key] !== ''
  if (!text('name') || !text('task') || !text('every')) return false
  if (typeof row.enabled !== 'boolean') return false
  if (row.lastFiredAt !== undefined && typeof row.lastFiredAt !== 'string') return false
  return durationMs(row.every as string) !== undefined
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
  const bad = value.findIndex(entry => !isRecord(entry))
  if (bad >= 0) {
    return {
      state: 'unreadable',
      triggers: [],
      reason: `entry ${bad} is not a trigger (needs name, task, every as a supported duration, and enabled)`,
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
  const period = durationMs(trigger.every)
  if (period === undefined) return undefined
  if (trigger.lastFiredAt === undefined) return now
  const last = Date.parse(trigger.lastFiredAt)
  if (Number.isNaN(last)) return now
  return last + period
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

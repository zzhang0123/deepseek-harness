/**
 * Model-facing `rheplicant_trigger` tool over the project's trigger registry.
 *
 * `docs/superpowers/specs/2026-08-26-trigger-registry-design.md` §4 — **the
 * agent, through a tool.** `project-model.md` §17.2 (the UI never writes) and
 * `surface-model.md` §7 decision 5 (both write gestures route through the
 * agent) apply unchanged: a trigger is authored the way a task is, so the
 * person says what they want, the agent writes the file, and the transcript
 * records it.
 *
 * It writes and reads ONLY. Nothing here fires anything — the firing loop is a
 * host plugin, and a tool that could fire would make "run it now" and "run it
 * every ten minutes" the same gesture, which they are not.
 *
 * **The workspace comes from the session, and that is correct here.** The
 * seam's `publishTaskRun` takes it as an argument precisely because a TRIGGER
 * has no session; a tool call always does, and its session's directory is the
 * project the person is talking about.
 *
 * @module @rheplicant/dsh-rheplicant-tool-trigger
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
import { ComputeError } from '@rheplicant/dsh-rheplicant'
import { ensureResultsIgnored } from '@rheplicant/dsh-rheplicant/project'
import {
  DAILY_AT, MIN_ROUTINE_PERIOD_MS, TRIGGERS_FILE, cadenceOf, durationMs, isRoutine,
  nextFireAt, readTriggers, writeTriggers,
  type TriggerRecord,
} from '@rheplicant/dsh-rheplicant/triggers'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-rheplicant-trigger'

/** Services required by the tool. */
export const inject = ['tools']

/** Plugin config: none today; the shape exists so a profile can address it. */
export interface Config {}

export const Config: z<Config> = z.object({})

/** What one call did, as the model receives it. */
interface TriggerResult {
  readonly action: string
  readonly triggers: readonly TriggerRecord[]
  /** The file this call wrote, absent for a read. */
  readonly written?: string
  /** The `.gitignore` this call created or brought up to date, announced once. */
  readonly gitignoreWritten?: string
  /** Why the registry could not be read, when it could not. */
  readonly unreadable?: string
}

/**
 * The registry, or a refusal.
 *
 * An UNREADABLE registry refuses every action rather than being treated as
 * empty. Writing over a file we could not parse would delete schedules the
 * person set and report success — the loudest possible version of the failure
 * the design leads with. Repairing it is a human's call, so the refusal names
 * the file and the reason.
 */
function load(workspace: string): readonly TriggerRecord[] {
  const registry = readTriggers(workspace)
  if (registry.state === 'unreadable') {
    throw new ComputeError(
      `rheplicant_trigger: refusing to touch ${TRIGGERS_FILE} — ${registry.reason}. `
      + 'Fix or delete the file; overwriting it would discard schedules that are still in it.',
      'INVALID_DOCUMENT',
    )
  }
  return registry.triggers
}

/** The session's own directory, or a refusal naming why there is none. */
function projectOf(cwd: string | undefined): string {
  if (cwd === undefined) {
    throw new ComputeError(
      'rheplicant_trigger: this session has no working directory, so there is no project to schedule in.',
      'INVALID_DOCUMENT',
    )
  }
  return cwd
}

/** Register the `rheplicant_trigger` tool. */
export function apply(ctx: Context, _config: Config): void {
  ctx.tools.register(defineTool({
    name: 'rheplicant_trigger',
    description:
      'Schedule something to happen on its own, and list or change what is '
      + 'scheduled. A trigger is either a TASK to re-run (give `task`) or a '
      + 'ROUTINE (give `prompt`), which opens a new session in this project on '
      + 'its cadence and puts the prompt in it — use a routine for recurring '
      + 'work whose answer you want to read. Everything here fires ONLY while '
      + 'this harness is running, so it is not a substitute for cron. Use '
      + 'rheplicant_run to run something once — this never runs anything.',
    parameters: {
      action: {
        type: 'string',
        description: 'set (create or replace), disable, enable, remove, or list.',
      },
      name: {
        type: 'string',
        description: "The trigger's name — its identity in this project. Required except for list.",
      },
      task: {
        type: 'string',
        description:
          'Workspace-relative path of the task document to run. Give this OR `prompt`, never both.',
      },
      prompt: {
        type: 'string',
        description:
          'Makes this a routine: on each cadence a NEW session opens in this project and '
          + 'receives this text, and its answer stays in that session for the user to read. '
          + 'Give this OR `task`, never both. Cadence must be PT5M or slower, because each '
          + 'firing spends a model call.',
      },
      every: {
        type: 'string',
        description:
          'INTERVAL cadence as an ISO-8601 duration: PT10M, PT2H, P1D, P1DT12H. Measured from '
          + 'the last attempt, so it drifts later whenever the harness was down. Give this OR '
          + '`daily_at`, never both. Weeks, months and years are refused because they are not '
          + 'fixed lengths — say P30D.',
      },
      daily_at: {
        type: 'string',
        description:
          'WALL-CLOCK cadence: a 24-hour HH:MM (e.g. 08:00) in the HOST machine\'s local time. '
          + 'Use this for "every morning at eight" — unlike `every` it does not drift when the '
          + 'harness was down. Give this OR `every`, never both.',
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => {
        const result = value as unknown as TriggerResult
        const rows = result.triggers.length === 0
          ? '  (none)'
          : result.triggers.map((trigger) => {
            const due = nextFireAt(trigger, Date.now())
            const when = trigger.enabled
              ? (due === undefined ? 'unusable cadence' : `next ${new Date(due).toISOString()}`)
              : 'disabled'
            // A routine has no task to name, so it names what it will SAY —
            // clipped, because a prompt is the field people write paragraphs in
            // and a listing is not the place to read one back.
            const what = isRoutine(trigger)
              ? `routine ${JSON.stringify(trigger.prompt.length > 60 ? `${trigger.prompt.slice(0, 60)}…` : trigger.prompt)}`
              : trigger.task
            const cadence = cadenceOf(trigger)
            const rhythm = cadence.kind === 'dailyAt'
              ? `daily at ${cadence.text} (host clock)`
              : `every ${cadence.text}`
            return `  ${trigger.name}: ${what} ${rhythm} — ${when}`
          }).join('\n')
        // Announced once, naming the file (§9.1's rule for the managed
        // `.gitignore`, for the same reason: a silent write to a file the user
        // owns is exactly the wrongness §4.4 refuses). BOTH files are named:
        // the second is somebody else's file, so it is the one that most needs
        // saying out loud.
        const wrote = result.written === undefined ? '' : `\nWrote ${result.written}.`
        const ignored = result.gitignoreWritten === undefined
          ? ''
          : `\nUpdated ${result.gitignoreWritten} so this stays out of git.`
        const caveat = result.triggers.some(trigger => trigger.enabled)
          ? '\nTriggers fire only while this harness is running.'
          : ''
        return [{ type: 'text', text: `Triggers:\n${rows}${wrote}${ignored}${caveat}` }]
      },
    },
    // Synchronous work in an async signature: the registry is a small local
    // file, and the tool contract is a promise either way.
    // eslint-disable-next-line @typescript-eslint/require-await
    async execute(args, exec) {
      const workspace = projectOf(exec.agent?.session.header.cwd)
      const action = typeof args.action === 'string' ? args.action : ''
      const existing = load(workspace)

      /** The trigger this call names, and where it sits. */
      const named = (): { name: string; at: number } => {
        const name_ = typeof args.name === 'string' ? args.name : ''
        if (name_ === '') {
          throw new ComputeError(
            `rheplicant_trigger: \`${action}\` needs \`name\` — a trigger is identified by its name, not by the task it runs.`,
            'INVALID_DOCUMENT',
          )
        }
        return { name: name_, at: existing.findIndex(row => row.name === name_) }
      }

      /** Persist and answer. */
      const commit = (triggers: readonly TriggerRecord[]): TriggerResult => {
        // BEFORE the file lands, not after — the same ordering the run path
        // uses (§9.1). The registry lives in the state directory the managed
        // block ignores, and a schedule that showed up as untracked source in
        // the user's next `git status` would be this layer littering in a
        // repository it does not own.
        const gitignoreWritten = ensureResultsIgnored(workspace)
        return {
          action,
          triggers,
          written: writeTriggers(workspace, triggers),
          ...(gitignoreWritten === undefined ? {} : { gitignoreWritten }),
        }
      }

      if (action === 'list') {
        return { action, triggers: existing } as unknown as Record<string, JsonValue>
      }

      if (action === 'set') {
        const { name: name_, at } = named()
        const task = typeof args.task === 'string' ? args.task.trim() : ''
        const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : ''
        const every = typeof args.every === 'string' ? args.every.trim() : ''
        const dailyAt = typeof args.daily_at === 'string' ? args.daily_at.trim() : ''
        // Exactly one cadence, refused in both directions — the same rule this
        // branch already applies to task/prompt, for the same reason: two
        // answers to "when" is worse than none, because one silently wins.
        if ((every === '') === (dailyAt === '')) {
          throw new ComputeError(
            'rheplicant_trigger: `set` needs exactly one of `every` (an interval such as PT10M, '
            + 'measured from the last attempt) or `daily_at` (a wall-clock HH:MM on the host, '
            + 'which does not drift).',
            'INVALID_DOCUMENT',
          )
        }
        if (dailyAt !== '' && !DAILY_AT.test(dailyAt)) {
          throw new ComputeError(
            `rheplicant_trigger: ${JSON.stringify(dailyAt)} is not a 24-hour HH:MM. `
            + 'Write it zero-padded, as 08:00 or 23:45. It is read in the HOST machine\'s local '
            + 'time, so a laptop that changes time zone changes what it means.',
            'INVALID_DOCUMENT',
          )
        }
        // Exactly one, refused in BOTH directions. Neither leaves nothing to
        // do; both would be a trigger with two answers to "what happens", and
        // silently preferring one of them is how a person ends up with a
        // schedule that does the other.
        if ((task === '') === (prompt === '')) {
          throw new ComputeError(
            'rheplicant_trigger: `set` needs exactly one of `task` (re-run a task document) '
            + 'or `prompt` (open a session on this cadence and say it).',
            'INVALID_DOCUMENT',
          )
        }
        if (every !== '' && durationMs(every) === undefined) {
          throw new ComputeError(
            `rheplicant_trigger: ${JSON.stringify(every)} is not a cadence this can act on. `
            + 'Use an ISO-8601 duration of days, hours, minutes or seconds — PT10M, PT2H, P1D, P1DT12H. '
            + 'Weeks, months and years are refused because they are not fixed lengths: P1M is 28 to 31 days, '
            + 'so it has no single answer to "when next". Say P30D if that is what you mean.',
            'INVALID_DOCUMENT',
          )
        }
        // The floor is on ROUTINES only, because it is about spending rather
        // than about the clock: a task run costs compute the person already
        // owns, and a routine costs a model call every time it fires. Same
        // five-minute floor DSH's own scheduler uses.
        // The floor is about INTERVALS — a wall-clock routine is daily by
        // construction, so there is no interval for it to be too short.
        if (prompt !== '' && every !== '' && (durationMs(every) ?? 0) < MIN_ROUTINE_PERIOD_MS) {
          throw new ComputeError(
            `rheplicant_trigger: ${JSON.stringify(every)} is too fast for a routine. `
            + 'Each firing opens a session and spends a model call, so the floor is PT5M. '
            + 'A `task` trigger has no floor — it runs compute you already own.',
            'INVALID_DOCUMENT',
          )
        }
        // The task is NOT checked for existence, deliberately. A trigger NAMES
        // a task (design §3), so one may legitimately be written before the
        // document it runs — and one whose task later disappears must survive
        // to say so rather than vanish. The Setups surface renders that state;
        // refusing it here would make it unreachable.
        const shared = {
          name: name_,
          ...(dailyAt === '' ? { every } : { dailyAt }),
          enabled: true,
          // A replaced trigger keeps its firing history: `set` changes what is
          // scheduled, and forgetting `lastFiredAt` would make the next tick
          // fire immediately — a cadence change that runs the task now is not
          // what anybody asked for.
          ...(at >= 0 && existing[at]?.lastFiredAt !== undefined
            ? { lastFiredAt: existing[at]?.lastFiredAt }
            : {}),
        }
        // A `set` that changes a trigger's KIND replaces it whole, which is why
        // neither field is carried across: a routine that kept a stale `task`
        // would read as a task run on every surface that renders one.
        const replaced: TriggerRecord = prompt === ''
          ? { ...shared, task }
          : { ...shared, action: 'routine', prompt }
        const next = at >= 0
          ? existing.map((row, index) => (index === at ? replaced : row))
          : [...existing, replaced]
        return commit(next) as unknown as Record<string, JsonValue>
      }

      if (action === 'disable' || action === 'enable') {
        const { name: name_, at } = named()
        if (at < 0) {
          throw new ComputeError(
            `rheplicant_trigger: no trigger named ${JSON.stringify(name_)} in this project.`,
            'INVALID_DOCUMENT',
          )
        }
        const enabled = action === 'enable'
        return commit(existing.map((row, index) =>
          (index === at ? { ...row, enabled } : row))) as unknown as Record<string, JsonValue>
      }

      if (action === 'remove') {
        const { name: name_, at } = named()
        if (at < 0) {
          throw new ComputeError(
            `rheplicant_trigger: no trigger named ${JSON.stringify(name_)} in this project.`,
            'INVALID_DOCUMENT',
          )
        }
        return commit(existing.filter((_row, index) => index !== at)) as unknown as Record<string, JsonValue>
      }

      throw new ComputeError(
        `rheplicant_trigger: unknown action ${JSON.stringify(action)}; use set, disable, enable, remove or list.`,
        'INVALID_DOCUMENT',
      )
    },
  }))
}

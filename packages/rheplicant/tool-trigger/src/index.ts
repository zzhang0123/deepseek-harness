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
  TRIGGERS_FILE, durationMs, nextFireAt, readTriggers, writeTriggers,
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
      'Schedule a task document to run on its own, and list or change what is '
      + 'scheduled. A trigger names a task and a cadence; it fires ONLY while '
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
        description: 'Workspace-relative path of the task document to run. Required for set.',
      },
      every: {
        type: 'string',
        description:
          'Cadence as an ISO-8601 duration: PT10M, PT2H, P1D, P1DT12H. Required for set. '
          + 'Weeks, months and years are refused because they are not fixed lengths — say P30D.',
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
            return `  ${trigger.name}: ${trigger.task} every ${trigger.every} — ${when}`
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
        const task = typeof args.task === 'string' ? args.task : ''
        const every = typeof args.every === 'string' ? args.every : ''
        if (task === '' || every === '') {
          throw new ComputeError(
            'rheplicant_trigger: `set` needs both `task` and `every`.',
            'INVALID_DOCUMENT',
          )
        }
        if (durationMs(every) === undefined) {
          throw new ComputeError(
            `rheplicant_trigger: ${JSON.stringify(every)} is not a cadence this can act on. `
            + 'Use an ISO-8601 duration of days, hours, minutes or seconds — PT10M, PT2H, P1D, P1DT12H. '
            + 'Weeks, months and years are refused because they are not fixed lengths: P1M is 28 to 31 days, '
            + 'so it has no single answer to "when next". Say P30D if that is what you mean.',
            'INVALID_DOCUMENT',
          )
        }
        // The task is NOT checked for existence, deliberately. A trigger NAMES
        // a task (design §3), so one may legitimately be written before the
        // document it runs — and one whose task later disappears must survive
        // to say so rather than vanish. The Setups surface renders that state;
        // refusing it here would make it unreachable.
        const replaced: TriggerRecord = {
          name: name_,
          task,
          every,
          enabled: true,
          // A replaced trigger keeps its firing history: `set` changes what is
          // scheduled, and forgetting `lastFiredAt` would make the next tick
          // fire immediately — a cadence change that runs the task now is not
          // what anybody asked for.
          ...(at >= 0 && existing[at]?.lastFiredAt !== undefined
            ? { lastFiredAt: existing[at]?.lastFiredAt }
            : {}),
        }
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

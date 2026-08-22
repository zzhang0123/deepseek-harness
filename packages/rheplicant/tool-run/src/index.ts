/**
 * Model-facing `rheplicant_run` tool over `ctx.rheplicant`. This package owns the
 * schema, validation, and presentation, never a transport or a provider. The
 * document grammar itself belongs to rheplicant's schema and is surfaced through
 * the `rheplicant_schema` tool in a later phase, not restated here.
 * @module @rheplicant/dsh-rheplicant-tool-run
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-jobs'
import type {} from '@rheplicant/dsh-rheplicant'
import type { ComputeDocument, RunOutcome, Transport } from '@rheplicant/dsh-rheplicant'
import { mintExecutionId, resolveTaskInput } from '@rheplicant/dsh-rheplicant/task'

declare module '@deepseek-ai/dsh-jobs' {
  interface JobKindMap {
    /** A rheplicant compute run dispatched to a background job. */
    rheplicant: 'rheplicant'
  }
}

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-rheplicant-run'

/** Services required by the tool. */
export const inject = ['tools', 'rheplicant']

/** Plugin config: the transport a call uses when the model does not name one. */
export interface Config {
  defaultTransport?: string
}

export const Config: z<Config> = z.object({
  defaultTransport: z.string().default('local'),
})

/** Register the `rheplicant_run` tool. */
export function apply(ctx: Context, config: Config): void {
  ctx.tools.register(defineTool({
    name: 'rheplicant_run',
    description:
      'Run a rheplicant analysis document and read back one result per run. ' +
      'Give it `task`: the path of a document file in the project — that is the ' +
      'durable form, and its exact bytes are what run. Use `document` only for ' +
      'scratch work; an inline run leaves no task file to open, diff or re-run. ' +
      'The document declares an observation, a model, an inference section, and ' +
      'an ordered list of runs (forward, fisher, plan.estimate, plan.sample, nuts, ' +
      'conjugate.*, identifiability, predict, ...). Results carry diagnostics ' +
      '(r_hat, identifiability rank, joint chi-squared) that must be read alongside ' +
      'the numbers. Long runs (nuts, npe, large gcr) may take minutes: pass ' +
      'run_in_background: true and poll the returned job id with job_output.',
    parameters: {
      task: {
        type: 'string',
        description:
          'PREFERRED. Path to the task document to run, relative to the session directory ' +
          '(e.g. "tasks/global-signal-fit.yaml"). Its exact bytes are the run input, so the ' +
          'result is anchored to a file you can open and version. Must stay inside the ' +
          'session directory. Give exactly one of `task` or `document`.',
      },
      document: {
        type: 'object',
        additionalProperties: true,
        description:
          'An inline config document (runtime, observation, model, inference, runs), for ' +
          'SCRATCH work only — it leaves no task file behind. Give exactly one of `task` or `document`.',
      },
      transport: {
        type: 'string',
        description: `Which compute transport to use; defaults to "${config.defaultTransport}".`,
      },
      runs: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional subset of run names to report, in declaration order.',
      },
      run_in_background: {
        type: 'boolean',
        description: 'Dispatch the run to a background job and return its job id (poll with job_output).',
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => {
        const projected = value as unknown as Record<string, JsonValue>
        const executionId = typeof projected.executionId === 'string' ? projected.executionId : 'unknown'
        if (typeof projected.jobId === 'string') {
          return [{
            type: 'text',
            text: `Background run started: ${projected.jobId} (execution ${executionId}) — read its output with job_output.`,
          }]
        }
        return [{ type: 'text', text: formatRunOutcome(value as unknown as RunOutcome, executionId) }]
      },
    },
    async execute(args, exec) {
      // P0 TODO: validate the string against the Transport union instead of casting.
      const transport = (args.transport ?? config.defaultTransport) as Transport
      // Exactly one of `task` / `document`, and — for a task — the file's
      // bytes, read under confinement to the SESSION's own directory. There
      // is no `process.cwd()` fallback: a session with no directory cannot
      // name a task at all.
      const resolved = resolveTaskInput('rheplicant_run', args, exec.agent?.session.header.cwd)
      // One id per CALL, minted before dispatch so the background and
      // foreground paths carry the same identity. The digest half is the
      // authored document's; the random half separates two runs of one task
      // inside one second (see mintExecutionId).
      const executionId = mintExecutionId(resolved.taskDigest)
      const identity = {
        executionId,
        taskDigest: resolved.taskDigest,
        ...(resolved.taskPath === undefined ? {} : { taskPath: resolved.taskPath }),
      }
      if (args.run_in_background === true) {
        const jobs = ctx.get('jobs')
        if (jobs === undefined) {
          throw new Error('background jobs are unavailable — mount @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs')
        }
        const id = jobs.start({
          kind: 'rheplicant',
          label: `rheplicant run (${transport})`,
          ...(exec.agent === undefined ? {} : { owner: exec.agent }),
          run: () => {
            const controller = new AbortController()
            const run = ctx.rheplicant.run(resolved.input, {
              transport,
              runs: args.runs,
              signal: controller.signal,
            })
            return {
              cancel: (reason) => { controller.abort(reason ?? 'killed') },
              done: run.then((outcome) => {
                exec.agent?.session.append('rheplicant/run', {
                  document: eventDocument(resolved.input.document, outcome),
                  outcome,
                  transport,
                  ...identity,
                }, { ignorable: true })
                return { status: 'completed' as const, output: formatRunOutcome(outcome, executionId) }
              }),
            }
          },
        })
        return { jobId: id, executionId } as unknown as Record<string, JsonValue>
      }
      const outcome = await ctx.rheplicant.run(resolved.input, {
        transport,
        runs: args.runs,
        signal: exec.signal,
      })
      // Model-visible means logged: record the durable event the ui-analysis node
      // matches, so the transcript reconstructs the run from the log. A call
      // without an owning agent (e.g. Code Mode) has no transcript to anchor.
      // Marked ignorable: a purely-informational downstream event type that a
      // reader may skip without corrupting the model conversation.
      exec.agent?.session.append('rheplicant/run', {
        document: eventDocument(resolved.input.document, outcome),
        outcome,
        transport,
        ...identity,
      }, { ignorable: true })
      // The seam returns the rich RunOutcome; the tool's canonical JSON value is
      // its projection. Describe the output schema precisely (and drop this cast)
      // once the RunOutcome field set is final.
      return { ...outcome, ...identity } as unknown as Record<string, JsonValue>
    },
  }))
}

/**
 * The document to record on the durable event. An inline call already holds
 * it; a `task:` call holds only bytes (parsing YAML here would put a second
 * owner on the grammar), so it uses the copy the service echoes back after
 * parsing. `{}` is the last resort for a service too old to echo — an empty
 * mapping reads on screen as "no document recorded", which is true.
 */
function eventDocument(inline: ComputeDocument | undefined, outcome: { readonly document?: ComputeDocument }): ComputeDocument {
  return inline ?? outcome.document ?? {}
}

/** One line per run, with diagnostics surfaced for the model to read. */
function formatRunOutcome(outcome: RunOutcome, executionId: string): string {
  const lines = outcome.runs.map((run) => {
    if (run.status === 'failed') {
      return `- ${run.name} (${run.kind}): FAILED — ${run.error?.message ?? 'error'}`
    }
    const diagnostics = run.diagnostics ? ` | diagnostics: ${JSON.stringify(run.diagnostics)}` : ''
    return `- ${run.name} (${run.kind}): ok${diagnostics}`
  })
  // The id leads: two runs of one document with one seed report identical
  // lines, and this is what tells the model which execution it is reading.
  return [`execution ${executionId}`, ...lines].join('\n')
}

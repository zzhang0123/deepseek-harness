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
import type { RunOutcome, Transport } from '@rheplicant/dsh-rheplicant'

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
      'The document declares an observation, a model, an inference section, and ' +
      'an ordered list of runs (forward, fisher, plan.estimate, plan.sample, nuts, ' +
      'conjugate.*, identifiability, predict, ...). Results carry diagnostics ' +
      '(r_hat, identifiability rank, joint chi-squared) that must be read alongside ' +
      'the numbers. Long runs (nuts, npe, large gcr) may take minutes: pass ' +
      'run_in_background: true and poll the returned job id with job_output.',
    parameters: {
      document: {
        type: 'object',
        required: true,
        additionalProperties: true,
        description: 'The config document: runtime, observation, model, inference, runs.',
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
        if (typeof projected.jobId === 'string') {
          return [{ type: 'text', text: `Background run started: ${projected.jobId} — read its output with job_output.` }]
        }
        return [{ type: 'text', text: formatRunOutcome(value as unknown as RunOutcome) }]
      },
    },
    async execute(args, exec) {
      // P0 TODO: validate the string against the Transport union instead of casting.
      const transport = (args.transport ?? config.defaultTransport) as Transport
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
            const run = ctx.rheplicant.run(args.document, {
              transport,
              runs: args.runs,
              signal: controller.signal,
            })
            return {
              cancel: (reason) => { controller.abort(reason ?? 'killed') },
              done: run.then((outcome) => {
                exec.agent?.session.append('rheplicant/run', { document: args.document, outcome, transport }, { ignorable: true })
                return { status: 'completed' as const, output: formatRunOutcome(outcome) }
              }),
            }
          },
        })
        return { jobId: id } as unknown as Record<string, JsonValue>
      }
      const outcome = await ctx.rheplicant.run(args.document, {
        transport,
        runs: args.runs,
        signal: exec.signal,
      })
      // Model-visible means logged: record the durable event the ui-analysis node
      // matches, so the transcript reconstructs the run from the log. A call
      // without an owning agent (e.g. Code Mode) has no transcript to anchor.
      // Marked ignorable: a purely-informational downstream event type that a
      // reader may skip without corrupting the model conversation.
      exec.agent?.session.append('rheplicant/run', { document: args.document, outcome, transport }, { ignorable: true })
      // The seam returns the rich RunOutcome; the tool's canonical JSON value is
      // its projection. Describe the output schema precisely (and drop this cast)
      // once the RunOutcome field set is final.
      return outcome as unknown as Record<string, JsonValue>
    },
  }))
}

/** One line per run, with diagnostics surfaced for the model to read. */
function formatRunOutcome(outcome: RunOutcome): string {
  const lines = outcome.runs.map((run) => {
    if (run.status === 'failed') {
      return `- ${run.name} (${run.kind}): FAILED — ${run.error?.message ?? 'error'}`
    }
    const diagnostics = run.diagnostics ? ` | diagnostics: ${JSON.stringify(run.diagnostics)}` : ''
    return `- ${run.name} (${run.kind}): ok${diagnostics}`
  })
  return lines.join('\n')
}

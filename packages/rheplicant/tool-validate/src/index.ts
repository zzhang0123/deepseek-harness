/**
 * Model-facing `rheplicant_validate` tool over `ctx.rheplicant`. Owns the schema,
 * validation, and presentation, never a transport or provider.
 * @module @rheplicant/dsh-rheplicant-tool-validate
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
import type {} from '@rheplicant/dsh-rheplicant'
import { asTransport } from '@rheplicant/dsh-rheplicant'
import type { Transport, ValidationReport } from '@rheplicant/dsh-rheplicant'
import { resolveTaskInput } from '@rheplicant/dsh-rheplicant/task'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-rheplicant-validate'

/** Services required by the tool. */
export const inject = ['tools', 'rheplicant']

/** Plugin config: the transport a call uses when the model does not name one. */
export interface Config {
  defaultTransport?: string
}

export const Config: z<Config> = z.object({
  defaultTransport: z.string().default('local'),
})

/** Register the `rheplicant_validate` tool. */
export function apply(ctx: Context, config: Config): void {
  ctx.tools.register(defineTool({
    name: 'rheplicant_validate',
    description:
      'Validate a rheplicant config document without building or running it. ' +
      'Give it `task`: the path of a document file in the project — the durable ' +
      'form, validated as the exact bytes that will later run. Use `document` only ' +
      'for scratch work. Returns every refusal and warning with the JSON path to fix, ' +
      'so a document that passes here is ready for rheplicant_gates and then rheplicant_run.',
    parameters: {
      task: {
        type: 'string',
        description:
          'PREFERRED. Path to the task document to validate, relative to the session directory ' +
          '(e.g. "tasks/global-signal-fit.yaml"). Must stay inside the session directory. ' +
          'Give exactly one of `task` or `document`.',
      },
      document: {
        type: 'object',
        additionalProperties: true,
        description:
          'An inline config document, for SCRATCH work only. Give exactly one of `task` or `document`.',
      },
      transport: {
        type: 'string',
        description: `Which compute transport to use; defaults to "${config.defaultTransport}".`,
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: formatValidationReport(value as unknown as ValidationReport) }],
    },
    async execute(args, exec) {
      // Validated at the boundary: the value is MODEL-supplied, and a typo
      // cast through reached the seam as "no provider is registered", which
      // reads as a composition problem rather than a misspelling.
      const transport = asTransport(args.transport ?? config.defaultTransport, 'rheplicant_validate')
      // Exactly one of `task` / `document`; a task path is read under
      // confinement to the SESSION's own directory. See `resolveTaskInput`.
      const resolved = resolveTaskInput('rheplicant_validate', args, exec.agent?.session.header.cwd)
      const report = await ctx.rheplicant.validate(resolved.input, { transport, signal: exec.signal })
      // Model-visible means logged: record the durable event the ui-analysis node
      // matches, so the transcript reconstructs the validation from the log. A call
      // without an owning agent (e.g. Code Mode) has no transcript to anchor.
      // Marked ignorable: a purely-informational downstream event type that a
      // reader may skip without corrupting the model conversation.
      // A `task:` call holds bytes, not a mapping — the recorded document is
      // the copy the service echoes back after parsing (never re-parsed here).
      exec.agent?.session.append('rheplicant/validate', {
        document: resolved.input.document ?? report.document ?? {},
        transport,
        report,
        taskDigest: resolved.taskDigest,
        ...(resolved.taskPath === undefined ? {} : { taskPath: resolved.taskPath }),
      }, { ignorable: true })
      return report as unknown as Record<string, JsonValue>
    },
  }))
}

export function formatValidationReport(report: ValidationReport): string {
  const warnings = report.warnings ?? []
  // `valid` is "no ERRORS", not "nothing to say". Short-circuiting on it
  // dropped every pre-flight warning before it reached the model — under a
  // sentence that claimed there were none, which is the part that makes it a
  // lie rather than an omission.
  if (report.valid && report.errors.length === 0 && warnings.length === 0) {
    return 'valid: true (no errors or warnings)'
  }
  const lines = [`valid: ${report.valid}`]
  for (const error of report.errors) lines.push(`- [error] ${error.path || '<document>'}: ${error.message}`)
  for (const warning of warnings) lines.push(`- [warning] ${warning.path || '<document>'}: ${warning.message}`)
  return lines.join('\n')
}

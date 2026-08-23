/**
 * Model-facing `rheplicant_gates` tool over `ctx.rheplicant`. Owns the schema,
 * validation, and presentation, never a transport or provider.
 * @module @rheplicant/dsh-rheplicant-tool-gates
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
import type {} from '@rheplicant/dsh-rheplicant'
import { asTransport } from '@rheplicant/dsh-rheplicant'
import type { GatesReport, Transport } from '@rheplicant/dsh-rheplicant'
import { resolveTaskInput } from '@rheplicant/dsh-rheplicant/task'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-rheplicant-gates'

/** Services required by the tool. */
export const inject = ['tools', 'rheplicant']

/** Plugin config: the transport a call uses when the model does not name one. */
export interface Config {
  defaultTransport?: string
}

export const Config: z<Config> = z.object({
  defaultTransport: z.string().default('local'),
})

/** Register the `rheplicant_gates` tool. */
export function apply(ctx: Context, config: Config): void {
  ctx.tools.register(defineTool({
    name: 'rheplicant_gates',
    description:
      'Report what a rheplicant config document will actually run and spend, before ' +
      'anything is built. Answers which checks (linearity, identifiability, ' +
      'prior_sensitivity) run in which mode, and what they cost, so an expensive step ' +
      'is planned before it is committed. Give it `task`: the path of a document ' +
      'file in the project — the durable form. Use `document` only for scratch work.',
    parameters: {
      task: {
        type: 'string',
        description:
          'PREFERRED. Path to the task document whose checks to price, relative to the session ' +
          'directory (e.g. "tasks/global-signal-fit.yaml"). Must stay inside the session ' +
          'directory. Give exactly one of `task` or `document`.',
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
      render: (_args, value) => [{ type: 'text', text: formatGatesReport(value as unknown as GatesReport) }],
    },
    async execute(args, exec) {
      // Validated at the boundary: the value is MODEL-supplied, and a typo
      // cast through reached the seam as "no provider is registered", which
      // reads as a composition problem rather than a misspelling.
      const transport = asTransport(args.transport ?? config.defaultTransport, 'rheplicant_gates')
      // Exactly one of `task` / `document`; a task path is read under
      // confinement to the SESSION's own directory. See `resolveTaskInput`.
      const resolved = resolveTaskInput('rheplicant_gates', args, exec.agent?.session.header.cwd)
      const report = await ctx.rheplicant.gates(resolved.input, { transport, signal: exec.signal })
      // Model-visible means logged: record the durable event the ui-analysis node
      // matches, so the transcript reconstructs the gates call from the log. A call
      // without an owning agent (e.g. Code Mode) has no transcript to anchor.
      // Marked ignorable: a purely-informational downstream event type that a
      // reader may skip without corrupting the model conversation.
      // A `task:` call holds bytes, not a mapping — the recorded document is
      // the copy the service echoes back after parsing (never re-parsed here).
      exec.agent?.session.append('rheplicant/gates', {
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

export function formatGatesReport(report: GatesReport): string {
  // The EFFECTIVE state, which is what this line has always shown and what a
  // model deciding whether to run needs. `mode` used to carry it; since
  // 2026-08-23 `mode` carries only what the document DECLARED and is absent
  // when it declared nothing, so reading it alone would print `undefined` for
  // every defaulted check.
  const lines = report.checks.map((check) => {
    // `cost` is OPTIONAL and the service does not compute it yet — its own
    // type says so. Interpolating it unconditionally shipped
    // "- linearity: warn (undefined)" to the model on every single gates
    // call, which is worse than saying nothing: it reads as a cost that was
    // measured and came back missing.
    const cost = check.cost === undefined ? '' : ` (${check.cost})`
    return `- ${check.check}: ${check.state ?? check.mode ?? 'unknown'}${cost}`
  })
  if (lines.length === 0) return 'no checks declared'
  return lines.join('\n')
}

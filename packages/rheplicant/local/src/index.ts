/**
 * Local transport provider for the rheplicant compute seam (`transport: local`).
 * Spawns the Python compute service and speaks newline-delimited JSON-RPC on its
 * stdio via the shared {@link stdioRequest} transport, one spawn per request. P3
 * replaces this with a managed daemon so JAX compilation is amortized; the
 * request/response shape does not change.
 * @module @rheplicant/dsh-rheplicant-local
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { stdioRequest } from '@rheplicant/dsh-rheplicant-transport'
import type {} from '@rheplicant/dsh-rheplicant'
import type {
  ComputeDocument,
  ComputeOpts,
  ComputeProvider,
  GatesReport,
  RunOpts,
  RunOutcome,
  SchemaDocument,
  SignalPathGraph,
  ValidationReport,
} from '@rheplicant/dsh-rheplicant'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'rheplicant-local'

/** The compute seam this provider registers into. */
export const inject = ['rheplicant']

/** Plugin config: how to spawn the Python service, and the per-request budget. */
export interface Config {
  /** The interpreter to spawn. Defaults to `python`. */
  command?: string
  /** Arguments naming the compute service entry point. */
  args?: string[]
  /** Per-request wall-clock budget in milliseconds. */
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  command: z.string().default('python'),
  args: z.array(z.string()).default(['-m', 'rheplicant_compute.server']),
  timeoutMs: z.number().default(300_000),
})

/** Config after schemastery fills every default; fields are non-optional. */
type ResolvedConfig = Required<Config>

/** Register the local provider under `transport: local`. */
export function apply(ctx: Context, config: Config): void {
  ctx.rheplicant.registerProvider(['local'], new LocalComputeProvider(config as ResolvedConfig))
}

/** One JSON-RPC request over a freshly spawned Python child process. */
class LocalComputeProvider implements ComputeProvider {
  constructor(private readonly config: ResolvedConfig) {}

  validate(document: ComputeDocument, opts: ComputeOpts): Promise<ValidationReport> {
    return this.request<ValidationReport>('validate', { document }, opts)
  }

  gates(document: ComputeDocument, opts: ComputeOpts): Promise<GatesReport> {
    return this.request<GatesReport>('gates', { document }, opts)
  }

  run(document: ComputeDocument, opts: RunOpts): Promise<RunOutcome> {
    return this.request<RunOutcome>('run', { document, runs: opts.runs }, opts)
  }

  schema(opts: ComputeOpts): Promise<SchemaDocument> {
    return this.request<SchemaDocument>('schema', {}, opts)
  }

  graph(document: ComputeDocument, opts: ComputeOpts): Promise<SignalPathGraph | null> {
    return this.request<{ graph: SignalPathGraph | null }>('graph', { document }, opts)
      .then((result) => result.graph)
  }

  private request<T>(method: string, params: unknown, opts: ComputeOpts): Promise<T> {
    return stdioRequest<T>(this.config.command, this.config.args, method, params, {
      timeoutMs: this.config.timeoutMs,
      signal: opts.signal,
    })
  }
}

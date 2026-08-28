/**
 * SSH transport provider for the rheplicant compute seam (`transport: ssh`).
 * Spawns `ssh <host> <command…>` and speaks newline-delimited JSON-RPC over the
 * SSH channel via the shared {@link stdioRequest} transport. The remote machine
 * must have the compute service installed; the request/response shape is
 * identical to `transport: local`.
 * @module @rheplicant/dsh-rheplicant-ssh
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { resolveEndpoint, stdioRequest } from '@rheplicant/dsh-rheplicant-transport'
import type {} from '@rheplicant/dsh-rheplicant'
import { ComputeError } from '@rheplicant/dsh-rheplicant'
import type {
  DocumentProjection,
  DefinitionReport,
  ComputeDocument,
  ComputeInput,
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
export const name = 'rheplicant-ssh'

/** The compute seam this provider registers into. */
export const inject = ['rheplicant']

/** Plugin config: the remote host and how to start the remote service. */
export interface Config {
  /** SSH host to run the compute service on. */
  host?: string
  /** Remote interpreter. Defaults to `python`. */
  command?: string
  /** Remote arguments naming the compute service entry point. */
  args?: string[]
  /** Per-request wall-clock budget in milliseconds. */
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  host: z.string(),
  command: z.string().default('python'),
  args: z.array(z.string()).default(['-m', 'rheplicant_compute.server']),
  timeoutMs: z.number().default(300_000),
})

/** Config after schemastery fills every default; fields are non-optional. */
type ResolvedConfig = Required<Config>

/** Register the ssh provider under `transport: ssh`. */
export function apply(ctx: Context, config: Config): void {
  // Settings first, composition as the default — see `resolveEndpoint`. The
  // `ui-compute` card edits these at runtime, and a composed value that
  // silently outranked it would make that card do nothing.
  const endpoints = ctx.rheplicant.getEndpoints().ssh
  const host = resolveEndpoint(endpoints?.host, config.host)
  if (host === undefined) {
    throw new ComputeError(
      'rheplicant ssh host is not configured — set `host` in the plugin config or `ssh.host` in the compute settings',
      'TRANSPORT',
    )
  }
  const command = resolveEndpoint(endpoints?.command, config.command) ?? 'python'
  ctx.rheplicant.registerProvider(['ssh'], new SshComputeProvider({
    host,
    command,
    args: config.args ?? ['-m', 'rheplicant_compute.server'],
    timeoutMs: config.timeoutMs ?? 300_000,
  } as ResolvedConfig))
}

/** One JSON-RPC request over `ssh <host> <command…>`. */
class SshComputeProvider implements ComputeProvider {
  constructor(private readonly config: ResolvedConfig) {}

  // `input` is spread verbatim into the JSON-RPC params: an absent half is
  // `undefined`, which `JSON.stringify` drops, so the service sees exactly
  // the one key the caller set and owns the "exactly one" rule alone.
  validate(input: ComputeInput, opts: ComputeOpts): Promise<ValidationReport> {
    return this.request<ValidationReport>('validate', { ...input }, opts)
  }

  gates(input: ComputeInput, opts: ComputeOpts): Promise<GatesReport> {
    return this.request<GatesReport>('gates', { ...input }, opts)
  }

  run(input: ComputeInput, opts: RunOpts): Promise<RunOutcome> {
    return this.request<RunOutcome>('run', { ...input, runs: opts.runs, outputsDir: opts.outputsDir }, opts)
  }

  readExecution(resultsPath: string, opts: RunOpts): Promise<RunOutcome> {
    return this.request<RunOutcome>('execution.read', { resultsPath, runs: opts.runs }, opts)
  }

  definition(input: ComputeInput, opts: ComputeOpts): Promise<DefinitionReport> {
    return this.request<DefinitionReport>('document.definition', { ...input }, opts)
  }

  projectDocument(documentText: string, opts: ComputeOpts): Promise<DocumentProjection> {
    // The slice, never the whole snapshot: `include` is what keeps a 68 KB
    // projection off the wire when 21 KB is what gets rendered.
    return this.request<DocumentProjection>(
      'document.project',
      { yaml: documentText, include: ['svg', 'walkOrder', 'model', 'runs', 'parameters'] },
      opts,
    )
  }

  schema(opts: ComputeOpts): Promise<SchemaDocument> {
    return this.request<SchemaDocument>('schema', {}, opts)
  }

  graph(document: ComputeDocument, opts: ComputeOpts): Promise<SignalPathGraph | null> {
    return this.request<{ graph: SignalPathGraph | null }>('graph', { document }, opts)
      .then((result) => result.graph)
  }

  private request<T>(method: string, params: unknown, opts: ComputeOpts): Promise<T> {
    return stdioRequest<T>(
      'ssh',
      [this.config.host, this.config.command, ...this.config.args],
      method,
      params,
      // Spread, not `signal: opts.signal`. `StdioRequestOptions.signal` is
      // `AbortSignal` and optional, so under dsh's own
      // `exactOptionalPropertyTypes` PASSING the key with an undefined value
      // is an error while omitting it is fine. Latent in `local` since it was
      // written — its src never entered a program that checks this, because
      // it has no spec importing it (see HANDOVER trap 2 on weaker configs).
      { timeoutMs: this.config.timeoutMs, ...(opts.signal === undefined ? {} : { signal: opts.signal }) },
    )
  }
}

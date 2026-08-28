/**
 * HTTP transport provider for the rheplicant compute seam (`transport: http`).
 * POSTs one JSON-RPC request to a long-lived remote service and reads the single
 * response. A daemon on the cluster keeps JAX compilation warm across requests;
 * this provider only owns the dial, never the daemon's lifecycle.
 * @module @rheplicant/dsh-rheplicant-http
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { resolveEndpoint } from '@rheplicant/dsh-rheplicant-transport'
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
export const name = 'rheplicant-http'

/** The compute seam this provider registers into. */
export const inject = ['rheplicant']

/** Plugin config: the remote JSON-RPC endpoint and the per-request budget. */
export interface Config {
  /** Full URL of the remote JSON-RPC endpoint. */
  url?: string
  /** Per-request wall-clock budget in milliseconds. */
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  url: z.string(),
  timeoutMs: z.number().default(300_000),
})

/** Config after schemastery fills every default; fields are non-optional. */
type ResolvedConfig = Required<Config>

/** Register the http provider under `transport: http`. */
export function apply(ctx: Context, config: Config): void {
  // Endpoint resolution order: the runtime-editable settings channel wins, the
  // composed plugin `url` is the fallback (the seam's no-RPC endpoint path).
  // The expression under this comment used to say the opposite — see
  // `resolveEndpoint`, which is where the correction and its reasoning live.
  const url = resolveEndpoint(ctx.rheplicant.getEndpoints().http?.baseUrl, config.url)
  if (url === undefined) {
    throw new ComputeError(
      'rheplicant http endpoint is not configured — set `url` in the plugin config or `http.baseUrl` in the compute settings',
      'TRANSPORT',
    )
  }
  ctx.rheplicant.registerProvider(['http'], new HttpComputeProvider({ url, timeoutMs: config.timeoutMs ?? 300_000 } as ResolvedConfig))
}

interface RpcMessage<T> {
  readonly id?: unknown
  readonly result?: T
  readonly error?: { readonly code?: string; readonly message?: string }
}

/** One JSON-RPC request over HTTP POST. */
class HttpComputeProvider implements ComputeProvider {
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

  private async request<T>(method: string, params: unknown, opts: ComputeOpts): Promise<T> {
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, this.config.timeoutMs)
    const onCallerAbort = (): void => controller.abort()
    opts.signal?.addEventListener('abort', onCallerAbort, { once: true })
    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new ComputeError(`rheplicant compute HTTP ${response.status}`, 'TRANSPORT')
      }
      const message = await response.json() as RpcMessage<T>
      if (message.error !== undefined) {
        throw new ComputeError(message.error.message ?? 'rheplicant compute error', message.error.code ?? 'INTERNAL')
      }
      return message.result as T
    } catch (error) {
      if (error instanceof ComputeError) throw error
      if (timedOut) throw new ComputeError('rheplicant compute request timed out', 'TIMEOUT')
      if (opts.signal?.aborted) throw new ComputeError('rheplicant compute request aborted', 'ABORTED')
      throw new ComputeError(`rheplicant compute HTTP transport: ${(error as Error).message}`, 'TRANSPORT')
    } finally {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onCallerAbort)
    }
  }
}

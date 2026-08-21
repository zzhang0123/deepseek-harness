/**
 * Service Definition for the rheplicant compute capability seam (`ctx.rheplicant`).
 * Providers register under transport names; a request names a transport and the
 * service routes to the provider that owns it. Routing is by transport key, never
 * by registration order. Consumers — the tools and the UI — depend on this
 * service only, never on a provider.
 * @module @rheplicant/dsh-rheplicant
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type {
  ComputeDocument,
  ComputeOpts,
  ComputeProvider,
  GatesReport,
  RunOpts,
  RunOutcome,
  SchemaDocument,
  Transport,
  ValidationReport,
} from './types.ts'
import { ComputeError } from './types.ts'

export { ComputeError } from './types.ts'
export type {
  CheckCost,
  ComputeDocument,
  ComputeOpts,
  ComputeProvider,
  GatesReport,
  RunCost,
  RunDiagnostics,
  RunEntry,
  RunOpts,
  RunOutcome,
  RunProduct,
  SchemaDocument,
  Transport,
  ValidationError,
  ValidationReport,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    rheplicant: ComputeRuntime
  }
}

/** The compute access service, registered as `ctx.rheplicant` (one per context). */
export class ComputeRuntime extends Service {
  private providers = new Map<Transport, ComputeProvider>()

  constructor(ctx: Context) {
    super(ctx, 'rheplicant')
  }

  /**
   * Register one provider under one or more transport names. Throws
   * {@link ComputeError} `DUPLICATE_TRANSPORT` if any name is already owned.
   * Returns a disposer; disposed with the calling fiber.
   */
  registerProvider(transports: readonly Transport[], provider: ComputeProvider): () => void {
    for (const transport of transports) {
      if (this.providers.has(transport)) {
        throw new ComputeError(
          `a rheplicant compute provider for transport "${transport}" is already registered`,
          'DUPLICATE_TRANSPORT',
        )
      }
    }
    const providers = this.providers
    const dispose = this.ctx.effect(function* () {
      for (const transport of transports) providers.set(transport, provider)
      yield () => {
        for (const transport of transports) providers.delete(transport)
      }
    }, 'rheplicant.registerProvider()')
    return () => void dispose()
  }

  /** The transport names with a registered provider. */
  listTransports(): Transport[] {
    return [...this.providers.keys()]
  }

  validate(document: ComputeDocument, opts: ComputeOpts): Promise<ValidationReport> {
    return this.provider(opts.transport).validate(document, opts)
  }

  gates(document: ComputeDocument, opts: ComputeOpts): Promise<GatesReport> {
    return this.provider(opts.transport).gates(document, opts)
  }

  run(document: ComputeDocument, opts: RunOpts): Promise<RunOutcome> {
    return this.provider(opts.transport).run(document, opts)
  }

  schema(opts: ComputeOpts): Promise<SchemaDocument> {
    return this.provider(opts.transport).schema(opts)
  }

  private provider(transport: Transport): ComputeProvider {
    const provider = this.providers.get(transport)
    if (provider === undefined) {
      throw new ComputeError(
        `no rheplicant compute provider is registered for transport "${transport}"`,
        'TRANSPORT_UNAVAILABLE',
      )
    }
    return provider
  }
}

export default ComputeRuntime

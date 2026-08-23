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
import z from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {
  ComputeDocument,
  ComputeEndpoints,
  ComputeInput,
  ComputeOpts,
  ComputeProvider,
  GatesReport,
  RunOpts,
  RunOutcome,
  SchemaDocument,
  SignalPathGraph,
  DefinitionReport,
  Transport,
  ValidationReport,
} from './types.ts'
import { ComputeError } from './types.ts'

export { ComputeError } from './types.ts'
// Value exports: the transport validator and its name list, so every caller
// that takes a transport from outside validates against ONE list.
export { TRANSPORTS, asTransport, isTransport } from './types.ts'
export type {
  CheckCost,
  ComputeDocument,
  ComputeEndpoints,
  ComputeInput,
  ComputeOpts,
  ComputeProvider,
  DefinitionReport,
  DocumentInputReference,
  ExecutionIdentity,
  GatesReport,
  GateFinding,
  ProjectExecutionRow,
  ProjectDefinitionBody,
  ProjectExecutionsBody,
  ProjectInputReference,
  ProjectInputRow,
  ProjectOverviewBody,
  ProjectTaskDocumentBody,
  ProjectTaskRow,
  RunCost,
  RunDiagnostics,
  RunEntry,
  RheplicantGatesEventData,
  RheplicantRunEventData,
  RheplicantValidateEventData,
  RunOpts,
  RunOutcome,
  RunProduct,
  SchemaDocument,
  SignalPathGraph,
  TaskIdentity,
  Transport,
  ValidationError,
  ValidationReport,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    rheplicant: ComputeRuntime
  }
}

/**
 * Endpoint configuration for the network transports, editable at runtime through
 * the `ui-compute` settings card (the seam's settings channel — no client→host
 * RPC). Providers read it through {@link ComputeRuntime.getEndpoints}.
 */
const EndpointsSchema: z<ComputeEndpoints> = z.object({
  ssh: z.object({
    host: z.string(),
    command: z.string(),
  }),
  http: z.object({
    baseUrl: z.string(),
  }),
})

/** The compute access service, registered as `ctx.rheplicant` (one per context). */
export class ComputeRuntime extends Service {
  private providers = new Map<Transport, ComputeProvider>()
  private endpointsSource: () => ComputeEndpoints = () => ({})

  constructor(ctx: Context) {
    super(ctx, 'rheplicant')
    // The endpoint settings channel: the SD owns the endpoint vocabulary, the
    // browser reads/writes it through the harness's settings surface.
    installSettingsSection(ctx, settingsNamespace('rheplicant-endpoints'), EndpointsSchema, {}, {
      setSource: (current) => { this.endpointsSource = current },
      onChange: () => {},
    })
  }

  /** The resolved endpoint configuration (empty when no settings service is mounted). */
  getEndpoints(): ComputeEndpoints {
    return this.endpointsSource()
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

  /**
   * Validate one document. `input` carries EXACTLY ONE of `document` (an
   * inline mapping) or `documentText` (a task file's exact bytes); the
   * compute service owns that rule and refuses `INVALID_DOCUMENT` otherwise,
   * so the seam forwards without restating it.
   */
  validate(input: ComputeInput, opts: ComputeOpts): Promise<ValidationReport> {
    return this.provider(opts.transport).validate(input, opts)
  }

  /** {@inheritDoc ComputeRuntime.validate} */
  gates(input: ComputeInput, opts: ComputeOpts): Promise<GatesReport> {
    return this.provider(opts.transport).gates(input, opts)
  }

  /** {@inheritDoc ComputeRuntime.validate} */
  run(input: ComputeInput, opts: RunOpts): Promise<RunOutcome> {
    return this.provider(opts.transport).run(input, opts)
  }

  /** Project one published execution tree; see {@link ComputeProvider.readExecution}. */
  readExecution(resultsPath: string, opts: RunOpts): Promise<RunOutcome> {
    return this.provider(opts.transport).readExecution(resultsPath, opts)
  }

  /** How far one document is from a defined task; see {@link ComputeProvider.definition}. */
  definition(input: ComputeInput, opts: ComputeOpts): Promise<DefinitionReport> {
    return this.provider(opts.transport).definition(input, opts)
  }

  schema(opts: ComputeOpts): Promise<SchemaDocument> {
    return this.provider(opts.transport).schema(opts)
  }

  graph(document: ComputeDocument, opts: ComputeOpts): Promise<SignalPathGraph | null> {
    return this.provider(opts.transport).graph(document, opts)
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

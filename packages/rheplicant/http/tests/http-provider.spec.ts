/**
 * The http provider: which endpoint it takes, and what it turns a failure into.
 *
 * **This package was `kind: 'skip'` until 2026-08-28**, on the recorded
 * reasoning that its logic was "locked inside private classes reachable only
 * through `apply()`, so testing them is a design change". The reasoning was
 * wrong in a way worth naming, because it is a general one: reaching a private
 * class THROUGH the seam it registers into is exactly what a test of a plugin
 * does. `apply` is where the precedence lives, and the five error mappings are
 * reachable by pointing the provider at a local server and calling
 * `ctx.rheplicant`.
 *
 * The first thing these assertions found was the comment in `apply` and the
 * expression beneath it disagreeing about which endpoint wins.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'

import { Context } from '@deepseek-ai/cordis'
import { ComputeError, ComputeRuntime } from '@rheplicant/dsh-rheplicant'
import type { ComputeEndpoints } from '@rheplicant/dsh-rheplicant'
import * as http from '@rheplicant/dsh-rheplicant-http'

/** What the fake service does with the one request a test sends it. */
type Reply = (respond: (status: number, body: string) => void) => void

const servers: Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve) => {
    server.close(() => { resolve() })
  })))
})

/** A one-request JSON-RPC service on a loopback port. */
async function serve(reply: Reply): Promise<string> {
  const server = createServer((_request, response) => {
    reply((status, body) => {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(body)
    })
  })
  servers.push(server)
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', () => { resolve() }) })
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

/**
 * A seam whose settings channel holds exactly what a test says it does.
 *
 * `ComputeRuntime` reads endpoints through a source installed by the settings
 * section; a test supplies one directly rather than mounting the whole
 * settings stack, which is not what is under test here.
 */
function seam(endpoints: ComputeEndpoints = {}): Context {
  const ctx = new Context()
  const runtime = new ComputeRuntime(ctx)
  Reflect.set(runtime, 'endpointsSource', () => endpoints)
  return ctx
}

/** The url the mounted provider actually resolved, read back through the seam. */
function resolved(ctx: Context): string {
  const providers = Reflect.get(ctx.rheplicant, 'providers') as Map<string, unknown>
  const config = Reflect.get(providers.get('http') as object, 'config') as { url: string }
  return config.url
}

describe('the endpoint it takes', () => {
  it('prefers the settings channel over the composed url', async () => {
    const ctx = seam({ http: { baseUrl: 'http://settings.example' } })
    await ctx.plugin(http, { url: 'http://composed.example' })
    // Asserting the RESOLVED url, not merely that something mounted. The first
    // version of this test checked `listTransports()` and passed while the
    // provider was still taking the composed url — the precedence bug it was
    // written to pin walked straight through it.
    expect(resolved(ctx)).toBe('http://settings.example')
  })

  it('refuses to mount with no endpoint from either side', async () => {
    const ctx = seam()
    await expect(ctx.plugin(http, {})).rejects.toThrow(/endpoint is not configured/)
  })

  it('falls back to the composed url when settings holds none', async () => {
    const ctx = seam()
    await ctx.plugin(http, { url: 'http://composed.example' })
    expect(resolved(ctx)).toBe('http://composed.example')
  })

  it('treats a cleared settings url as unset rather than as an override', async () => {
    const ctx = seam({ http: { baseUrl: '   ' } })
    await ctx.plugin(http, { url: 'http://composed.example' })
    expect(resolved(ctx)).toBe('http://composed.example')
  })
})

describe('what it turns a failure into', () => {
  /** Mount the provider against a server and ask it one question. */
  async function ask(reply: Reply, opts: { timeoutMs?: number } = {}): Promise<unknown> {
    const url = await serve(reply)
    const ctx = seam()
    await ctx.plugin(http, { url, ...opts })
    return ctx.rheplicant.schema({ transport: 'http' })
  }

  it('returns the result of a well-formed reply', async () => {
    const schema = await ask(respond => {
      respond(200, JSON.stringify({ jsonrpc: '2.0', id: 1, result: { schemaVersion: '1' } }))
    })
    expect(schema).toMatchObject({ schemaVersion: '1' })
  })

  it('maps a non-2xx response to TRANSPORT, naming the status', async () => {
    const error = await ask(respond => { respond(503, '{}') }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ComputeError)
    expect((error as ComputeError).code).toBe('TRANSPORT')
    expect((error as Error).message).toContain('503')
  })

  it('passes a JSON-RPC error through with the service’s own code', async () => {
    // The service owns its refusals — INVALID_DOCUMENT is not a transport
    // problem, and flattening it to one would lose which layer objected.
    const error = await ask(respond => {
      respond(200, JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        error: { code: 'INVALID_DOCUMENT', message: 'exactly one of document/documentText' },
      }))
    }).catch((e: unknown) => e)
    expect((error as ComputeError).code).toBe('INVALID_DOCUMENT')
    expect((error as Error).message).toContain('exactly one of')
  })

  it('defaults a code-less JSON-RPC error to INTERNAL', async () => {
    const error = await ask(respond => {
      respond(200, JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message: 'boom' } }))
    }).catch((e: unknown) => e)
    expect((error as ComputeError).code).toBe('INTERNAL')
  })

  it('maps its own deadline to TIMEOUT, not to a bare abort', async () => {
    // The provider aborts its own request on the timer, so the distinction
    // between "I gave up" and "the caller cancelled" is one it has to keep.
    const error = await ask(() => { /* never responds */ }, { timeoutMs: 60 })
      .catch((e: unknown) => e)
    expect((error as ComputeError).code).toBe('TIMEOUT')
  })

  it('maps an unreachable endpoint to TRANSPORT', async () => {
    const ctx = seam()
    // Port 1 on loopback: nothing listens, and connect fails immediately.
    await ctx.plugin(http, { url: 'http://127.0.0.1:1', timeoutMs: 5_000 })
    const error = await ctx.rheplicant.schema({ transport: 'http' }).catch((e: unknown) => e)
    expect((error as ComputeError).code).toBe('TRANSPORT')
  })
})

/**
 * The ssh provider's mount-time decisions.
 *
 * What is testable here without a remote machine is exactly the part with
 * branches: which host and which interpreter the provider ends up with, and
 * what happens when neither side names a host. Everything past that is
 * `stdioRequest` against a real `ssh`, which the `local` provider already
 * exercises over the same transport — the two differ in the argv they build,
 * not in the protocol.
 *
 * The package was `kind: 'skip'` until 2026-08-28; see the http provider's
 * spec for why that classification was wrong.
 */
import { describe, expect, it } from 'vitest'

import { Context } from '@deepseek-ai/cordis'
import { ComputeRuntime } from '@rheplicant/dsh-rheplicant'
import type { ComputeEndpoints } from '@rheplicant/dsh-rheplicant'
import * as ssh from '@rheplicant/dsh-rheplicant-ssh'

/** A seam whose settings channel holds exactly what a test says it does. */
function seam(endpoints: ComputeEndpoints = {}): Context {
  const ctx = new Context()
  const runtime = new ComputeRuntime(ctx)
  Reflect.set(runtime, 'endpointsSource', () => endpoints)
  return ctx
}

/** The provider the seam ended up holding for `ssh`, as an opaque object. */
function provider(ctx: Context): Record<string, unknown> {
  const providers = Reflect.get(ctx.rheplicant, 'providers') as Map<string, unknown>
  return Reflect.get(providers.get('ssh') as object, 'config') as Record<string, unknown>
}

describe('the host it takes', () => {
  it('prefers the settings channel over the composed host', async () => {
    const ctx = seam({ ssh: { host: 'settings-host', command: 'settings-python' } })
    await ctx.plugin(ssh, { host: 'composed-host', command: 'composed-python' })
    expect(provider(ctx)).toMatchObject({ host: 'settings-host', command: 'settings-python' })
  })

  it('falls back to the composed host when settings holds none', async () => {
    const ctx = seam()
    await ctx.plugin(ssh, { host: 'composed-host' })
    expect(provider(ctx)).toMatchObject({ host: 'composed-host' })
  })

  it('refuses to mount when neither side names a host', async () => {
    // Loud at mount, not at the first run. A cluster preset with no cluster
    // configured is not a working deployment, and saying so on boot is the
    // only place anyone is looking.
    const ctx = seam()
    await expect(ctx.plugin(ssh, {})).rejects.toThrow(/host is not configured/)
  })

  it('treats a cleared settings host as unset rather than as an override', async () => {
    const ctx = seam({ ssh: { host: '  ', command: 'x' } })
    await ctx.plugin(ssh, { host: 'composed-host' })
    expect(provider(ctx)).toMatchObject({ host: 'composed-host' })
  })
})

describe('the command it runs', () => {
  it('defaults the interpreter to python when nobody names one', async () => {
    const ctx = seam()
    await ctx.plugin(ssh, { host: 'composed-host' })
    expect(provider(ctx)).toMatchObject({ command: 'python' })
  })

  it('keeps the module entry point as the remote argv', async () => {
    // The remote runs the same service the local provider spawns; the
    // transports differ in argv, not in protocol.
    const ctx = seam()
    await ctx.plugin(ssh, { host: 'composed-host' })
    expect(provider(ctx).args).toEqual(['-m', 'rheplicant_compute.server'])
  })

  it('registers under exactly the ssh transport', async () => {
    const ctx = seam()
    await ctx.plugin(ssh, { host: 'composed-host' })
    expect(ctx.rheplicant.listTransports()).toEqual(['ssh'])
  })
})

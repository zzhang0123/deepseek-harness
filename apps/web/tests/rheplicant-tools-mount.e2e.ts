// Web e2e scenario: the rheplicant host tools mount on the booted web
// composition. No browser, no model call, no Python spawn (mounting registers
// the provider lazily) — this pins the host seam and the `rheplicant_run` tool
// registering alongside the shipped web surface, the same way the independent
// harness probe does.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-tools'
import { ComputeRuntime } from '@rheplicant/dsh-rheplicant'
import * as rheplicantLocal from '@rheplicant/dsh-rheplicant-local'
import * as toolRun from '@rheplicant/dsh-rheplicant-tool-run'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'

describe('web e2e: rheplicant host tools mount on the web profile', () => {
  let scaffold: WebScaffold

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
  }, 120_000)

  afterAll(async () => {
    await scaffold?.close()
  })

  it('registers the compute seam and the run tool alongside the web surface', async () => {
    new ComputeRuntime(scaffold.ctx)
    await scaffold.ctx.plugin(rheplicantLocal, {})
    await scaffold.ctx.plugin(toolRun, { defaultTransport: 'local' })

    const rheplicant = scaffold.ctx.get('rheplicant')
    if (rheplicant === undefined) throw new Error('rheplicant service did not register')
    expect(rheplicant.listTransports()).toEqual(['local'])
    expect(scaffold.ctx.tools.get('rheplicant_run')).toBeDefined()

    // Endpoint settings round-trip: the seam exposes its endpoint vocabulary
    // through the harness settings channel (no client→host RPC).
    expect(rheplicant.getEndpoints().http?.baseUrl).toBeUndefined()
    await scaffold.ctx.settings.mutate(settingsNamespace('rheplicant-endpoints'), [
      { op: 'set', path: ['http', 'baseUrl'], value: 'http://cluster:8080' },
    ])
    expect(rheplicant.getEndpoints().http?.baseUrl).toBe('http://cluster:8080')
  })
})

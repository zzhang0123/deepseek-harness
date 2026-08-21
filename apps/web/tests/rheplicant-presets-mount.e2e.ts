// Web e2e: the rheplicant analysis/developer agent presets mount-validate
// against the booted web composition (no browser, no model call).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type {} from '@deepseek-ai/dsh-agent-presets'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'

const PRESET_ROOT = '/Users/zzhang/projects/rheplicant-agent/agent-presets'

describe('web e2e: rheplicant agent presets mount', () => {
  let scaffold: WebScaffold

  beforeAll(async () => {
    scaffold = await launchWebScaffold({
      agentPresets: {
        roots: [{ path: PRESET_ROOT, trust: 'user' }],
        default: 'analysis',
      },
    })
  }, 120_000)

  afterAll(async () => {
    await scaffold?.close()
  })

  it('mount-validates the analysis preset', async () => {
    await expect(scaffold.ctx.agentPresets.standingKeyFor('analysis')).resolves.toBeDefined()
  })

  it('mount-validates the developer preset', async () => {
    await expect(scaffold.ctx.agentPresets.standingKeyFor('developer')).resolves.toBeDefined()
  })
})

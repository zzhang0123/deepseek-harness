/**
 * Which endpoint wins.
 *
 * The rule this pins is a CORRECTION, not a restatement: both providers used
 * to prefer the composed plugin value over the settings channel, while the
 * comment above one of them said the opposite. Config-first makes the
 * `ui-compute` settings card inert wherever a composition sets an endpoint —
 * the operator edits the field and nothing happens — so the code moved to meet
 * the comment. Without these assertions the next person to read
 * `settings ?? config` has no way to know which way round it is meant to be.
 */
import { describe, expect, it } from 'vitest'

import { resolveEndpoint } from '@rheplicant/dsh-rheplicant-transport'

describe('resolveEndpoint', () => {
  it('prefers the settings channel over the composition', () => {
    expect(resolveEndpoint('from-settings', 'from-config')).toBe('from-settings')
  })

  it('falls back to the composition when settings holds nothing', () => {
    expect(resolveEndpoint(undefined, 'from-config')).toBe('from-config')
  })

  it('treats a cleared settings field as unset, not as an override', () => {
    // Otherwise emptying the box in the UI reads as "clearing it broke the
    // deployment's own default", which is the opposite of what clearing means.
    expect(resolveEndpoint('', 'from-config')).toBe('from-config')
    expect(resolveEndpoint('   ', 'from-config')).toBe('from-config')
  })

  it('trims, so a pasted value with a stray newline still resolves', () => {
    expect(resolveEndpoint(' https://compute.example \n', undefined)).toBe('https://compute.example')
  })

  it('answers undefined when neither side supplies one', () => {
    expect(resolveEndpoint(undefined, undefined)).toBeUndefined()
    expect(resolveEndpoint('', '')).toBeUndefined()
  })
})

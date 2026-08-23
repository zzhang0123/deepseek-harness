/**
 * `groupChains` is the choke point where "null is not an empty object" has to
 * be true.
 *
 * `RunEntry.chains` is an optional wire field, and events recorded before the
 * service stopped emitting explicit nulls carry `"chains": null` — measured in
 * real session logs on a developer machine (two of them, plus four
 * `"spectrum": null`). `Object.entries` throws on null, and a throw inside a
 * `conversation.chat.node` renderer takes the WHOLE slot down, so every panel
 * folding chains was one historical event away from a blank transcript.
 *
 * A previous session patched this into `harness/node_modules` and its own note
 * predicted what happened next: the next repack overwrote it. This is the
 * source-level version, at the one place every consumer already goes through.
 */
import { describe, expect, it } from 'vitest'
import { groupChains } from '../src/client/chart/chains.ts'

describe('a nullish chain bag', () => {
  it('groups to nothing rather than throwing, for null', () => {
    expect(groupChains(null)).toEqual([])
  })

  it('groups to nothing rather than throwing, for undefined', () => {
    expect(groupChains(undefined)).toEqual([])
  })

  it('is not confused with an EMPTY bag, which is also nothing but arrives honestly', () => {
    expect(groupChains({})).toEqual([])
  })
})

describe('a real chain bag still groups', () => {
  it('keeps the fanned/band grammar working after the guard', () => {
    const groups = groupChains({
      g: [1, 2, 3],
      'beam[0]': [1, 2, 3],
      'beam[1]': [4, 5, 6],
      'wide.mean': [1, 2, 3],
      'wide.q05': [0, 1, 2],
      'wide.q95': [2, 3, 4],
    })
    expect(groups.map(group => group.latent).sort()).toEqual(['beam', 'g', 'wide'])
    expect(groups.find(group => group.latent === 'wide')?.kind).toBe('band')
    expect(groups.find(group => group.latent === 'beam')?.kind).toBe('series')
  })
})

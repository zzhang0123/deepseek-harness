/**
 * Setting a dash is not rewriting a sentence — and the line between them is a
 * space.
 */
import { describe, expect, it } from 'vitest'
import { emDashes } from '../src/client/typeset.ts'

describe('the ASCII double hyphen', () => {
  it('is set as an em dash between spaces, which is where it is one', () => {
    expect(emDashes('is not read by this layer -- it is handled by the command line'))
      .toBe('is not read by this layer — it is handled by the command line')
  })

  it('sets every one in a sentence, not only the first', () => {
    // Upstream's `presets` reason carries two.
    expect(emDashes('a -- b -- c')).toBe('a — b — c')
  })

  it('leaves a command-line flag alone, in the panel whose subject is the command line', () => {
    // The whole reason the rule is the narrow one. These sentences are ABOUT
    // the command line, so `--check` and `--profile` are the likely neighbours
    // of the thing being set.
    expect(emDashes('run gen-schema.mjs --check to see the drift'))
      .toBe('run gen-schema.mjs --check to see the drift')
    expect(emDashes('--profile rheplicant')).toBe('--profile rheplicant')
    expect(emDashes('pass --check --profile x')).toBe('pass --check --profile x')
  })

  it('leaves the boundary cases that are not the convention', () => {
    // A hyphen pair with a space on only one side is neither a dash nor a
    // flag; guessing which would be the gloss this refuses to be.
    expect(emDashes('a --b')).toBe('a --b')
    expect(emDashes('a-- b')).toBe('a-- b')
    expect(emDashes('a--b')).toBe('a--b')
    expect(emDashes('a --- b')).toBe('a --- b')
  })

  it('changes no word, which is the whole of what it promises', () => {
    const before = 'is not read by this layer -- it is handled by the command line'
    const words = (text: string) => text.split(/\s+/).filter(word => !/^[—-]+$/.test(word))
    expect(words(emDashes(before))).toEqual(words(before))
  })

  it('passes through a sentence with nothing to set', () => {
    expect(emDashes('presets are YAML files.')).toBe('presets are YAML files.')
    expect(emDashes('')).toBe('')
  })
})

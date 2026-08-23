import { describe, expect, it } from 'vitest'
import { diffLines, MAX_DIFF_LINES } from '../src/client/document-diff.ts'

/** Kinds in order, as a compact string: `=` same, `-` removed, `+` added. */
function shape(ran: string, authored: string): string {
  const result = diffLines(ran, authored)
  if (result === 'too-large') throw new Error('unexpectedly too large')
  return result.map(line => ({ same: '=', removed: '-', added: '+' })[line.kind]).join('')
}

describe('an unchanged document', () => {
  it('is all context, and says nothing changed', () => {
    const text = 'a: 1\nb: 2\n'
    expect(shape(text, text)).toBe('==')
  })

  it('is unchanged even when only the trailing newline differs', () => {
    // A file the editor saved without a final newline is not a changed
    // document, and reporting it as one teaches people to ignore the flag.
    expect(shape('a: 1\nb: 2\n', 'a: 1\nb: 2')).toBe('==')
  })
})

describe('what changed', () => {
  it('marks an added line', () => {
    expect(shape('a: 1\n', 'a: 1\nb: 2\n')).toBe('=+')
  })

  it('marks a removed line', () => {
    expect(shape('a: 1\nb: 2\n', 'a: 1\n')).toBe('=-')
  })

  it('shows a replacement as a removal then an addition', () => {
    // Two lines, not one "changed" line: a YAML edit that rewrites a value
    // is legible only if you can read both the old and the new text.
    expect(shape('a: 1\n', 'a: 2\n')).toBe('-+')
  })

  it('keeps unrelated lines as context around a change', () => {
    expect(shape('a: 1\nb: 2\nc: 3\n', 'a: 1\nb: 9\nc: 3\n')).toBe('=-+=')
  })

  it('carries the line text so a reader can see what it was', () => {
    const result = diffLines('a: 1\n', 'a: 2\n')
    if (result === 'too-large') throw new Error('unexpectedly too large')
    expect(result.map(line => line.text)).toEqual(['a: 1', 'a: 2'])
  })
})

describe('line numbers', () => {
  it('numbers each side independently, and only where that side has a line', () => {
    // A removed line has a number in the EXECUTED document and none in the
    // authored one. Sharing one counter would make the gutter lie about
    // where to look in the file you are about to edit.
    const result = diffLines('a: 1\nb: 2\n', 'a: 1\nc: 3\n')
    if (result === 'too-large') throw new Error('unexpectedly too large')
    expect(result.map(l => [l.kind, l.ranAt, l.authoredAt])).toEqual([
      ['same', 1, 1],
      ['removed', 2, undefined],
      ['added', undefined, 2],
    ])
  })
})

describe('a document too large to diff', () => {
  it('says so rather than hanging', () => {
    // The comparison is O(n*m). A bound that is announced is a bound; one
    // that is not is a surface that freezes on somebody's generated config.
    const huge = Array.from({ length: MAX_DIFF_LINES + 1 }, (_, i) => `k${i}: ${i}`).join('\n')
    expect(diffLines(huge, `${huge}\nextra: 1`)).toBe('too-large')
  })

  it('still diffs a document exactly at the bound', () => {
    const atBound = Array.from({ length: MAX_DIFF_LINES }, (_, i) => `k${i}: ${i}`).join('\n')
    expect(diffLines(atBound, atBound)).not.toBe('too-large')
  })
})

describe('an empty side', () => {
  it('treats an empty executed document as every line added', () => {
    expect(shape('', 'a: 1\nb: 2\n')).toBe('++')
  })

  it('treats an empty authored document as every line removed', () => {
    expect(shape('a: 1\nb: 2\n', '')).toBe('--')
  })
})

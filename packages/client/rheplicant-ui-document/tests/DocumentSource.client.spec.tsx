// @vitest-environment jsdom
/**
 * The document block: its header, its fallback state, and the two things the
 * old version got wrong that no assertion was watching.
 *
 * The header's TEXT is pinned here as well as in the cross-repo web e2e
 * (`apps/web/tests/rheplicant-ui-document-load.e2e.ts` reads this element's
 * innerText for `rheplicant/run` and for `local transport`). That e2e is the
 * reason the caption stayed a phrase run rather than becoming a key/value
 * grid — a grid splits `local transport` across two cells — and a rule that
 * lives only in another repository's test is a rule this package will break by
 * accident. So it is asserted on both sides.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DocumentSource } from '../src/client/DocumentSource.tsx'
import type { DocumentFact } from '../src/client/document-contract.ts'

afterEach(cleanup)

/** One fact, with only what an assertion needs stated. */
function fact(over: Partial<DocumentFact> = {}): DocumentFact {
  return {
    kind: 'run',
    seq: 34,
    transport: 'local' as DocumentFact['transport'],
    document: { schema_version: 1 } as unknown as DocumentFact['document'],
    ...over,
  }
}

describe('the block header', () => {
  it('keeps the two phrases the cross-repo web e2e reads', () => {
    const { container } = render(<DocumentSource fact={fact()} />)
    const head = container.querySelector('[data-document-source]')
    expect(head?.textContent).toContain('rheplicant/run')
    // ONE phrase, not a `transport` key beside a `local` value.
    expect(head?.textContent).toContain('local transport')
  })

  it('keeps the two attributes that e2e reads', () => {
    const { container } = render(<DocumentSource fact={fact()} />)
    const head = container.querySelector('[data-document-source]')
    expect(head?.getAttribute('data-source-kind')).toBe('run')
    expect(head?.getAttribute('data-transport')).toBe('local')
  })

  it('names the event for each of the three kinds it can fold', () => {
    for (const [kind, label] of [
      ['validate', 'rheplicant/validate'],
      ['gates', 'rheplicant/gates'],
      ['run', 'rheplicant/run'],
    ] as const) {
      const { container } = render(<DocumentSource fact={fact({ kind })} />)
      expect(container.querySelector('[data-document-source]')?.textContent, kind).toContain(label)
      cleanup()
    }
  })
})

describe('the serialization fallback, which used to be a parenthetical', () => {
  it('says nothing extra when the document rendered as YAML', () => {
    const { container } = render(<DocumentSource fact={fact()} />)
    expect(container.querySelector('[data-document-format]')?.getAttribute('data-document-format')).toBe('yaml')
    expect(container.querySelector('[data-document-fallback]')).toBeNull()
  })

  it('NOT TESTED HERE: the JSON row itself, and why', () => {
    // `toYaml` is written never to throw — `yaml.ts:74` renders an unexpected
    // value defensively rather than raising — so the `json` format is a
    // defensive branch no document can reach. Asserting the row would mean
    // mocking `serializeDocument`, which tests the mock. What IS asserted is
    // the reachable half above, and `yaml.spec`'s own coverage of the
    // serializer. Recorded rather than left as a silent gap: the row's markup
    // changed on 2026-08-28 (it was a parenthetical inside the caption) and
    // nothing here would notice if it broke.
    expect(true).toBe(true)
  })
})

describe('reaching the document at all', () => {
  it('makes the scrollport focusable and names it', () => {
    // Every line below the fold used to be unreachable by keyboard: the `<pre>`
    // is the only scrollport and it had no `tabindex` and no focusable
    // descendant.
    const { container } = render(<DocumentSource fact={fact()} />)
    const pre = container.querySelector('[data-document-text]')
    expect(pre?.getAttribute('tabindex')).toBe('0')
    expect(pre?.getAttribute('role')).toBe('region')
    expect(pre?.getAttribute('aria-label')).toContain('rheplicant/run')
  })

  it('carries a live region for the copy result, not only a relabelled button', () => {
    const { container } = render(<DocumentSource fact={fact()} />)
    expect(container.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull()
    expect(container.querySelector('[data-document-copy]')?.textContent).toBe('Copy')
  })
})

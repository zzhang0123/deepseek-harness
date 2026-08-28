// @vitest-environment jsdom
/**
 * The sections list renders every section's `status`, on every row.
 *
 * **Why every row and not only the interesting ones.** `status` is a
 * THREE-valued fact — upstream's `_status()` answers `reserved`, `deferred`
 * or `accepted` — and this repo's standing rule is that a three-valued fact
 * never gets a two-valued rendering (`unknown` is not `unmet`; a stale flag
 * has three values because "could not compare" must not read as "changed").
 * Marking only the exceptional ones would make a blank row mean `accepted`
 * by inference, which is the reading the rule exists to prevent. The `*` for
 * `required` beside it is a different case: a boolean genuinely has a blank
 * half.
 *
 * `accepted` is de-emphasised in CSS, by attribute, rather than skipped in
 * the component — so an unrecognised future status renders PROMINENTLY
 * instead of vanishing, which is the safe direction for a word nobody has
 * taught this file about yet.
 *
 * The word itself is upstream's and is passed through unglossed. Note that
 * `deferred` reads as "not yet available" and means something else — see
 * `docs/upstream-reports.md` §4.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GrammarReference } from '../src/client/GrammarReference.tsx'
import { SCHEMA } from '../src/client/schema.ts'
import { emDashes } from '../src/client/typeset.ts'

afterEach(() => { cleanup() })

describe('GrammarReference sections', () => {
  it('renders one row per section, each carrying its own status', () => {
    const { container } = render(<GrammarReference />)
    const rows = [...container.querySelectorAll('[data-grammar-list="sections"] [data-section]')]
    expect(rows).toHaveLength(SCHEMA.sections.length)
    for (const section of SCHEMA.sections) {
      const row = container.querySelector(`[data-section="${section.name}"]`)
      expect(row, section.name).not.toBeNull()
      expect(row?.getAttribute('data-status'), section.name).toBe(section.status)
    }
  })

  it('shows the status as text, not only as an attribute', () => {
    const { container } = render(<GrammarReference />)
    for (const section of SCHEMA.sections) {
      const badge = container.querySelector(
        `[data-section="${section.name}"] [data-section-status]`,
      )
      expect(badge?.textContent, section.name).toBe(section.status)
    }
  })

  it('leaves no section without a status', () => {
    // Guards the guard: were the field to disappear from the generated
    // schema, the two tests above would pass vacuously on `undefined`.
    const { container } = render(<GrammarReference />)
    const badges = container.querySelectorAll('[data-section-status]')
    expect(badges).toHaveLength(SCHEMA.sections.length)
    for (const badge of badges) expect(badge.textContent).toBeTruthy()
  })

  describe('the reason a section is not accepted', () => {
    // `docs/upstream-reports.md` §4: the schema kept only the MEMBERSHIP, so
    // this panel could say `deferred` and could not say "handled by the
    // command line" — the half a reader needs. Upstream carries the sentence
    // now, and it is rendered word for word: `emDashes` sets the dashes and
    // changes nothing else, which is why the expectation runs the schema's own
    // string through it rather than hard-coding what it should come out as.
    it('shows it wherever the schema carries one', () => {
      const { container } = render(<GrammarReference />)
      const withReason = SCHEMA.sections.filter(section => section.reason !== null)
      expect(withReason.length, 'the schema carries no reasons at all').toBeGreaterThan(0)
      for (const section of withReason) {
        const line = container.querySelector(`[data-section="${section.name}"] [data-section-reason]`)
        expect(line?.textContent, section.name).toBe(emDashes(section.reason ?? ''))
      }
    })

    it('sets the ASCII double hyphens upstream writes, and leaves the words alone', () => {
      // The one thing a reader could mistake for a typo in a generated panel.
      const { container } = render(<GrammarReference />)
      const rendered = [...container.querySelectorAll('[data-section-reason]')]
        .map(line => line.textContent ?? '')
      expect(rendered.length).toBeGreaterThan(0)
      for (const line of rendered) expect(line, line).not.toContain(' -- ')
      // Word for word: strip the dash difference and the two must be equal.
      const schemaText = SCHEMA.sections
        .filter(section => section.reason !== null)
        .map(section => (section.reason ?? '').replaceAll(' -- ', ' \u2014 '))
      expect(rendered).toEqual(schemaText)
    })

    it('renders NOTHING where the schema carries null', () => {
      // An accepted section has no reason to give, and a blank line where a
      // sentence goes reads as a sentence that failed to load.
      const { container } = render(<GrammarReference />)
      const withoutReason = SCHEMA.sections.filter(section => section.reason === null)
      expect(withoutReason.length, 'every section has a reason').toBeGreaterThan(0)
      for (const section of withoutReason) {
        expect(
          container.querySelector(`[data-section="${section.name}"] [data-section-reason]`),
          section.name,
        ).toBeNull()
      }
    })

    it('renders exactly as many reasons as the schema carries', () => {
      // Guards the guard, like the status test above: were `reason` to vanish
      // from the generated schema, both tests above would pass vacuously.
      const { container } = render(<GrammarReference />)
      expect(container.querySelectorAll('[data-section-reason]'))
        .toHaveLength(SCHEMA.sections.filter(section => section.reason !== null).length)
    })
  })

  it('still marks the required sections', () => {
    const { container } = render(<GrammarReference />)
    for (const section of SCHEMA.sections) {
      const row = container.querySelector(`[data-section="${section.name}"]`)
      expect(row?.getAttribute('data-required'), section.name).toBe(String(section.required))
    }
  })
})

describe('sections are a table and vocabularies are chips — the split that was the bug', () => {
  // The two shared one class until 2026-08-28. `.vocabList li` set
  // `white-space: nowrap`, which is right for a one-word identifier and
  // catastrophic for a 130-character sentence — and `white-space` INHERITS, so
  // the four reason sentences were laid out on one unwrappable ~900px line
  // inside an 8rem box. jsdom does no layout, so the defect itself is not
  // assertable here; the STRUCTURAL decision that prevents it is.
  it('renders the sections as a real table, not a list', () => {
    const { container } = render(<GrammarReference />)
    const sections = container.querySelector('[data-grammar-list="sections"]')
    expect(sections?.tagName).toBe('TABLE')
    expect(container.querySelectorAll('[data-section]')).toHaveLength(SCHEMA.sections.length)
  })

  it('keeps the word vocabularies as lists, where nowrap is correct', () => {
    const { container } = render(<GrammarReference />)
    for (const id of ['exits', 'operators', 'transforms']) {
      expect(container.querySelector(`[data-grammar-list="${id}"]`)?.tagName, id).toBe('UL')
    }
  })

  it('keeps the reason OUT of any nowrap chip list', () => {
    const { container } = render(<GrammarReference />)
    for (const reason of container.querySelectorAll('[data-section-reason]')) {
      expect(reason.closest('ul')).toBeNull()
    }
  })

  it('gives the reason its subject back, beside the sentence and not inside it', () => {
    // Upstream's wording is a subject-less fragment — "is not read by this
    // layer…" — and the spec above pins `[data-section-reason]`'s textContent
    // to the sentence and nothing else, so the name has to be a sibling.
    const { container } = render(<GrammarReference />)
    const withReason = SCHEMA.sections.filter(section => section.reason !== null)
    for (const section of withReason) {
      const cell = container.querySelector(`[data-section="${section.name}"] [data-section-reason]`)?.parentElement
      expect(cell?.textContent, section.name)
        .toContain(`${section.name} ${emDashes(section.reason ?? '')}`)
    }
  })
})

describe('what the panel says about itself', () => {
  it('names its own landmark, so it is not an unlabelled region', () => {
    const { container } = render(<GrammarReference />)
    const section = container.querySelector('[data-document-grammar]')
    const heading = section?.querySelector(`#${section.getAttribute('aria-labelledby')}`)
    expect(heading?.textContent).toBe('Grammar reference')
  })

  it('says it describes the GRAMMAR and not this session\'s document', () => {
    // The panel sits directly under the session's own document, and eight
    // vocabularies with no lede read as facts about that document.
    const { container } = render(<GrammarReference />)
    expect(container.textContent).toContain('It describes the grammar, not this session')
  })

  it('renders each group count as its own element rather than inside the title', () => {
    const { container } = render(<GrammarReference />)
    const headings = [...container.querySelectorAll('h3')].map(h => h.textContent ?? '')
    expect(headings.some(text => /^Exits\d+$/.test(text.replace(/\s+/g, '')))).toBe(true)
  })
})

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

  it('still marks the required sections', () => {
    const { container } = render(<GrammarReference />)
    for (const section of SCHEMA.sections) {
      const row = container.querySelector(`[data-section="${section.name}"]`)
      expect(row?.getAttribute('data-required'), section.name).toBe(String(section.required))
    }
  })
})

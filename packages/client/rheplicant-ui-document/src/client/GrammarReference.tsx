/**
 * The config-document grammar, read straight off the generated schema
 * (`schema.ts`, regenerated from `rheplicant.config.schema.json_schema()` by
 * `scripts/gen-schema.mjs`): every top-level section (required ones marked,
 * and each carrying its status), the exit kinds, and the operator/transform/
 * catalog vocabularies.
 *
 * **Sections are a TABLE; the vocabularies are chips.** They shared one class
 * until 2026-08-28 and the sharing was the panel's worst defect. `.vocabList li`
 * set `white-space: nowrap` — correct for a one-word identifier — and
 * `white-space` inherits, so the four 130-character explanation sentences were
 * laid out on a single unwrappable ~900px line inside a box capped at `8rem`
 * that scrolled on both axes. The half of `deferred` a reader actually needs
 * was physically unreachable. A section is a name/required/status/reason
 * quadruple, which is a table; an exit is a word, which is a chip.
 *
 * **Every section shows its `status`, including `accepted`.** It is a
 * three-valued fact (`reserved` / `deferred` / `accepted`), and a three-valued
 * fact rendered two ways makes a blank mean `accepted` by inference — the same
 * reading `unknown` is not `unmet` exists to prevent. The quieting of
 * `accepted` is done in CSS by attribute, never by a comparison here: a status
 * this file has not been taught about then renders prominently rather than
 * disappearing.
 *
 * The word is upstream's own and is passed through unglossed — inventing a
 * gloss would be a mapping the schema will not defend. `deferred` in particular
 * reads as "not yet available" and means "read by another layer".
 *
 * **The sentence that says WHICH layer is here now** (`docs/upstream-reports.md`
 * §4). It is upstream's wording, verbatim, for the same reason the status word
 * is — and the SUBJECT it is missing is restored typographically rather than by
 * rewording: the name sits beside the sentence, never inside
 * `[data-section-reason]`, whose textContent is the reason and nothing else.
 *
 * Verbatim is about the WORDING. The dashes are set (`typeset.ts`): upstream
 * writes `--` where an em dash belongs, which is ordinary in a source file and
 * reads as a typo on screen, and `schema.ts` is generated and keeps upstream's
 * bytes. No word changes, which is the line between setting a sentence and
 * rewriting one.
 *
 * `null` renders NOTHING rather than an empty line: an accepted section has no
 * reason to give, and a blank where a sentence goes reads as a sentence that
 * failed to load.
 *
 * @module @rheplicant/dsh-rheplicant-ui-document/client/GrammarReference
 */
import { memo } from 'react'
import { SCHEMA } from './schema.ts'
import { emDashes } from './typeset.ts'
import styles from './document.module.css'

interface VocabListProps {
  readonly id: string
  readonly label: string
  readonly items: readonly string[]
}

const VocabList = memo(function VocabList({ id, label, items }: VocabListProps) {
  return (
    <div className={styles.group} data-grammar-group={id}>
      {/* A real heading, and the count as a VALUE beside it rather than
          interpolated into the title at the same weight and colour. */}
      <h3 className={styles.h3}>
        {label}
        <span className={styles.count}>{items.length}</span>
      </h3>
      {/* No `max-height`. Forty-one chips wrap to about four lines; the 8rem
          cap that was here showed four ROWS of a list whose whole purpose is
          completeness, with nothing marking the clip. */}
      <ul className={styles.chips} data-grammar-list={id}>
        {items.map(item => <li key={item} data-grammar-item={item}>{item}</li>)}
      </ul>
    </div>
  )
})

export const GrammarReference = memo(function GrammarReference() {
  return (
    <section className={styles.grammar} data-document-grammar aria-labelledby="rheplicant-grammar-heading">
      {/* The `<h2>` lives INSIDE the section it names, so the landmark has an
          accessible name. It used to be rendered by `DocumentView` above it,
          leaving an unnamed region. */}
      <h2 className={styles.h2} id="rheplicant-grammar-heading">Grammar reference</h2>
      <p className={styles.lede}>
        What a rheplicant config document may contain, read off the schema this
        harness was built against. It describes the grammar, not this session&apos;s
        document.
      </p>

      <div className={styles.group} data-grammar-group="sections">
        <h3 className={styles.h3}>
          Sections
          <span className={styles.count}>{SCHEMA.sections.length}</span>
        </h3>
        <div className={styles.block}>
          <div className={styles.tableWrap}>
            <table className={styles.table} data-grammar-list="sections">
              <thead>
                <tr>
                  <th scope="col">Section</th>
                  <th scope="col">Required</th>
                  <th scope="col">Status</th>
                  <th scope="col">Where it is read</th>
                </tr>
              </thead>
              <tbody>
                {SCHEMA.sections.map(section => (
                  <tr
                    key={section.name}
                    data-section={section.name}
                    data-required={section.required}
                    data-status={section.status}
                  >
                    <td className={styles.sectionName}>{section.name}</td>
                    <td>
                      {section.required && <span className={styles.required}>required</span>}
                    </td>
                    <td>
                      <span className={styles.status} data-section-status={section.status}>
                        {section.status}
                      </span>
                    </td>
                    <td>
                      {section.reason !== null && (
                        <>
                          {/* The subject upstream's fragment omits. OUTSIDE
                              `[data-section-reason]` — the spec asserts that
                              element's textContent is the reason exactly. */}
                          <span className={styles.reasonSubject}>{section.name}</span>
                          {' '}
                          <span className={styles.sectionReason} data-section-reason="">
                            {emDashes(section.reason)}
                          </span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <VocabList id="exits" label="Exits" items={SCHEMA.exits} />
      <VocabList id="operators" label="Operators" items={SCHEMA.operators} />
      <VocabList id="transforms" label="Transforms" items={SCHEMA.transforms} />
      <VocabList id="catalog-units" label="Accepted units" items={SCHEMA.catalogs.acceptedUnits} />
      <VocabList id="catalog-resource-kinds" label="Resource kinds" items={SCHEMA.catalogs.resourceKinds} />
      <VocabList id="catalog-file-formats" label="File formats" items={SCHEMA.catalogs.fileFormats} />
      <VocabList id="catalog-shape-symbols" label="Shape symbols" items={SCHEMA.catalogs.shapeSymbols} />
    </section>
  )
})

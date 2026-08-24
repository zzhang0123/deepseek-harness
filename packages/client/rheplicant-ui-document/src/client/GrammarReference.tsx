/**
 * The config-document grammar, read straight off the generated schema
 * (`schema.ts`, regenerated from `rheplicant.config.schema.json_schema()` by
 * `scripts/gen-schema.mjs`): every top-level section (required ones
 * marked, and each carrying its status), the exit kinds, and the
 * operator/transform/catalog vocabularies.
 * A reference, so density is fine — grouped under headings with counts,
 * long lists scrollable rather than a wall of text.
 *
 * **Every section shows its `status`, including `accepted`.** It is a
 * three-valued fact (`reserved` / `deferred` / `accepted`), and a
 * three-valued fact rendered two ways makes a blank mean `accepted` by
 * inference — the same reading `unknown` is not `unmet` exists to prevent.
 * `required` beside it is a boolean and genuinely has a blank half, which is
 * why the `*` may stay a mark. The quieting of `accepted` is done in CSS by
 * attribute, never by a comparison here: a status this file has not been
 * taught about then renders prominently rather than disappearing.
 *
 * The word is upstream's own and is passed through unglossed — inventing a
 * gloss would be a mapping the schema will not defend. `deferred` in
 * particular reads as "not yet available" and means "read by another layer";
 * the reason string that would say which layer is dropped on the way here.
 * `docs/upstream-reports.md` §4.
 * @module @rheplicant/dsh-rheplicant-ui-document/client/GrammarReference
 */
import { memo } from 'react'
import { SCHEMA } from './schema.ts'
import styles from './document.module.css'

interface VocabListProps {
  readonly id: string
  readonly label: string
  readonly items: readonly string[]
}

const VocabList = memo(function VocabList({ id, label, items }: VocabListProps) {
  return (
    <div className={styles.group} data-grammar-group={id}>
      <div className={styles.groupHeading}>{label} ({items.length})</div>
      <ul className={styles.vocabList} data-grammar-list={id}>
        {items.map(item => <li key={item} data-grammar-item={item}>{item}</li>)}
      </ul>
    </div>
  )
})

export const GrammarReference = memo(function GrammarReference() {
  return (
    <section className={styles.grammar} data-document-grammar>
      <div className={styles.group} data-grammar-group="sections">
        <div className={styles.groupHeading}>Sections ({SCHEMA.sections.length})</div>
        <ul className={styles.vocabList} data-grammar-list="sections">
          {SCHEMA.sections.map(section => (
            <li
              key={section.name}
              data-section={section.name}
              data-required={section.required}
              data-status={section.status}
            >
              {section.name}{section.required ? ' *' : ''}
              {' '}
              <span className={styles.sectionStatus} data-section-status={section.status}>
                {section.status}
              </span>
            </li>
          ))}
        </ul>
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

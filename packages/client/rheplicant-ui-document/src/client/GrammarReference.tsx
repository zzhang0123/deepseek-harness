/**
 * The config-document grammar, read straight off the generated schema
 * (`schema.ts`, regenerated from `rheplicant.config.schema.json_schema()` by
 * `scripts/gen-schema.mjs`): every top-level section (required ones
 * marked), the exit kinds, and the operator/transform/catalog vocabularies.
 * A reference, so density is fine — grouped under headings with counts,
 * long lists scrollable rather than a wall of text.
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
            <li key={section.name} data-section={section.name} data-required={section.required}>
              {section.name}{section.required ? ' *' : ''}
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

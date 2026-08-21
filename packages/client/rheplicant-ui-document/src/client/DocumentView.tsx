/** Config-document reference view: the grammar skeleton (sections, exits, operators, transforms). */
import { memo } from 'react'
import { SCHEMA } from './schema.ts'

/** Render the config-document grammar as a reference panel. */
export const DocumentView = memo(function DocumentView() {
  return (
    <section data-rheplicant-document>
      <h2>Config document</h2>

      <div>Sections</div>
      <ul>
        {SCHEMA.sections.map(section => (
          <li key={section.name} data-section={section.name} data-required={section.required}>
            {section.name}{section.required ? ' *' : ''}
          </li>
        ))}
      </ul>

      <div>Exits ({SCHEMA.exits.length})</div>
      <p>{SCHEMA.exits.join(' · ')}</p>

      <div>Operators ({SCHEMA.operators.length})</div>
      <p>{SCHEMA.operators.join(' · ')}</p>

      <div>Transforms ({SCHEMA.transforms.length})</div>
      <p>{SCHEMA.transforms.join(' · ')}</p>
    </section>
  )
})

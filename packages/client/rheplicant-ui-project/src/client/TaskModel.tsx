/**
 * What physics this task DECLARES, and the diagram of where it sits.
 *
 * `docs/project-model.md` §17, closing the philosophy doc's gap 2 ("the 29
 * operators do not appear in the UI") in its read-only half. Two of the five
 * anti-blackbox mechanisms, neither of which was reachable before a first
 * run: the canonical graph, which the doc asks to be "always present on
 * screen", and the operator catalogue.
 *
 * **Only the LIT nodes are listed.** The canonical graph has 33 and an
 * ordinary document lights three; the dimmed remainder is what the DIAGRAM
 * shows, and listing thirty operators nobody declared would bury the three
 * that are the model. The total is stated, because "3 of 33" is how a reader
 * learns there is more physics available than they have used.
 *
 * **`help` is the operator's own docstring**, lifted upstream. Nothing here
 * describes what a parameter means — a second description is a second thing
 * to drift from the physics.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/TaskModel
 */

import { memo } from 'react'
import { EmptyState } from '@rheplicant/dsh-rheplicant-ui-kit/client'
import type { DocumentModel, ModelNode } from '@rheplicant/dsh-rheplicant'
import styles from './project-home.module.css'

interface TaskModelProps {
  readonly svg: string
  readonly model: DocumentModel
}

const Node = memo(function Node({ node }: { node: ModelNode }) {
  return (
    <li className={styles.modelNode} data-model-node={node.nodeId}>
      <span className={styles.modelHead}>
        <span className={styles.mono}>{node.label}</span>
        <span className={styles.chip}>{node.kind}</span>
        {node.selectedType !== null && <span className={styles.chip}>{node.selectedType}</span>}
      </span>
      {node.description !== null && <p className={styles.modelWhat}>{node.description}</p>}
      {node.fields.length > 0 && (
        <dl className={styles.modelFields}>
          {node.fields.map(field => (
            <div key={field.name} className={styles.modelField} data-model-field={field.name}>
              <dt className={styles.modelFieldName}>
                {field.label}
                {field.unit !== null && <span className={styles.modelUnit}>{field.unit}</span>}
                {field.required === true && <span className={styles.modelRequired}>required</span>}
              </dt>
              {/* The operator class's own words, not this layer's. */}
              <dd className={styles.modelHelp}>{field.help ?? '—'}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  )
})

export const TaskModel = memo(function TaskModel({ svg, model }: TaskModelProps) {
  const dim = model.totalNodes - model.nodes.length
  return (
    <div data-task-model="">
      {/* The diagram is upstream's own SVG, rendered as markup rather than
          re-drawn here — `Assembly.to_svg()` is the authoritative picture of
          the model, and a second renderer would be a second answer. */}
      <div
        className={styles.modelDiagram}
        data-model-diagram=""
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {model.nodes.length === 0
        ? (
          <EmptyState
            message="This document declares no operators yet"
            hint="The diagram above shows the canonical graph with everything dimmed — nothing in it is lit because nothing has been placed."
          />
        )
        : (
          <>
            <ul className={styles.rows} data-model-nodes="">
              {model.nodes.map(node => <Node key={node.nodeId} node={node} />)}
            </ul>
            <p className={styles.note}>
              {model.nodes.length} of {model.totalNodes} operators in the canonical graph are lit by
              this document; the other {dim} are dimmed in the diagram above. Each parameter&rsquo;s
              description is the operator&rsquo;s own — this layer keeps no second copy of what the
              physics means.
            </p>
          </>
        )}
    </div>
  )
})

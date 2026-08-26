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
import { EmptyState, shortExecutionId } from '@rheplicant/dsh-rheplicant-ui-kit/client'
import type { DocumentModel, ModelNode } from '@rheplicant/dsh-rheplicant'
import styles from './project-home.module.css'

/**
 * Which projection is on screen, and how to change it.
 *
 * `docs/project-model.md` §28.1. The workbench used to draw this diagram AND
 * carry a `signal-path` panel drawing the selected execution's — two copies of
 * one picture, in two different themes, with neither saying which it was. The
 * panel is gone; the comparison it was accidentally providing is here, stated.
 *
 * **The words are "as authored" and "as it ran", and they are not new.** The
 * document panel on this same surface is subtitled "as authored" and its
 * caption reads "Identical to what <id> ran"; §11.4 calls the pair
 * "as authored vs as it ran". A first draft here said "as declared / as run"
 * and a review caught it: one idea with two names on one page reads as two
 * unrelated features, and "declared" already means something else INSIDE this
 * panel — the lit/dim encoding is what a document declares, so a switch
 * labelled "as declared" over a lit/dim graph reads as a filter.
 */
export interface ModelSourceView {
  /** Which projection is being rendered. */
  readonly showing: 'authored' | 'as-run'
  /** Switch. Absent when there is no execution of THIS task to compare with. */
  readonly onShow?: (showing: 'authored' | 'as-run') => void
  /** The execution the as-run side reads, when there is one. */
  readonly executionId?: string
  /**
   * How the as-run projection is getting on. Meaningful only while `showing`
   * is `as-run`, and load-bearing: the panel refuses to draw the AUTHORED
   * diagram under an as-run label, so this is what it draws instead.
   */
  readonly state?: 'ready' | 'loading' | 'unavailable'
  /**
   * True when the authored bytes are the executed bytes, false when they are
   * not, and ABSENT when the comparison could not be made — the same three
   * values the maturity rail's stale flag carries, and for the same reason.
   */
  readonly identical?: boolean
}

interface TaskModelProps {
  readonly svg: string
  readonly model: DocumentModel
  /** Absent outside the workbench, where there is nothing to compare. */
  readonly source?: ModelSourceView
}

/**
 * The authored/as-it-ran switch, and the sentence that says what it changed.
 *
 * Two buttons rather than one toggle: a toggle labels one state and leaves the
 * reader to infer the other, and the whole point here is that BOTH names are
 * on screen. `aria-pressed` rather than `aria-expanded` — this is a choice
 * between two things, not a disclosure (§20.2 made the same distinction for
 * the section switch).
 */
const SourceSwitch = memo(function SourceSwitch({ source }: { source: ModelSourceView }) {
  const { onShow } = source
  if (onShow === undefined) return null
  return (
    <div className={styles.modelSource} data-model-source={source.showing}>
      <button
        type="button"
        className={styles.modelSourceButton}
        data-model-source-pick="authored"
        aria-pressed={source.showing === 'authored'}
        onClick={() => { onShow('authored') }}
      >
        as authored
      </button>
      <button
        type="button"
        className={styles.modelSourceButton}
        data-model-source-pick="as-run"
        aria-pressed={source.showing === 'as-run'}
        onClick={() => { onShow('as-run') }}
      >
        as it ran
      </button>
      {/* WHETHER they differ, never WHAT differs — the document panel's diff
          answers the second question and this must not become a third opinion
          about it. Rendered beside the BUTTONS rather than inside the note, and
          independently of which side is showing, because a reader has to know
          there is something to look at before deciding to look. It costs no
          fetch: the sidecar already carries the digest of the bytes that ran.
          Absent when the comparison could not be made — `unknown` is not
          `unchanged`. */}
      {source.identical === true && (
        <span className={styles.modelSourceMark} data-model-source-same="">
          same bytes
        </span>
      )}
      {source.identical === false && (
        <span
          className={`${styles.modelSourceMark} ${styles.modelSourceMarkDiffers}`}
          data-model-source-differs=""
        >
          different bytes
        </span>
      )}
      <span className={styles.modelSourceNote} data-model-source-note="">
        {source.showing === 'authored'
          ? 'the task file on disk, as it stands now'
          // The short id, per this codebase's caption convention: a full
          // execution id in a running sentence is a lot of gravel. No position
          // claim either ("the document above" was written when the document
          // panel was above, and it is not); §28.6 exists because a caption
          // outlived its layout.
          : `the bytes ${shortExecutionId(source.executionId ?? '') || 'this execution'} ran`}
      </span>
    </div>
  )
})

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

export const TaskModel = memo(function TaskModel({ svg, model, source }: TaskModelProps) {
  const dim = model.totalNodes - model.nodes.length
  const showing = source?.showing ?? 'authored'
  const asRun = showing === 'as-run'
  // **Never the authored diagram under an as-it-ran label.** The first draft
  // fell back to it while the fetch was in flight, on the written ground that
  // "the switch says which is on screen" — which was false: the note said
  // "reading the bytes this execution ran…" and the picture underneath was the
  // other document's. A diagram is the most confidently-read thing on the
  // page, so a placeholder beats a wrong-but-plausible one.
  const pending = asRun && source?.state !== 'ready'
  return (
    <div data-task-model="" data-model-showing={showing}>
      {source === undefined ? null : <SourceSwitch source={source} />}
      {pending
        ? (
          // Wrapped, because `EmptyState` takes `message`/`hint` and nothing
          // else — an extra `data-*` on it would be a test hook that silently
          // never rendered.
          <div data-model-pending={source?.state ?? 'loading'}>
          <EmptyState
            message={source?.state === 'unavailable'
              ? 'The bytes this execution ran could not be read back'
              : 'Reading the bytes this execution ran…'}
            {...(source?.state === 'unavailable'
              ? {
                  hint: 'Its results directory may have been pruned, or the document it '
                    + 'was given is no longer in it. The task file itself is still on the '
                    + '"as authored" side.',
                }
              : {})}
          />
          </div>
        )
        : (
          <>
            {/* The diagram is upstream's own SVG, rendered as markup rather
                than re-drawn here — `Assembly.to_svg()` is the authoritative
                picture of the model, and a second renderer would be a second
                answer. */}
            <div
              className={styles.modelDiagram}
              data-model-diagram=""
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            {model.nodes.length === 0
              ? (
                <EmptyState
                  message={asRun
                    ? 'This execution ran a document that declared no operators'
                    : 'This document declares no operators yet'}
                  hint="The diagram above shows the canonical graph with everything dimmed — nothing in it is lit because nothing has been placed."
                />
              )
              : (
                <>
                  <ul className={styles.rows} data-model-nodes="">
                    {model.nodes.map(node => <Node key={node.nodeId} node={node} />)}
                  </ul>
                  {/* The prose follows the SWITCH. It said "this document"
                      in both states until a review pointed out that the
                      subtitle had moved and the body had not — one panel,
                      two scopes, one of them wrong. */}
                  <p className={styles.note}>
                    {model.nodes.length} of {model.totalNodes} operators in the canonical graph are
                    lit by {asRun ? 'the document this execution ran' : 'this document'}; the other
                    {' '}{dim} are dimmed in the diagram above. Each parameter&rsquo;s description is
                    the operator&rsquo;s own — this layer keeps no second copy of what the physics
                    means.
                  </p>
                </>
              )}
          </>
        )}
    </div>
  )
})

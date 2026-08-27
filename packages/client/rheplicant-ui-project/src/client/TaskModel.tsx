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

import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react'
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
 * **The words on the switch are "the file now" and "what this run used".**
 * They were "as authored" / "as it ran" — §11.4's own pair, and the document
 * panel's subtitle, so the vocabulary at least agreed with itself. A reader
 * asked what they meant, which is the answer: they are the vocabulary of
 * somebody who has read the design docs. What survives from that round is the
 * rule it established — one idea keeps ONE name across the page (the document
 * panel on the Setup tab now says "the file as it is now" for the same side),
 * and "declared" stays out of it, because the lit/dim encoding is what a
 * document declares and a switch labelled "as declared" over a lit/dim graph
 * reads as a filter.
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
        the file now
      </button>
      <button
        type="button"
        className={styles.modelSourceButton}
        data-model-source-pick="as-run"
        aria-pressed={source.showing === 'as-run'}
        onClick={() => { onShow('as-run') }}
      >
        what this run used
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
          unchanged
        </span>
      )}
      {source.identical === false && (
        <span
          className={`${styles.modelSourceMark} ${styles.modelSourceMarkDiffers}`}
          data-model-source-differs=""
        >
          the file has changed
        </span>
      )}
      <span className={styles.modelSourceNote} data-model-source-note="">
        {source.showing === 'authored'
          ? 'the task file as it is right now'
          // The short id, per this codebase's caption convention: a full
          // execution id in a running sentence is a lot of gravel. No position
          // claim either ("the document above" was written when the document
          // panel was above, and it is not); §28.6 exists because a caption
          // outlived its layout.
          : `the copy ${shortExecutionId(source.executionId ?? '') || 'this run'} actually used`}
      </span>
    </div>
  )
})

const Node = memo(function Node({ node, top, onHover }: {
  readonly node: ModelNode
  /** Absolute offset when the catalogue is aligned to the diagram; absent when it flows. */
  readonly top?: number
  readonly onHover?: (nodeId: string | null) => void
}) {
  return (
    <li
      className={styles.modelNode}
      data-model-node={node.nodeId}
      style={top === undefined ? undefined : { position: 'absolute', insetInlineStart: 0, insetInlineEnd: 0, top: `${top}px` }}
      onMouseEnter={() => { onHover?.(node.nodeId) }}
      onMouseLeave={() => { onHover?.(null) }}
      onFocus={() => { onHover?.(node.nodeId) }}
      onBlur={() => { onHover?.(null) }}
    >
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

/**
 * The vertical centre of every node in the diagram, keyed by its own id.
 *
 * Every node group carries `data-node-id`, which is upstream's own handle for
 * exactly this — `core/render.py` writes it on both the node and the button
 * form, and upstream's `GraphCanvas` finds a clicked node with
 * `closest('[data-node-id]')`. The catalogue's cards already carry
 * `data-model-node="global_signal"`, so the two sides key on the same string.
 *
 * This read the `<title>` with a regex for one build, on the belief that the
 * SVG carried no id — true of the `id` attribute, and false of the handle that
 * was added in the same commit as the titles, so it was never a version this
 * could not use. The regex also needed a trailing colon that exists only
 * because every canonical node currently has a non-empty description.
 *
 * Read from the RENDERED DOM rather than from the SVG's own coordinates, so a
 * scaled or reflowed diagram needs no second calculation.
 *
 * @param root - the element the SVG was rendered into.
 * @returns node id to its offset from `root`'s top, in CSS pixels.
 */
function nodeOffsets(root: HTMLElement): Map<string, number> {
  const offsets = new Map<string, number>()
  const base = root.getBoundingClientRect().top
  for (const group of root.querySelectorAll('[data-node-id]')) {
    const id = group.getAttribute('data-node-id')
    if (id === null || id === '') continue
    const box = group.getBoundingClientRect()
    // The node's CENTRE, so a card sits level with the box rather than with
    // whichever edge happened to be measured.
    offsets.set(id, box.top - base + box.height / 2)
  }
  return offsets
}

/**
 * The diagram, and the catalogue beside it at the diagram's own positions.
 *
 * `docs/superpowers/specs/2026-08-27-workbench-pages.md` D2. The catalogue was
 * a list UNDER a 778x1966 diagram, repeating its vertical order without saying
 * so, in a panel body 1 088px wide — 310px of the axis the diagram needs going
 * unused while the page paid for the same three operators twice.
 *
 * **Placed greedily, so cards cannot overlap.** Each card wants the centre of
 * its node; it gets `max(wanted, previous bottom + gap)`. Two nodes 80px apart
 * — which `gain` and `noise` are — therefore produce two stacked cards rather
 * than two on top of each other.
 *
 * **Two fallbacks, because a layout that measures the DOM can fail to.** A
 * card whose node is not in the diagram, and a container with no width (a
 * narrow viewport, a jsdom test), both fall back to ordinary flow;
 * `data-model-aligned` records which happened, so a test can tell a working
 * fallback from a broken alignment.
 */
const ModelSplit = memo(function ModelSplit({ svg, nodes }: { readonly svg: string; readonly nodes: readonly ModelNode[] }) {
  const diagramRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [placement, setPlacement] = useState<{ readonly tops: ReadonlyMap<string, number>; readonly height: number } | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  const measure = useCallback(() => {
    const diagram = diagramRef.current
    const list = listRef.current
    if (diagram === null || list === null) return
    // Below the split's breakpoint the two stack, and stacked cards must flow.
    if (list.getBoundingClientRect().width < 1 || diagram.clientWidth < 1) { setPlacement(null); return }
    const offsets = nodeOffsets(diagram)
    const tops = new Map<string, number>()
    let cursor = 0
    for (const card of list.querySelectorAll<HTMLElement>('[data-model-node]')) {
      const id = card.getAttribute('data-model-node') ?? ''
      const wanted = offsets.get(id)
      if (wanted === undefined) { setPlacement(null); return }
      const top = Math.max(wanted - card.offsetHeight / 2, cursor)
      tops.set(id, top)
      cursor = top + card.offsetHeight + 8
    }
    setPlacement(tops.size === 0 ? null : { tops, height: Math.max(cursor - 8, 0) })
  }, [])

  // `useLayoutEffect`, not `useEffect`: the cards are positioned from measured
  // geometry, and a paint with them at zero would be a visible jump.
  useLayoutEffect(() => {
    measure()
    // `ResizeObserver` is a BROWSER api and jsdom has none — measured: 49
    // specs across two files died in this effect. The one measurement above
    // still runs there (and falls back to flow, because a jsdom element has no
    // width), so the guard costs the tests nothing and the app keeps its
    // re-measure on resize.
    const Observer = globalThis.ResizeObserver
    if (Observer === undefined) return
    const observer = new Observer(() => { measure() })
    if (diagramRef.current !== null) observer.observe(diagramRef.current)
    if (listRef.current !== null) observer.observe(listRef.current)
    return () => { observer.disconnect() }
  }, [measure, svg, nodes])

  // The hovered card's node, lit in the diagram. One direction only: a reader
  // asks "where is this operator", not "what is this box" — the box already
  // carries its own `<title>` tooltip, which is upstream's answer to that.
  useLayoutEffect(() => {
    const diagram = diagramRef.current
    if (diagram === null) return
    for (const group of diagram.querySelectorAll('[data-model-node-hover]')) {
      group.removeAttribute('data-model-node-hover')
    }
    if (hovered === null) return
    // The same handle `nodeOffsets` keys on. A miss here lights nothing and
    // says nothing, so the two must not be able to disagree about what a node
    // is called.
    for (const group of diagram.querySelectorAll('[data-node-id]')) {
      if (group.getAttribute('data-node-id') === hovered) {
        group.setAttribute('data-model-node-hover', '')
      }
    }
    // `svg` is a dependency even though the body never reads it: the diagram is
    // `dangerouslySetInnerHTML`, so a genuine change to that string replaces
    // the whole `<g>` tree and takes this attribute with it. The coupling runs
    // through `diagramRef.current`'s CHILDREN, which exhaustive-deps cannot
    // see. Without it, hovering a card and then flipping the as-authored /
    // as-it-ran switch leaves the ring gone while `hovered` still names a node.
  }, [hovered, svg])

  const aligned = placement !== null
  return (
    <div className={styles.modelSplit} data-model-split="" data-model-aligned={aligned ? 'true' : 'false'}>
      <div
        ref={diagramRef}
        className={styles.modelDiagram}
        data-model-diagram=""
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <ul
        ref={listRef}
        className={aligned ? `${styles.modelCatalogue} ${styles.modelCatalogueAligned}` : styles.modelCatalogue}
        data-model-nodes=""
        style={aligned ? { height: `${placement.height}px` } : undefined}
      >
        {nodes.map(node => (
          <Node
            key={node.nodeId}
            node={node}
            {...(aligned ? { top: placement.tops.get(node.nodeId) ?? 0 } : {})}
            onHover={setHovered}
          />
        ))}
      </ul>
    </div>
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
          // Wrapped, because this hook is the SOURCE's state (`ready` /
          // `loading` / `unavailable`) and `EmptyState`'s own
          // `data-empty-state-kind` is the ABSENCE's — two facts that agree
          // here and are not the same fact. The wrapper used to exist because
          // `EmptyState` took `message`/`hint` and nothing else; that stopped
          // being true when `kind` landed, and the reason was restated rather
          // than left standing.
          <div data-model-pending={source?.state ?? 'loading'}>
          <EmptyState
            // The kind follows the CONDITION, the way it does wherever one
            // branch is a fetch and the other is not. An execution whose bytes
            // could not be read back is `unavailable` — something produced
            // them and they are gone — and is not "not yet".
            kind={source?.state === 'unavailable' ? 'unavailable' : 'arriving'}
            message={source?.state === 'unavailable'
              ? 'The copy this run used could not be read back'
              : 'Reading the copy this run used…'}
            {...(source?.state === 'unavailable'
              ? {
                  hint: 'Its results directory may have been pruned, or the document it '
                    + 'was given is no longer in it. The task file itself is still on the '
                    + '"the file now" side.',
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
            {model.nodes.length === 0
              ? (
                <>
                  <div
                    className={styles.modelDiagram}
                    data-model-diagram=""
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: svg }}
                  />
                  <EmptyState
                    kind="waiting"
                    message={asRun
                      ? 'This execution ran a document that declared no operators'
                      : 'This document declares no operators yet'}
                    hint="The diagram shows the canonical graph with everything dimmed — nothing in it is lit because nothing has been placed."
                  />
                </>
              )
              : (
                <>
                  <ModelSplit svg={svg} nodes={model.nodes} />
                  {/* The prose follows the SWITCH. It said "this document"
                      in both states until a review pointed out that the
                      subtitle had moved and the body had not — one panel,
                      two scopes, one of them wrong. */}
                  <p className={styles.note}>
                    {model.nodes.length} of {model.totalNodes} operators in the canonical graph are
                    lit by {asRun ? 'the document this execution ran' : 'this document'}; the other
                    {' '}{dim} are dimmed in the diagram. Each parameter&rsquo;s description is
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

/**
 * What changed between the document that RAN and the document as authored.
 *
 * The half of `docs/project-model.md` §11.4 that P7c left open. The digest
 * comparison already answers *whether* a task changed; this answers *what*,
 * which is the only form of that answer somebody can act on.
 *
 * Long runs of unchanged lines collapse to a marker. A config document is
 * mostly unchanged even after a real edit, and a wall of context is how a
 * three-line change becomes invisible.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/DocumentDiff
 */

import { memo, useMemo } from 'react'
import { EmptyState } from '@rheplicant/dsh-rheplicant-ui-kit/client'
import { diffLines, hasChanges, type DiffLine } from './document-diff.ts'
import styles from './project-home.module.css'

/** Unchanged lines kept either side of a change, before a run collapses. */
const CONTEXT = 3

/** Marks the gutter for each kind. */
const SIGN: Record<DiffLine['kind'], string> = { same: ' ', removed: '−', added: '+' }

interface DocumentDiffProps {
  /** `config.input.yaml` — the exact bytes this execution ran. */
  readonly ran: string
  /** The task file as it stands now. */
  readonly authored: string
  /** The execution the left-hand side belongs to, named on screen. */
  readonly executionId: string
}

/**
 * Index runs of unchanged lines that are far enough from any change to hide.
 *
 * @param lines - the full comparison.
 * @returns the indices to render, with `null` standing for a collapsed run.
 */
function withCollapsedContext(lines: readonly DiffLine[]): readonly (DiffLine | null)[] {
  const keep = new Set<number>()
  lines.forEach((line, index) => {
    if (line.kind === 'same') return
    for (let at = index - CONTEXT; at <= index + CONTEXT; at += 1) {
      if (at >= 0 && at < lines.length) keep.add(at)
    }
  })
  const out: (DiffLine | null)[] = []
  let hidden = false
  lines.forEach((line, index) => {
    if (keep.has(index)) {
      out.push(line)
      hidden = false
      return
    }
    // One marker per run, not one per hidden line.
    if (!hidden) out.push(null)
    hidden = true
  })
  return out
}

export const DocumentDiff = memo(function DocumentDiff(
  { ran, authored, executionId }: DocumentDiffProps,
) {
  const diff = useMemo(() => diffLines(ran, authored), [ran, authored])

  if (diff === 'too-large') {
    return (
      <EmptyState
        message="This document is too large to compare here"
        hint="The comparison is line-by-line against the executed copy, and it is bounded so one very large document cannot freeze this page. The two files are both on disk."
      />
    )
  }
  if (!hasChanges(diff)) {
    return (
      <p className={styles.note} data-document-diff-identical="">
        Identical to what <code>{executionId}</code> ran. The task file on disk is byte-for-byte
        the document behind these results.
      </p>
    )
  }
  return (
    <div data-document-diff="">
      <p className={styles.note}>
        <strong>−</strong> is what <code>{executionId}</code> ran; <strong>+</strong> is the task
        file as it stands now. The results below describe the <strong>−</strong> side.
      </p>
      <pre className={styles.diff}>
        {withCollapsedContext(diff).map((line, index) => (
          line === null
            ? (
              <span key={`gap-${index}`} className={styles.diffGap} data-diff-gap="">
                {'  ⋯\n'}
              </span>
            )
            : (
              <span
                key={`${line.kind}-${line.ranAt ?? ''}-${line.authoredAt ?? ''}-${index}`}
                className={styles[`diff${line.kind[0]!.toUpperCase()}${line.kind.slice(1)}`]}
                data-diff-line={line.kind}
              >
                {`${SIGN[line.kind]} ${line.text}\n`}
              </span>
            )
        ))}
      </pre>
    </div>
  )
})

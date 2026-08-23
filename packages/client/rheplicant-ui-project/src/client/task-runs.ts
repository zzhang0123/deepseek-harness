/**
 * The exits this task reaches for, against the ones it does not.
 *
 * `docs/project-model.md` §18, closing the philosophy doc's gap 5 in the form
 * the source will defend. That gap asks for "the four capabilities on equal
 * footing, not defaulting to forward only" — and there is no capability
 * concept in rheplicant: no enum, no registry, no per-exit marker, only prose
 * in its README. A hand-kept kind-to-capability table here would be the one
 * mapping in this repo that has to track the grammar by hand, which §2.1
 * forbids outright.
 *
 * What the source does defend is `fitting` — whether an exit needs a fitted
 * parameter space (`preflight/model.py::_A30_NOT_FITTING`) — and what each
 * exit PRODUCES. Those answer the same question better: "14 of the 18 exits
 * need a fitted parameter space you do not have" says more than "capability 2
 * not exercised", and it is true.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/task-runs
 */

import type { DocumentRuns, ExitEntry } from '@rheplicant/dsh-rheplicant'

/** One exit, and whether this task reaches for it. */
export interface ExitInPlay extends ExitEntry {
  readonly used: boolean
}

/** The exits, ordered and counted for one task. */
export interface ExitsInPlay {
  /** Every exit, the used ones first. */
  readonly entries: readonly ExitInPlay[]
  /** How many DISTINCT exits this task uses. */
  readonly usedCount: number
  /** How many unused exits need a fitted parameter space. */
  readonly unusedFitting: number
  /** Kinds the document names that the grammar does not run. */
  readonly unknown: readonly string[]
}

/**
 * Order and count the exits for one task.
 *
 * @param runs - the projection's `runs` slice.
 * @returns the exits with the declared ones first, and the counts around them.
 */
export function exitsInPlay(runs: DocumentRuns): ExitsInPlay {
  // A Set: one exit invoked by three runs is one exit used, and counting it
  // three times would make the ratio against the catalogue meaningless.
  const used = new Set(
    runs.declared.filter(run => run.known && run.kind !== null).map(run => run.kind as string),
  )
  const entries = runs.catalogue.map(entry => ({ ...entry, used: used.has(entry.kind) }))
  return {
    // Declared first, then the grammar's own order for the rest. What you
    // declared is what you are reading about; the remainder is what you did
    // not reach for.
    entries: [...entries.filter(entry => entry.used), ...entries.filter(entry => !entry.used)],
    usedCount: used.size,
    unusedFitting: entries.filter(entry => !entry.used && entry.fitting).length,
    // Reported, never counted. A document may name anything, and folding an
    // unknown kind into `usedCount` would make the ratio lie.
    unknown: runs.declared
      .filter(run => !run.known && run.kind !== null)
      .map(run => run.kind as string),
  }
}

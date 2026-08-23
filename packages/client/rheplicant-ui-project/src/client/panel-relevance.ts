/**
 * Which panels the selected task has no exit for (`docs/project-model.md`
 * §20.4).
 *
 * A panel drawing a product no declared run writes is not broken and its task
 * is not wrong — the task simply did not reach for that exit. Before §18 the
 * only explanation on screen was six empty boxes each saying "ask the agent for
 * a nuts run"; the Exits catalogue names all eighteen once, whatever the task,
 * so the boxes no longer have to carry it. Collapsing them is what turns that
 * from a claim into the layout.
 *
 * **Three values, not two, and the middle one is the point.** A task whose
 * declared runs cannot be read — no projection yet, the gui extra absent, a
 * path the project refuses — is `unknown`, and `unknown` collapses nothing.
 * Folding a panel shut because nobody could ask is the same wrongness §12
 * refused when it kept `unknown` apart from `unmet` on the definition
 * checklist.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/panel-relevance
 */

import type { KnownPanel } from './known-panels.ts'

/** Just the slice of a projection's `runs` this rule reads. */
export interface DeclaredRunsLike {
  readonly declared: readonly { readonly products?: readonly string[] }[]
}

/**
 * The panels no declared run feeds, for a task whose runs could be read.
 *
 * @param panels - the roster, each with the product it draws (or none).
 * @param runs - the projection's declared runs, or undefined when the document
 *   could not be projected at all.
 * @returns the panel ids to collapse by rule; EMPTY when the runs are unknown,
 *   because nobody could ask is not the same as nothing writes it.
 */
export function panelsWithNoExit(
  panels: readonly KnownPanel[],
  runs: DeclaredRunsLike | undefined,
): readonly string[] {
  if (runs === undefined) return []
  const written = new Set<string>()
  for (const run of runs.declared) {
    for (const product of run.products ?? []) written.add(product)
  }
  return panels
    .filter(panel => panel.product !== undefined && !written.has(panel.product))
    .map(panel => panel.id)
}

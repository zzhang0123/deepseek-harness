/**
 * Which of a project's listed data files the SELECTED task actually reads.
 *
 * `docs/project-model.md` §11.4 promised this link and §8.5 explained why it
 * could not be made: answering it needs a YAML parse, and the host has never
 * parsed a document. §12's `document.definition` is that parse — performed by
 * the Python service that owns the grammar, using rheplicant's own
 * `resolve_file_path` — so the claim can finally be made without a second,
 * drifting reading of the document.
 *
 * **The claim stays narrow, and the panel says so.** This is what ONE task
 * reads. Nothing here says anything about the project's other tasks, and a
 * file with no mark is not an unused file — it is a file this task does not
 * read.
 *
 * **Three kinds of reference cannot become a row**, and each is reported
 * rather than dropped, because a listing that showed two marks out of five
 * references would read as a complete account of what the task reads:
 *
 * * one that resolves inside the project but is not LISTED — `INPUT_EXTENSIONS`
 *   is a filter, not a complete list, so a `.dat` resolves fine and never
 *   appears as a row; a truncated walk does the same thing;
 * * one that resolves OUTSIDE the project — the route withheld the path on
 *   purpose (§12.5), and this layer must not invent one to show;
 * * one that does not resolve — reported by the definition checklist, and
 *   deliberately not re-detailed here.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/input-usage
 */

import type { ProjectDefinitionBody, ProjectInputRow } from '@rheplicant/dsh-rheplicant'

/** What the selected task reads, against what the project listed. */
export interface InputUsage {
  /**
   * False when there is no answer yet — no task selected, or the check has
   * not come back. Silence and "this task reads none of them" are different
   * statements, and the panel must not make the second while meaning the first.
   */
  readonly known: boolean
  /** Workspace-relative paths of LISTED inputs this task reads. */
  readonly used: ReadonlySet<string>
  /** In-project files it reads that this listing does not carry, each named once. */
  readonly unlisted: readonly string[]
  /** How many references resolved outside the project. Counted, never named. */
  readonly outside: number
  /** How many did not resolve. The checklist owns the detail. */
  readonly unresolved: number
}

const NOTHING_KNOWN: InputUsage = {
  known: false, used: new Set(), unlisted: [], outside: 0, unresolved: 0,
}

/**
 * Which listed inputs the selected task reads.
 *
 * @param inputs - the project's listed data files.
 * @param report - the selected task's definition report, or undefined when
 *   there is none to read.
 * @returns the usage, with {@link InputUsage.known} false when there is no answer.
 */
export function taskInputUsage(
  inputs: readonly ProjectInputRow[],
  report: ProjectDefinitionBody | undefined,
): InputUsage {
  if (report === undefined) return NOTHING_KNOWN
  const listed = new Set(inputs.map(input => input.path))
  const used = new Set<string>()
  // A Set, not an array: one document may read the same file at two nodes,
  // and naming it twice would read as two files.
  const unlisted = new Set<string>()
  let outside = 0
  let unresolved = 0

  for (const reference of report.inputs) {
    if (!reference.resolves) { unresolved += 1; continue }
    if (!reference.inProject || reference.projectPath === undefined) { outside += 1; continue }
    if (listed.has(reference.projectPath)) used.add(reference.projectPath)
    else unlisted.add(reference.projectPath)
  }

  return { known: true, used, unlisted: [...unlisted], outside, unresolved }
}

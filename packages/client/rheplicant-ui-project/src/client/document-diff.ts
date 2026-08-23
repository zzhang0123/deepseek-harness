/**
 * What changed between the document that RAN and the document as authored.
 *
 * `docs/project-model.md` §11.4 left this open: P7c made *as authored* vs *as
 * it ran* visible through the DIGEST, which answers whether they differ, and
 * recorded that showing the execution's `config.input.yaml` beside it "is
 * still worth doing and is NOT done". A flag that says a task changed and
 * cannot say how leaves the reader to diff two YAML files by eye, which is
 * the drudgery a tool exists to remove.
 *
 * **A line diff, not a side-by-side pair of panes.** The question is *what
 * changed*, and a marked-up single column answers it at any width, where two
 * panes need room this panel does not always have and still leave the reader
 * finding the differences themselves.
 *
 * **A replacement reads as a removal then an addition**, never as one
 * "changed" line. A YAML edit that rewrites a value is legible only if both
 * the old and the new text are on screen.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/document-diff
 */

/** How one line relates to the two documents. */
export type DiffLineKind = 'same' | 'removed' | 'added'

/** One line of the comparison. */
export interface DiffLine {
  readonly kind: DiffLineKind
  readonly text: string
  /**
   * 1-based line number in the EXECUTED document, absent for an added line.
   *
   * Numbered independently of {@link authoredAt}, because one shared counter
   * would make the gutter lie about where to look in the file you are about
   * to edit.
   */
  readonly ranAt?: number
  /** 1-based line number in the AUTHORED document, absent for a removed line. */
  readonly authoredAt?: number
}

/**
 * The largest document either side may have before the comparison is refused.
 *
 * The algorithm is O(n·m), so this is the bound that keeps one generated
 * config from freezing the workbench. Announced rather than silent: a diff
 * that quietly gave up would render as "nothing changed", which is the one
 * answer it must never give by accident.
 */
export const MAX_DIFF_LINES = 2000

/** Split into lines, ignoring a trailing newline. */
function lines(text: string): string[] {
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  return body === '' ? [] : body.split('\n')
}

/**
 * Compare the executed document against the authored one.
 *
 * @param ran - `config.input.yaml`, the exact bytes this execution used.
 * @param authored - the task file as it stands now.
 * @returns the lines in reading order, or `'too-large'` when either side
 *   exceeds {@link MAX_DIFF_LINES}.
 */
export function diffLines(ran: string, authored: string): readonly DiffLine[] | 'too-large' {
  const before = lines(ran)
  const after = lines(authored)
  if (before.length > MAX_DIFF_LINES || after.length > MAX_DIFF_LINES) return 'too-large'

  // Longest common subsequence over LINES. `table[i][j]` is the length of the
  // LCS of `before[i..]` and `after[j..]`, filled backwards so the walk below
  // can go forwards and emit in reading order.
  const table: number[][] = Array.from(
    { length: before.length + 1 },
    () => new Array<number>(after.length + 1).fill(0),
  )
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i]![j] = before[i] === after[j]
        ? table[i + 1]![j + 1]! + 1
        : Math.max(table[i + 1]![j]!, table[i]![j + 1]!)
    }
  }

  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      out.push({ kind: 'same', text: before[i]!, ranAt: i + 1, authoredAt: j + 1 })
      i += 1
      j += 1
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      // Removal before addition on a tie, so a replacement reads old-then-new
      // — the order someone comparing two versions expects to read them in.
      out.push({ kind: 'removed', text: before[i]!, ranAt: i + 1 })
      i += 1
    } else {
      out.push({ kind: 'added', text: after[j]!, authoredAt: j + 1 })
      j += 1
    }
  }
  for (; i < before.length; i += 1) out.push({ kind: 'removed', text: before[i]!, ranAt: i + 1 })
  for (; j < after.length; j += 1) out.push({ kind: 'added', text: after[j]!, authoredAt: j + 1 })
  return out
}

/** Whether a comparison found any difference at all. */
export function hasChanges(diff: readonly DiffLine[] | 'too-large'): boolean {
  return diff !== 'too-large' && diff.some(line => line.kind !== 'same')
}

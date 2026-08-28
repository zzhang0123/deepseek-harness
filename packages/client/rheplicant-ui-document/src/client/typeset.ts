/**
 * Typesetting for the one thing in this panel that is prose written elsewhere:
 * the reason a section is not accepted.
 *
 * Upstream writes those sentences with ASCII `--` where an em dash belongs —
 * "is not read by this layer -- it is handled by the command line" — which is
 * ordinary in a source file and reads as a typo in a browser. `schema.ts` is
 * GENERATED and keeps upstream's bytes exactly, so the fix belongs here, at
 * the point of display: the data is not rewritten, it is set.
 *
 * **This is not a gloss.** `GrammarReference`'s own rule is that upstream's
 * wording is passed through unglossed, because a translation is a mapping the
 * schema will not defend. Choosing a dash glyph is not a translation — no word
 * changes, and the sentence a reader ends up with is the sentence upstream
 * wrote. A REWORDING would still be forbidden here.
 *
 * @module @rheplicant/dsh-rheplicant-ui-document/client/typeset
 */

/**
 * ASCII `--` set as an em dash, where it is one.
 *
 * **Only between spaces.** ` -- ` is the em-dash convention; `--check` is a
 * command-line flag, and these very sentences are about the command line. A
 * blind replacement would set `--profile` as `—profile` in the one panel whose
 * subject makes that likely, so the rule is the narrow one that cannot.
 *
 * Nothing else is set. Straight quotes stay straight and `...` stays three
 * dots: each would be another rule with its own exceptions, and none of them
 * is currently wrong on screen.
 *
 * @param text - the sentence as the schema carries it.
 * @returns the sentence as it should be read.
 */
export function emDashes(text: string): string {
  return text.replaceAll(' -- ', ' — ')
}

/**
 * One run's provenance caption: the wall-clock time its `rheplicant/run`
 * event was appended, the transport that executed it, and the event's own
 * session sequence number. Three genuinely distinct runs can produce a
 * byte-identical outcome (the same document run twice with the same seed),
 * and without this caption their cards are visually indistinguishable — the
 * `seq` is the one field guaranteed to differ between any two runs, even two
 * reruns inside the same wall-clock second, so it is always included
 * whenever it is known.
 * @module @rheplicant/dsh-rheplicant-ui-kit/client/format/provenance
 */

// Each field spells its optionality as `T | undefined`, not bare `T`, so a
// caller can build the argument object straight off another optional field
// (`{ time: run.time, ... }`, `run.time: number | undefined`) without a
// conditional spread — under `exactOptionalPropertyTypes`, a bare `time?: T`
// would refuse a literal that explicitly sets `time` to a value statically
// typed `T | undefined`, forcing every call site into `{...(x === undefined
// ? {} : {time: x})}` gymnastics for what is, semantically, just "may be
// missing." A pure formatter's input contract should not force that on every
// caller; `StatRowProps`/`BadgeProps` keep the strict form because THEIR
// callers already follow the codebase's conditional-spread convention.
export interface RunProvenance {
  readonly time?: number | undefined
  readonly transport?: string | undefined
  readonly seq?: number | undefined
}

/**
 * Render one run's provenance as a single `·`-joined caption, or `undefined`
 * when none of the three fields are present (an older or malformed run
 * entry) — callers render no caption line at all rather than an empty one.
 * Time-of-day only, not a full date: a rheplicant session rarely spans a day
 * boundary, so the date would be noise, not signal.
 */
export function formatRunProvenance(provenance: RunProvenance): string | undefined {
  const parts: string[] = []
  if (provenance.time !== undefined && Number.isFinite(provenance.time)) {
    parts.push(new Date(provenance.time).toLocaleTimeString())
  }
  if (provenance.transport !== undefined) parts.push(provenance.transport)
  if (provenance.seq !== undefined) parts.push(`seq ${provenance.seq}`)
  return parts.length === 0 ? undefined : parts.join(' · ')
}

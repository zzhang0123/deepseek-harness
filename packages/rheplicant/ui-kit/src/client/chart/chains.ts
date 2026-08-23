/**
 * Parser for the wire `chains` key grammar (see `RunEntry.chains` in
 * `@rheplicant/dsh-rheplicant` `types.ts`, owned by the compute service's
 * `_chain_traces`): a scalar latent is keyed by its bare name (`g`); a
 * non-scalar latent with at most 8 components fans out into per-component
 * keys (`g[2]`, `g[0,3]`); a wider latent instead ships three per-draw
 * summary keys (`g.mean`, `g.q05`, `g.q95`). A generated key that collides
 * with another latent's key is disambiguated with a `#2`, `#3`, … suffix on
 * the flat map — never silently dropped. This module groups the flat record
 * back by latent: the `#N` suffix is stripped for grouping (so it doesn't
 * get parsed as part of the component/summary grammar) but the wire key is
 * kept verbatim as the series label, so the suffix still reads in a legend
 * or tooltip.
 * @module @rheplicant/dsh-rheplicant-ui-kit/client/chart/chains
 */

export interface ChainSeries {
  readonly key: string
  readonly label: string
  readonly values: readonly (number | null)[]
}

export type ChainGroup =
  | { readonly latent: string; readonly kind: 'series'; readonly series: readonly ChainSeries[] }
  | {
      readonly latent: string
      readonly kind: 'band'
      readonly mean: readonly (number | null)[]
      readonly q05: readonly (number | null)[]
      readonly q95: readonly (number | null)[]
    }

type SummaryKind = 'mean' | 'q05' | 'q95'

const COLLISION_SUFFIX = /#\d+$/
const SUMMARY_SUFFIX = /^(.*)\.(mean|q05|q95)$/
const COMPONENT_SUFFIX = /^(.*)\[\d+(?:,\d+)*\]$/

interface ParsedKey {
  readonly latent: string
  readonly summaryKind: SummaryKind | undefined
}

/** Split one wire key into its base latent name and, if present, its summary kind. */
function parseKey(rawKey: string): ParsedKey {
  const sansCollision = rawKey.replace(COLLISION_SUFFIX, '')
  const summaryMatch = sansCollision.match(SUMMARY_SUFFIX)
  if (summaryMatch) {
    const latent = summaryMatch[1] ?? sansCollision
    const summaryKind = summaryMatch[2] as SummaryKind
    return { latent, summaryKind }
  }
  const componentMatch = sansCollision.match(COMPONENT_SUFFIX)
  if (componentMatch) {
    return { latent: componentMatch[1] ?? sansCollision, summaryKind: undefined }
  }
  return { latent: sansCollision, summaryKind: undefined }
}

interface BucketEntry {
  readonly summaryKind: SummaryKind | undefined
  readonly series: ChainSeries
}

/**
 * Fold the wire's flat `chains` record into one group per latent, in
 * first-appearance order. A latent whose keys are exactly `.mean`/`.q05`/
 * `.q95` (and nothing else) groups as a credible-interval `band`; every
 * other latent — scalar, per-component fan-out, or a summary latent missing
 * one of the three keys — groups as `series`, keys in their original order.
 */
export function groupChains(
  chains: Record<string, readonly (number | null)[]> | null | undefined,
): ChainGroup[] {
  // NULL IS NOT AN EMPTY OBJECT, and this is the choke point where that has to
  // be true. `RunEntry.chains` is an optional wire field, but events recorded
  // before the service stopped emitting explicit nulls carry `"chains": null`
  // — measured in real session logs on a developer machine. `Object.entries`
  // throws on null, and a throw inside a `conversation.chat.node` renderer
  // takes the WHOLE slot down (see the same hazard recorded for
  // `RunDiagnostics.notes`). Guarding here rather than at each call site is
  // what stops the next panel from being the fourth copy of this bug.
  if (chains === null || chains === undefined) return []
  const order: string[] = []
  const buckets = new Map<string, BucketEntry[]>()

  for (const [rawKey, values] of Object.entries(chains)) {
    const { latent, summaryKind } = parseKey(rawKey)
    let bucket = buckets.get(latent)
    if (!bucket) {
      bucket = []
      buckets.set(latent, bucket)
      order.push(latent)
    }
    bucket.push({ summaryKind, series: { key: rawKey, label: rawKey, values } })
  }

  return order.map((latent): ChainGroup => {
    const entries = buckets.get(latent) ?? []
    const summaryByKind = new Map<SummaryKind, ChainSeries>()
    let nonSummaryCount = 0
    for (const entry of entries) {
      if (entry.summaryKind) summaryByKind.set(entry.summaryKind, entry.series)
      else nonSummaryCount += 1
    }
    const mean = summaryByKind.get('mean')
    const q05 = summaryByKind.get('q05')
    const q95 = summaryByKind.get('q95')
    if (mean && q05 && q95 && nonSummaryCount === 0 && summaryByKind.size === 3) {
      return { latent, kind: 'band', mean: mean.values, q05: q05.values, q95: q95.values }
    }
    return { latent, kind: 'series', series: entries.map(e => e.series) }
  })
}

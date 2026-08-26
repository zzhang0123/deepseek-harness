/**
 * Shared derivation for `RunDiagnostics.mcmc` — the sampler's per-latent
 * r_hat/n_eff bag a multi-latent NUTS run reports alongside (or, commonly,
 * INSTEAD of — see the module doc below) the scalar `rhat`/`n_eff` fields.
 * The wire type is `Record<string, unknown>` (an intentionally loose bag:
 * TypeScript cannot statically pin down each entry's `{r_hat, n_eff}`
 * shape), so this is the ONE place that narrows it at runtime — every
 * consumer (`PosteriorPanel`, `ChainsPanel`, `AnalysisRunPanel`, and
 * `ui-loop`'s `loop-selectors.ts`) reads through here rather than
 * re-deriving its own parse of the same untyped bag.
 *
 * `RHAT_WARN_ABOVE` is the ONE r_hat warn threshold rheplicant's UI uses,
 * scalar or per-latent alike — `loop-selectors.ts` imports this same
 * constant for its top-level `rhat` check, so a latent's r_hat and a run's
 * scalar r_hat can never disagree about where "warn" starts.
 * @module @rheplicant/dsh-rheplicant-ui-kit/client/format/mcmc
 */
import type { StatVerdict } from '../panel/StatRow.tsx'
import { formatDiagnostic } from './number.ts'

/** One latent's r_hat/n_eff, narrowed from the wire's untyped `mcmc` bag. */
export interface McmcLatentDiagnostic {
  readonly latent: string
  readonly rhat: number | null
  readonly nEff: number | null
}

/** `warn` above this r_hat — the same value `loop-selectors.ts`'s scalar-rhat check uses; one convention, not two. */
export const RHAT_WARN_ABOVE = 1.01

/** `null` passes through (the wire's non-finite spelling); a plain number passes through; anything else (missing key, wrong type) is "not reported". */
function asDiagnosticNumber(value: unknown): number | null | undefined {
  if (value === null) return null
  if (typeof value === 'number') return value
  return undefined
}

/**
 * Parse `RunDiagnostics.mcmc` into an ordered array of `{latent, rhat, n_eff}`.
 * An entry that isn't a `{r_hat, n_eff}`-shaped object, or that carries
 * neither field, is skipped rather than thrown on — this is a read-side
 * projection over durable event data, not a validator (matching
 * `run-selectors.ts`'s own philosophy). Takes `unknown` rather than the wire
 * `Record<string, unknown>` so it reads equally off the authoritative wire
 * type and off `AnalysisRun`'s permissive structural mirror.
 */
export function mcmcLatents(mcmc: unknown): readonly McmcLatentDiagnostic[] {
  if (typeof mcmc !== 'object' || mcmc === null) return []
  const rows: McmcLatentDiagnostic[] = []
  for (const [latent, raw] of Object.entries(mcmc as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) continue
    const entry = raw as Record<string, unknown>
    const rhat = asDiagnosticNumber(entry.r_hat)
    const nEff = asDiagnosticNumber(entry.n_eff)
    if (rhat === undefined && nEff === undefined) continue
    rows.push({ latent, rhat: rhat ?? null, nEff: nEff ?? null })
  }
  return rows
}

/** One latent's r_hat or n_eff, formatted and ready to render as a `StatRow` (or an equivalent dt/dd pair). */
export interface McmcStatCell {
  readonly stat: 'rhat' | 'n-eff'
  readonly label: string
  readonly value: string
  /** `warn` when this is the r_hat cell and its value exceeds {@link RHAT_WARN_ABOVE}; otherwise absent (never `'ok'` — callers that want a dot for every row can default the absent case themselves). */
  readonly verdict?: StatVerdict
}

/** One latent's full render-ready row: its r_hat cell and its n_eff cell. */
export interface McmcLatentRow {
  readonly latent: string
  readonly rhat: McmcStatCell
  readonly nEff: McmcStatCell
}

/**
 * Render-ready per-latent MCMC diagnostic rows — two `McmcStatCell`s
 * (r_hat, n_eff) per latent the sampler reported, values already run
 * through `formatDiagnostic` and a `warn` verdict already attached to a bad
 * r_hat, so every consumer renders the exact same numbers under the exact
 * same threshold instead of three independent re-derivations.
 */
export function mcmcRows(mcmc: unknown): readonly McmcLatentRow[] {
  return mcmcLatents(mcmc).map(({ latent, rhat, nEff }) => {
    const verdict: StatVerdict | undefined = typeof rhat === 'number' && rhat > RHAT_WARN_ABOVE ? 'warn' : undefined
    return {
      latent,
      rhat: {
        stat: 'rhat',
        label: `${latent} · r_hat`,
        value: formatDiagnostic('rhat', rhat),
        ...(verdict === undefined ? {} : { verdict }),
      },
      nEff: {
        stat: 'n-eff',
        label: `${latent} · n_eff`,
        value: formatDiagnostic('n_eff', nEff),
      },
    }
  })
}

/** The worst r_hat and the thinnest n_eff a sampler reported, across latents. */
export interface McmcWorst {
  /** The LARGEST r_hat, already formatted; `undefined` when none was a number. */
  readonly rhat: string | undefined
  /**
   * Which latent that r_hat belongs to.
   *
   * Carried because the two extrema can come from DIFFERENT latents, and a
   * line reading "worst r_hat 1.42 · thinnest n_eff 83" otherwise reads as one
   * latent's pair. It is also the single most actionable fact in the summary:
   * with two latents a reader can go and look, with forty they cannot.
   */
  readonly rhatLatent: string | undefined
  /** The SMALLEST n_eff, already formatted; `undefined` when none was a number. */
  readonly nEff: string | undefined
  /** Which latent that n_eff belongs to. */
  readonly nEffLatent: string | undefined
  /** How many latents the sampler reported on. */
  readonly latents: number
  /** True when the largest r_hat is past {@link RHAT_WARN_ABOVE}. */
  readonly warn: boolean
}

/**
 * The one-line convergence summary — largest r_hat, smallest n_eff, and which
 * latent each belongs to.
 *
 * **Written for `docs/project-model.md` §28.2.** The Posterior and Chains
 * panels both drew the full per-latent table, measured identical on screen
 * down to the values; the table is Chains's evidence, because it answers
 * "did the sampler behave". Posterior still needs a TRUST signal beside the
 * marginals — that is where somebody decides whether to believe a
 * distribution — so it gets the worst case and a pointer, and the table is
 * kept in one place rather than in two that can drift.
 *
 * The worst case rather than a mean: a single unconverged latent is the thing
 * a summary must not average away.
 *
 * `null` (the wire's non-finite spelling) is NOT a number and does not
 * participate in either extremum — but it does count toward `latents`, so a
 * run whose every latent came back non-finite reports two absent values over a
 * real count rather than a confident-looking pair over zero.
 *
 * **`warn` is keyed on r_hat alone**, which is `mcmcRows`' own convention and
 * is inherited rather than invented here. It is a real limitation of the
 * summary and not of the table it replaced: there is no ESS threshold in this
 * codebase, so `thinnest n_eff 7` cannot turn the line amber. Naming the
 * latent is what keeps that case findable.
 *
 * @param mcmc - `RunDiagnostics.mcmc`, untyped off the wire.
 * @returns the summary, or `undefined` when the sampler reported no latents at
 *   all — which is a different fact from reporting them as non-finite, and
 *   renders as nothing rather than as a line with two dashes.
 */
export function mcmcWorst(mcmc: unknown): McmcWorst | undefined {
  const latents = mcmcLatents(mcmc)
  if (latents.length === 0) return undefined
  let worst: McmcLatentDiagnostic | undefined
  let thinnest: McmcLatentDiagnostic | undefined
  for (const row of latents) {
    if (row.rhat !== null && (worst?.rhat == null || row.rhat > worst.rhat)) worst = row
    if (row.nEff !== null && (thinnest?.nEff == null || row.nEff < thinnest.nEff)) thinnest = row
  }
  return {
    rhat: worst === undefined ? undefined : formatDiagnostic('rhat', worst.rhat),
    rhatLatent: worst?.latent,
    nEff: thinnest === undefined ? undefined : formatDiagnostic('n_eff', thinnest.nEff),
    nEffLatent: thinnest?.latent,
    latents: latents.length,
    warn: worst?.rhat != null && worst.rhat > RHAT_WARN_ABOVE,
  }
}

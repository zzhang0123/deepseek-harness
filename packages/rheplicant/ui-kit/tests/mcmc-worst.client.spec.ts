/**
 * `mcmcWorst` — the one-line convergence fold (§28.2).
 *
 * **Written because a review asked whether it was tested at all.** It was, but
 * only through `PosteriorPanel`, which is this codebase's convention for
 * formatters and is fine for the ordinary case — and which left every edge
 * unexercised: all-latents-non-finite, a single latent, the threshold itself,
 * and the case the summary exists to survive, where the two extrema belong to
 * DIFFERENT latents.
 */
import { describe, expect, it } from 'vitest'
import { mcmcWorst, RHAT_WARN_ABOVE } from '../src/client/format/mcmc.ts'

describe('the fold itself', () => {
  it('takes the LARGEST r_hat and the SMALLEST n_eff, not the first of each', () => {
    const worst = mcmcWorst({
      a: { r_hat: 1.001, n_eff: 900 },
      b: { r_hat: 1.42, n_eff: 91 },
      c: { r_hat: 1.01, n_eff: 40 },
    })
    // `formatDiagnostic('rhat', …)` renders three decimals — asserted against
    // what the formatter does, not against what the number looks like.
    expect(worst?.rhat).toBe('1.420')
    expect(worst?.nEff).toBe('40')
  })

  it('names the latent each extremum belongs to, and they may DIFFER', () => {
    // The whole reason the names are carried: "worst r_hat 1.42 · thinnest
    // n_eff 40" reads as one latent's pair, and here it is two.
    const worst = mcmcWorst({
      b: { r_hat: 1.42, n_eff: 91 },
      c: { r_hat: 1.01, n_eff: 40 },
    })
    expect(worst?.rhatLatent).toBe('b')
    expect(worst?.nEffLatent).toBe('c')
  })

  it('never averages — a single bad latent survives the fold', () => {
    // A mean of (1.42, 1.00, 1.00, 1.00) is 1.105 and would read as marginal;
    // the point of a worst case is that it cannot be diluted by good company.
    const worst = mcmcWorst({
      a: { r_hat: 1.0, n_eff: 900 }, b: { r_hat: 1.0, n_eff: 900 },
      c: { r_hat: 1.0, n_eff: 900 }, d: { r_hat: 1.42, n_eff: 900 },
    })
    expect(worst?.rhat).toBe('1.420')
    expect(worst?.warn).toBe(true)
  })
})

describe('absent is not empty is not zero', () => {
  it('answers undefined when the sampler reported NO latents', () => {
    // Different from "reported them as non-finite" — a line reading
    // `r_hat — · n_eff —` over zero latents is a claim nobody made.
    expect(mcmcWorst({})).toBeUndefined()
    expect(mcmcWorst(undefined)).toBeUndefined()
    expect(mcmcWorst(null)).toBeUndefined()
    expect(mcmcWorst('not a bag')).toBeUndefined()
  })

  it('counts a non-finite latent, and reports no extremum for it', () => {
    // `null` is the wire's spelling of non-finite. It is a latent the sampler
    // DID report, so the count is real; it just contributes no number.
    const worst = mcmcWorst({ a: { r_hat: null, n_eff: null } })
    expect(worst?.latents).toBe(1)
    expect(worst?.rhat).toBeUndefined()
    expect(worst?.nEff).toBeUndefined()
    expect(worst?.rhatLatent).toBeUndefined()
    expect(worst?.nEffLatent).toBeUndefined()
    expect(worst?.warn).toBe(false)
  })

  it('a non-finite latent does not win either extremum against a real one', () => {
    const worst = mcmcWorst({ a: { r_hat: null, n_eff: null }, b: { r_hat: 1.2, n_eff: 50 } })
    expect(worst?.rhatLatent).toBe('b')
    expect(worst?.nEffLatent).toBe('b')
    expect(worst?.latents).toBe(2)
  })

  it('reports one latent as one, for the caller that pluralises', () => {
    expect(mcmcWorst({ only: { r_hat: 1.0, n_eff: 10 } })?.latents).toBe(1)
  })
})

describe('the warn threshold', () => {
  // A dispatch threshold, so both sides of it are stated rather than one.
  it('does NOT warn exactly AT the threshold', () => {
    expect(mcmcWorst({ a: { r_hat: RHAT_WARN_ABOVE, n_eff: 100 } })?.warn).toBe(false)
  })

  it('warns just above it', () => {
    expect(mcmcWorst({ a: { r_hat: RHAT_WARN_ABOVE + 1e-9, n_eff: 100 } })?.warn).toBe(true)
  })

  it('does not warn just below it', () => {
    expect(mcmcWorst({ a: { r_hat: RHAT_WARN_ABOVE - 1e-9, n_eff: 100 } })?.warn).toBe(false)
  })

  it('is keyed on r_hat alone, which is a stated limitation and not a bug', () => {
    // There is no ESS threshold in this codebase, so a desperately thin n_eff
    // cannot turn the line amber. Naming the latent is what keeps it findable;
    // this test pins the limitation so it is a decision rather than a surprise.
    expect(mcmcWorst({ a: { r_hat: 1.0, n_eff: 3 } })?.warn).toBe(false)
  })
})

describe('rows the projection cannot read', () => {
  it('skips an entry that is not a diagnostics object', () => {
    const worst = mcmcWorst({ a: 7, b: null, c: { r_hat: 1.1, n_eff: 20 } })
    expect(worst?.latents).toBe(1)
    expect(worst?.rhatLatent).toBe('c')
  })

  it('skips an entry carrying neither field', () => {
    expect(mcmcWorst({ a: { something: 1 } })).toBeUndefined()
  })

  it('keeps an entry carrying only one of the two', () => {
    const worst = mcmcWorst({ a: { r_hat: 1.2 } })
    expect(worst?.latents).toBe(1)
    expect(worst?.rhat).toBe('1.200')
    expect(worst?.nEff).toBeUndefined()
  })
})

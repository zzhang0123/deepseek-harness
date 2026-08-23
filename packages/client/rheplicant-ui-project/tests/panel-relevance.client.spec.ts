/**
 * Which panels the selected task has no exit for (`docs/project-model.md`
 * §20.4).
 *
 * The rule these assert is not "which kind ran" — it is "does any run this
 * document declares WRITE the product this panel draws", from upstream's own
 * `RUN_KIND_SELECTORS` on the wire. §18.2 forbids the other shape.
 */
import { describe, expect, it } from 'vitest'
import { panelsWithNoExit } from '../src/client/panel-relevance.ts'
import { KNOWN_PANELS } from '../src/client/known-panels.ts'

/** The real selectors for these two kinds, from `RUN_KIND_SELECTORS`. */
const NUTS = ['arrays', 'draws', 'parameters', 'chains', 'recovery', 'run_diagnostics']
const IDENTIFIABILITY = ['arrays', 'identifiability', 'run_diagnostics']
const FORWARD = ['arrays', 'aux', 'taps']

describe('the default-collapse rule', () => {
  it('collapses nothing when the declared runs could not be read', () => {
    // `unknown` is not `unmet`. Folding a panel shut because nobody could ask
    // is the same wrongness §12 refused on the definition checklist.
    expect(panelsWithNoExit(KNOWN_PANELS, undefined)).toEqual([])
  })

  it('leaves a chains panel open for a document that declares a sampler', () => {
    const collapse = panelsWithNoExit(KNOWN_PANELS, { declared: [{ products: NUTS }] })
    expect(collapse).not.toContain('posterior')
    expect(collapse).not.toContain('chains')
  })

  it('collapses the chains panels for a document that declares only a forward run', () => {
    const collapse = panelsWithNoExit(KNOWN_PANELS, { declared: [{ products: FORWARD }] })
    expect(collapse).toContain('posterior')
    expect(collapse).toContain('chains')
  })

  it('reads across EVERY declared run, not just the first', () => {
    const collapse = panelsWithNoExit(KNOWN_PANELS, {
      declared: [{ products: FORWARD }, { products: NUTS }],
    })
    expect(collapse).not.toContain('posterior')
  })

  it('collapses identifiability for a task that never asks for it', () => {
    expect(panelsWithNoExit(KNOWN_PANELS, { declared: [{ products: NUTS }] }))
      .toContain('identifiability')
    expect(panelsWithNoExit(KNOWN_PANELS, { declared: [{ products: IDENTIFIABILITY }] }))
      .not.toContain('identifiability')
  })

  it('never collapses a panel that draws no run product', () => {
    // `gates` draws post-flight verdicts and `signal-path` draws the declared
    // model; neither is a product, so neither is the rule's business. Same for
    // `spectrum`, whose only selector is `arrays` — which every exit writes,
    // so keying on it would say nothing.
    const collapse = panelsWithNoExit(KNOWN_PANELS, { declared: [] })
    expect(collapse).not.toContain('gates')
    expect(collapse).not.toContain('signal-path')
    expect(collapse).not.toContain('spectrum')
  })

  it('treats a declared run with no products at all as writing nothing', () => {
    const collapse = panelsWithNoExit(KNOWN_PANELS, { declared: [{}] })
    expect(collapse).toContain('posterior')
  })

  it('collapses every product-bearing panel for a document that declares no runs', () => {
    expect([...panelsWithNoExit(KNOWN_PANELS, { declared: [] })].sort())
      .toEqual(['chains', 'identifiability', 'posterior'])
  })
})

describe('the panel roster', () => {
  it('names a product only where upstream defends one', () => {
    // The roster is the one hand-kept list here, so its shape is asserted:
    // every product must be a real `RUN_KIND_SELECTORS` selector, and a panel
    // without one is exempt from the rule rather than silently always-open.
    const SELECTORS = new Set([
      'arrays', 'aux', 'taps', 'covariance', 'parameters', 'losses', 'training_history',
      'run_diagnostics', 'estimates', 'recovery', 'draws', 'chains', 'identifiability',
      'scores', 'gradients', 'prediction_bands', 'posterior_predictives', 'compare', 'benchmark',
    ])
    for (const panel of KNOWN_PANELS) {
      if (panel.product === undefined) continue
      expect(SELECTORS.has(panel.product), `panel ${panel.id} product ${panel.product}`).toBe(true)
    }
  })

  it('has no duplicate ids, which would make the menu address two panels at once', () => {
    expect(new Set(KNOWN_PANELS.map(p => p.id)).size).toBe(KNOWN_PANELS.length)
  })
})

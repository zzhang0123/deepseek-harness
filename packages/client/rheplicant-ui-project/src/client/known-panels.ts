/**
 * The Panels menu's roster of `task.panel` occupants, and — for each — the
 * PRODUCT its data comes from.
 *
 * **Hand-maintained, not introspected.** A slot component's composed props
 * expose only `renderSlot`/`renderSlotChain` (dsh's `ui-slots/src/index.ts`
 * `PropsRenderSlots`); there is no "list every registered entry" read API on
 * the component side, only on the render host internal to `ui-renderer`. So
 * `ProjectHome` cannot discover panels dynamically, and this list is the honest
 * alternative: every package that registers a `task.panel` occupant today, read
 * from its own `apply()`. A NEW occupant adds its row here to appear in the
 * menu; the layout store itself needs no update (it is keyed by arbitrary id).
 *
 * ## Why `product` and not a run KIND
 *
 * §20.4 asks a panel whose exit the task does not declare to default-collapse,
 * so six empty boxes stop being the explanation for "this task did not do that".
 * Answering it needs a mapping from a panel to something a DOCUMENT declares —
 * and §18.2 forbids exactly one shape of that: a hand-kept kind-to-capability
 * table, tracking a grammar this repo does not own.
 *
 * A PRODUCT is the shape the source does defend. `RUN_KIND_SELECTORS`
 * (`config/products/extractors.py`, public) says what each of the eighteen
 * exits writes, `DeclaredRun.products` carries that per declared run on the
 * wire, and §18.2 names it as one of the four things rheplicant's own code will
 * stand behind. So the rule reads: **this panel draws `<product>`; does any run
 * this document declares write `<product>`?** No kind list, nothing to keep in
 * step with the grammar.
 *
 * A panel with NO product is never collapsed by the rule. That is not an
 * oversight — `gates` draws post-flight verdicts and `spectrum` draws
 * magnitudes our own service derives, and neither is a run product at all.
 * Answering "unknown" as "unmet" is the same mistake §12 refused on the
 * definition checklist. (`signal-path` was the third such panel until §28.1
 * merged it into the Model section.)
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/known-panels
 */

/** One `task.panel` occupant, as the Panels menu and the collapse rule see it. */
export interface KnownPanel {
  readonly id: string
  readonly label: string
  /**
   * The product selector this panel draws, from upstream's own
   * `RUN_KIND_SELECTORS`. Absent when the panel does not draw a run product,
   * which exempts it from the default-collapse rule.
   */
  readonly product?: string
}

export const KNOWN_PANELS: readonly KnownPanel[] = [
  // Post-flight verdicts: not a run product, so never auto-collapsed.
  { id: 'gates', label: 'Gates' },
  // `signal-path` was here, and §28.1 removed the SEAT rather than the row:
  // the workbench's Model section already drew the same canonical graph, so
  // the page carried two copies of one diagram in two different fixed themes.
  // The declared/as-run comparison the panel was accidentally providing lives
  // there now, over one renderer.
  // Both read `RunEntry.chains`, which our service derives for every exit whose
  // selectors include `chains` (nuts, npe, plan.sample, conjugate.gcr).
  { id: 'posterior', label: 'Posterior', product: 'chains' },
  { id: 'chains', label: 'Chains', product: 'chains' },
  // `identifiability` is written by exactly one exit of the same name — which
  // is a coincidence of naming, not the rule: the column is the PRODUCT.
  { id: 'identifiability', label: 'Identifiability', product: 'identifiability' },
  // The m-mode magnitudes our own `_published_spectrum` derives, and it derives
  // them for `kind: mmodes` alone — whose only selector is `arrays`. Every exit
  // writes `arrays`, so keying this panel on it would exempt it from the rule
  // and say nothing; leaving the product absent says the same thing honestly.
  { id: 'spectrum', label: 'Spectrum' },
]

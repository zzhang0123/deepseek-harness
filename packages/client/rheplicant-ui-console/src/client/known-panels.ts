/**
 * The Panels menu's roster of `console.panel` occupants. Hand-maintained,
 * not introspected: a slot component's composed props expose only
 * `renderSlot`/`renderSlotChain` (dsh's `ui-slots/src/index.ts`
 * `PropsRenderSlots`) — there is no "list every registered entry" read API
 * on the component side, only on the render host internal to `ui-renderer`
 * (`SlotRendererHost.entriesOf`/`entriesOfSlot`), which no slot component
 * ever receives. So ConsoleView cannot discover panels dynamically; this
 * list is the honest alternative — every package that registers a
 * `console.panel` occupant today, read from its own `apply()`:
 * ui-console (`gates`), ui-posterior (`posterior`, `chains`), ui-analysis
 * (`signal-path`), ui-identifiability (`identifiability`), ui-spectrum
 * (`spectrum`). A NEW occupant package must add its own `{ id, label }` row
 * here to appear in the menu — the layout store itself needs no such
 * update (it is keyed by arbitrary `id` and works for any panel whether or
 * not it is listed here); only the menu's roster is static.
 * @module @rheplicant/dsh-rheplicant-ui-console/client/known-panels
 */

export interface KnownPanel {
  readonly id: string
  readonly label: string
}

export const KNOWN_PANELS: readonly KnownPanel[] = [
  { id: 'gates', label: 'Gates' },
  { id: 'posterior', label: 'Posterior' },
  { id: 'chains', label: 'Chains' },
  { id: 'signal-path', label: 'Signal path' },
  { id: 'identifiability', label: 'Identifiability' },
  { id: 'spectrum', label: 'Spectrum' },
]

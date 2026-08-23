/**
 * Per-panel layout state a `task.panel` occupant reads off its OWN owner
 * props — not a typed slot channel. Slot components have no read API over a
 * slot's registered-entries ledger (`SlotRendererHost.entriesOf`/
 * `entriesOfSlot` live on the render host only; a component's composed props
 * offer `renderSlot`/`renderSlotChain` and nothing else — see dsh's
 * `ui-slots/src/index.ts` `PropsRenderSlots`). So a list entry cannot be told
 * apart or addressed individually from outside; the one channel every entry
 * actually receives is the single owner object the grid's owner hands to its
 * one `renderSlot('task.panel', owner)` call, shared identically by every
 * occupant (dsh's `ui-renderer/src/client/scoped-slots.tsx`
 * `renderOutletContent`'s list branch calls `guarded(entry, key)` with no
 * per-row owner override). This type is that shared shape: an occupant reads
 * its OWN state out of it by its OWN known id. An occupant that does not
 * import/read this prop is simply unmanaged by the grid's layout — no error,
 * it always renders un-collapsed and visible, same as before this existed.
 *
 * Named `ConsolePanelLayoutView` until §20.4, when the console's grid was
 * removed and the workbench's became the only one.
 * @module @rheplicant/dsh-rheplicant-ui-kit/client/panel/layout
 */
export interface PanelLayoutView {
  /** Panel ids currently collapsed (header stays, body hidden). */
  readonly collapsed: ReadonlySet<string>
  /** Panel ids currently hidden (removed from the grid, restorable via `show`). */
  readonly hidden: ReadonlySet<string>
  /**
   * Flip one panel's collapsed state.
   * @param id - the panel's own `Panel` id.
   */
  toggleCollapsed(id: string): void
  /**
   * Remove one panel from the grid.
   * @param id - the panel's own `Panel` id.
   */
  hide(id: string): void
  /**
   * Restore one previously hidden panel to the grid.
   * @param id - the panel's own `Panel` id.
   */
  show(id: string): void
}

/**
 * Per-project panel layout: which `task.panel` occupants are collapsed (header
 * only) or hidden (removed from the grid, restorable), keyed by panel id.
 *
 * `docs/project-model.md` §20.4. This lived on ui-loop's `conversation.view`
 * registration until that tab lost its grid; it is attached to the WORKBENCH's
 * own registration now — the `shell.overlay` entry, which is the one entry that
 * indisputably owns the grid (`task.panel` is a list slot occupied by every viz
 * plugin's panel, none of which is "the" owner).
 *
 * **The scope changed with the seat, and that is the point.** Store-instance
 * scope pins to the SLOT an entry registers INTO (dsh's
 * `runtime/src/client/slots.ts` `SlotRegistry._register`: `scope =
 * specDynamic(options.name).scope`, not the child slot's own declared scope).
 * `conversation.view` is session-scoped, so the console's layout was one
 * instance per session and its persist key ended `.<sessionId>`; `shell.overlay`
 * is ROOT-scoped, so this is one instance for the app. Which is what the layout
 * should always have been: hiding a panel is a statement about how you want to
 * read results, not about the conversation you happened to be in when you said
 * it.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client/layout-store
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/**
 * Layout state: panel ids in each of the three independent sets. Arrays (not
 * Set) — the engine persists state through JSON.stringify/parse, which does not
 * round-trip Set.
 *
 * Not `readonly` fields, on purpose: the draft parameter every action receives
 * is typed as plain `WorkbenchLayoutState` (`ActionsDecl<T>`'s draft position is
 * `T` itself, not an auto-mutable `Draft<T>`), so a `readonly` field would make
 * `d.collapsed = …` a compile error despite being safe — immer's runtime proxy
 * is what actually makes the mutation safe.
 */
interface WorkbenchLayoutState {
  collapsed: string[]
  hidden: string[]
  /**
   * Panels a HUMAN has expanded or collapsed by hand.
   *
   * The default-collapse rule (§20.4) folds a panel shut when the selected task
   * declares no exit that writes what it draws — and it must never fight
   * somebody who has said otherwise. Without this set, the rule would re-close
   * a panel on every task change, and there would be no way to tell "collapsed
   * because nothing wrote it" from "collapsed because I closed it".
   */
  decided: string[]
}

/**
 * Declared action write set (draft-mutator shaped: `(draft, ...params)` — NOT
 * what a component receives; the framework bakes the draft parameter away, see
 * `BakedActions` in dsh's `ui-slots/src/store.ts`). A `type` alias, not an
 * `interface`: `ActionsDecl<T>` is a `Record<string, …>`, and only a type
 * alias's object literal shape structurally satisfies that generic constraint.
 */
type WorkbenchLayoutActionsDecl = {
  toggleCollapsed: (draft: WorkbenchLayoutState, id: string) => void
  hide: (draft: WorkbenchLayoutState, id: string) => void
  show: (draft: WorkbenchLayoutState, id: string) => void
  /** Collapse a panel BY RULE — never overriding a human's own decision. */
  suggestCollapsed: (draft: WorkbenchLayoutState, ids: readonly string[]) => void
  reset: (draft: WorkbenchLayoutState) => void
}

/**
 * Create the workbench panel-layout store handle.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createWorkbenchLayoutStore(): EngineStoreHandle<
  WorkbenchLayoutState, WorkbenchLayoutActionsDecl
> {
  return defineStore({
    init: (): WorkbenchLayoutState => ({ collapsed: [], hidden: [], decided: [] }),
    persist: 'rheplicant.workbench.layout',
    actions: {
      toggleCollapsed: (d, id: string) => {
        d.collapsed = d.collapsed.includes(id) ? d.collapsed.filter(x => x !== id) : [...d.collapsed, id]
        // A hand toggle is a decision, in either direction: expanding a
        // rule-collapsed panel has to stick just as firmly as collapsing one.
        if (!d.decided.includes(id)) d.decided = [...d.decided, id]
      },
      hide: (d, id: string) => {
        if (!d.hidden.includes(id)) d.hidden = [...d.hidden, id]
      },
      show: (d, id: string) => {
        d.hidden = d.hidden.includes(id) ? d.hidden.filter(x => x !== id) : d.hidden
      },
      suggestCollapsed: (d, ids: readonly string[]) => {
        const undecided = ids.filter(id => !d.decided.includes(id) && !d.collapsed.includes(id))
        if (undecided.length === 0) return
        d.collapsed = [...d.collapsed, ...undecided]
      },
      reset: (d) => {
        d.collapsed = []
        d.hidden = []
        // The decisions go too: "reset layout" that left an invisible record of
        // every panel you ever touched would not be a reset.
        d.decided = []
      },
    },
  })
}

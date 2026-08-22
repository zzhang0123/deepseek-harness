/**
 * Per-session panel layout store: which `console.panel` occupants are
 * collapsed (header only) or hidden (removed from the grid, restorable),
 * keyed by panel id. Attached to ConsoleView's OWN registration (the entry
 * registering into `conversation.view`) rather than a `console.panel` child
 * entry — `console.panel` is a list slot occupied by every viz plugin's own
 * panel, none of which is "the" owner; ConsoleView is the one entry that
 * indisputably owns the console shell. Store-instance scope pins to the
 * SLOT an entry registers INTO (see dsh's `runtime/src/client/slots.ts`
 * `SlotRegistry`'s `_register`: `scope = specDynamic(options.name).scope`,
 * not the child slot's own declared scope) — `conversation.view` is
 * `scope: 'session'` (ui-conversation's `contract/slots.ts`), so this store
 * is one instance per session, and the engine suffixes the persist key with
 * the session id automatically (`defineStore`'s `create(scopeKey)`, in
 * `runtime/src/client/contract/store.ts`): the persisted key ends up
 * `rheplicant.console.layout.<sessionId>`, matching the `dsh.<feature>`-style
 * dotted convention `ui-conversation`'s own chat store uses
 * (`dsh.conversation.chat`), renamed to this package's own namespace.
 * @module @rheplicant/dsh-rheplicant-ui-console/client/layout-store
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/**
 * Layout store state: panel ids in each of the two independent sets. Arrays
 * (not Set) — the engine persists state through JSON.stringify/parse, which
 * does not round-trip Set. Not exported: matching dsh's own store files
 * (`ui-layout/src/client/stores.ts`'s `LayoutState`, unexported), a consumer
 * derives the shape from `ReturnType<typeof createConsoleLayoutStore>` (see
 * `PropsStore` in ConsoleView.tsx) rather than importing the state/actions
 * types directly — one less pair of types that can drift from the real baked
 * shape the framework hands components.
 */
// Not `readonly` fields, on purpose: the draft parameter every action below
// receives is typed as plain `ConsoleLayoutState` (`ActionsDecl<T>`'s draft
// position is `T` itself, not an auto-mutable `Draft<T>`), so a `readonly`
// field would make `d.collapsed = …` a compile error despite being safe —
// immer's runtime proxy is what actually makes the mutation safe. Matches
// dsh's own `LayoutState`/`ChatStoreState` (`ui-layout`/`ui-conversation`'s
// store files), neither of which marks its fields `readonly` either.
interface ConsoleLayoutState {
  collapsed: string[]
  hidden: string[]
}

/**
 * Declared action write set (draft-mutator shaped: `(draft, ...params)` —
 * NOT what a component receives; the framework bakes the draft parameter
 * away, see `BakedActions` in dsh's `ui-slots/src/store.ts`). Annotation twin
 * of the actions literal below (`createConsoleLayoutStore`'s declared return
 * type needs it, same as `LayoutActions`/`ChatActions` in the dsh examples
 * this mirrors); drift fails assignability at the `defineStore` call. A
 * `type` alias, not an `interface`: `ActionsDecl<T>` is a `Record<string,
 * …>`, and only a type alias's object literal shape structurally satisfies
 * that generic constraint — an `interface` (always "open", never assumed
 * index-signature-compatible) does not, which is presumably also why dsh's
 * own `LayoutActions`/`ChatActions` are `type`, not `interface`.
 */
type ConsoleLayoutActionsDecl = {
  toggleCollapsed: (draft: ConsoleLayoutState, id: string) => void
  hide: (draft: ConsoleLayoutState, id: string) => void
  show: (draft: ConsoleLayoutState, id: string) => void
  reset: (draft: ConsoleLayoutState) => void
}

/**
 * Create the console panel-layout store handle.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createConsoleLayoutStore(): EngineStoreHandle<ConsoleLayoutState, ConsoleLayoutActionsDecl> {
  return defineStore({
    init: (): ConsoleLayoutState => ({ collapsed: [], hidden: [] }),
    persist: 'rheplicant.console.layout',
    actions: {
      toggleCollapsed: (d, id: string) => {
        d.collapsed = d.collapsed.includes(id) ? d.collapsed.filter(x => x !== id) : [...d.collapsed, id]
      },
      hide: (d, id: string) => {
        if (!d.hidden.includes(id)) d.hidden = [...d.hidden, id]
      },
      show: (d, id: string) => {
        d.hidden = d.hidden.includes(id) ? d.hidden.filter(x => x !== id) : d.hidden
      },
      reset: (d) => {
        d.collapsed = []
        d.hidden = []
      },
    },
  })
}

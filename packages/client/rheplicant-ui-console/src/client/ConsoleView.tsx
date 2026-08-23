/**
 * The console shell: a header row (the Panels menu) then the LoopRail (full
 * width, above the grid) then every `console.panel` occupant in a
 * responsive grid. `useSession` arrives on every `conversation.view` entry
 * through the session-scope standard kit (`PropsRuntime<'conversation.view'>`
 * — see ui-slots' `SessionStandardProps` merge); LoopRail is the console
 * shell's own reader of it, the same seat every console.panel occupant
 * already receives. `useStore`/`actions` arrive the same way `AppFrame`
 * receives its layout store (dsh's `ui-layout/src/client/AppFrame.tsx`):
 * this entry's OWN registration (in `index.ts`) declares `store:
 * createConsoleLayoutStore`, so the framework bakes `useStore`/`actions`
 * straight into this component's props — see `layout-store.ts`'s doc
 * comment for why the store lives HERE (on ConsoleView's own registration)
 * rather than on any one `console.panel` occupant.
 *
 * Per-entry `console.panel` render control: NOT available. `renderSlot`'s
 * `RenderOpts.only` (dsh's `ui-slots/src/index.ts`) filters a list slot down
 * to ONE entry by id — it cannot express "every entry except these hidden
 * ones", and there is no read API to enumerate registered entries from a
 * slot component in the first place (`PropsRenderSlots` offers only
 * `renderSlot`/`renderSlotChain`; entry enumeration lives on
 * `SlotRendererHost`, internal to `ui-renderer`, never exposed to a
 * component). So this file renders `console.panel` UNFILTERED (every
 * occupant, same as before) and hands the resolved layout view down through
 * the one channel every occupant actually receives — the shared owner props
 * object (`ui-renderer/src/client/scoped-slots.tsx`'s list branch calls
 * `guarded(entry, key)` with no per-row owner override, so `renderSlot`'s
 * second argument really is identical for every row). `ConsolePanelLayoutView`
 * (ui-kit) documents the same thing from the occupant's side. Concretely, all
 * six occupants — `gates` (this package), `posterior`/`chains`
 * (ui-posterior), `signal-path` (ui-analysis), `identifiability`
 * (ui-identifiability), `spectrum` (ui-spectrum) — read `layout` off this
 * shared object and self-apply it (hidden → render nothing, collapsed → pass
 * `collapsed`/`onToggleCollapse` down to the kit `Panel`). A future occupant
 * that skips this is simply unmanaged by the console's layout — no error, it
 * stays always-visible/always-expanded, same as before any occupant wired it
 * (an occupant ignoring an unknown prop is just an occupant ignoring an
 * unknown prop, not a contract break).
 * @module @rheplicant/dsh-rheplicant-ui-console/client/ConsoleView
 */
import { memo, useCallback, useMemo, type ReactNode } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConsolePanelLayoutView } from '@rheplicant/dsh-rheplicant-ui-kit/client'
import type { createConsoleLayoutStore } from './layout-store.ts'
import { KNOWN_PANELS } from './known-panels.ts'
import { LoopRail } from './LoopRail.tsx'
import { ProjectHeader } from './ProjectHeader.tsx'
import { useConsoleExecution } from './use-console-execution.ts'
import { PanelsMenu } from './PanelsMenu.tsx'
import styles from './console.module.css'

/**
 * `useStore`/`actions` derive from the store handle's own return type
 * (`PropsStore<H>`, dsh's `ui-slots/src/store.ts`) rather than a hand-typed
 * twin of the actions declared in `layout-store.ts` — the same
 * `PropsStore<ReturnType<typeof createLayoutStore>>` pattern
 * `ui-layout/src/client/AppFrame.tsx` uses for its own layout store. Baked
 * per-call args ARE what a caller of `actions.toggleCollapsed` writes
 * (`(id: string) => void` — the draft parameter is gone, baked away by the
 * framework); deriving this mechanically rather than hand-declaring a second
 * "actions" shape is what keeps that fact from drifting out of sync with
 * `layout-store.ts`'s own declared write set.
 */
type ConsoleViewProps =
  & {
    useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
    /** Root-scope standard prop; used only to resolve this session's project. */
    useWorkspaces: <T>(selector: (state: {
      items: readonly { workspaceId: string; sessionIds: readonly string[] }[]
    }) => T) => T
    renderSlot: (key: 'console.panel', owner: object) => ReactNode
  }
  & PropsStore<ReturnType<typeof createConsoleLayoutStore>>

export const ConsoleView = memo(function ConsoleView({ useSession, useWorkspaces, renderSlot, useStore, actions }: ConsoleViewProps) {
  // One owner for "which execution", shared by the header that names it and
  // the panels that draw it (`docs/project-model.md` §6.1).
  const execution = useConsoleExecution(useSession, useWorkspaces)
  const collapsed = useStore(s => s.collapsed)
  const hidden = useStore(s => s.hidden)
  const collapsedSet = useMemo(() => new Set(collapsed), [collapsed])
  const hiddenSet = useMemo(() => new Set(hidden), [hidden])

  const layout: ConsolePanelLayoutView = useMemo(() => ({
    collapsed: collapsedSet,
    hidden: hiddenSet,
    toggleCollapsed: actions.toggleCollapsed,
    hide: actions.hide,
    show: actions.show,
  }), [collapsedSet, hiddenSet, actions])

  const toggleHidden = useCallback((id: string) => {
    if (hiddenSet.has(id)) actions.show(id)
    else actions.hide(id)
  }, [hiddenSet, actions])

  return (
    <section data-rheplicant-console className={styles.view}>
      <div data-console-header className={styles.header}>
        <PanelsMenu panels={KNOWN_PANELS} hidden={hiddenSet} onToggleHidden={toggleHidden} onReset={actions.reset} />
      </div>
      <ProjectHeader execution={execution} />
      {/* Labelled as this CONVERSATION's activity, not the task's state —
          §11.4. The workbench's maturity rail answers the other question. */}
      <div className={styles.activity} data-session-activity>
        <span className={styles.activityLabel}>in this conversation</span>
        <LoopRail useSession={useSession} />
      </div>
      <div data-console-grid className={styles.grid}>
        {/* The owner props object is identical for every occupant (see this
            file's doc comment), which is the one channel that reaches them
            all — so the selected execution rides it beside the layout. */}
        {renderSlot('console.panel', { layout, execution: execution.executionView })}
      </div>
    </section>
  )
})

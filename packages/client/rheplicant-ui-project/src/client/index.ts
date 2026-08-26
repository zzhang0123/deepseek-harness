/**
 * Browser plugin for the rheplicant workbench (`docs/project-model.md`
 * §6.0): the archive surface, root-scoped, over a project's tasks, inputs and
 * executions.
 *
 * Two registrations into two ADDITIVE root-scoped list slots, both
 * `replaceRisk: 'none'`:
 *
 * * `shell.overlay` — the page itself. Its own contract calls it "the additive
 *   seat for a frame-wide surface of your own", which is exactly what an
 *   archive page is.
 * * `sidebar.footer.action` — the control that opens it, beside Settings.
 *
 * Neither shadows shipped UI. §6.0 originally named
 * `conversation.hero.workspace`; `ProjectHome.tsx`'s header records why that
 * turned out to be the wrong seat (it is a single-occupant popover already
 * owned by the WorkspacePicker, and taking it would break the directory-flow
 * child slot too).
 *
 * The two halves share open-state through a module-level store rather than a
 * slot channel — see `home-store.ts` for why that is both necessary here and
 * safe here.
 *
 * @module @rheplicant/dsh-rheplicant-ui-project/client
 */

import type {
  ClientContext, ConversationSnapshot,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { ConsoleExecutionView, PanelLayoutView } from '@rheplicant/dsh-rheplicant-ui-kit/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'

// Type-only: these load the SlotMap augmentations that DECLARE the two seats
// this plugin occupies — `shell.overlay` from ui-layout, `sidebar.footer.action`
// from ui-sidebar. Without them the slot names are not in the map and
// `register` refuses them at compile time, which is the map doing its job.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { createWorkbenchLayoutStore } from './layout-store.ts'
import { Dashboard } from './Dashboard.tsx'
import { DashboardTrigger } from './DashboardTrigger.tsx'
import { HomeTrigger } from './HomeTrigger.tsx'
import { ProjectHome } from './ProjectHome.tsx'
import { setNavigator } from './navigate.ts'
import { SelectionRuntime } from './selection-service.ts'
import { WorkbenchRuntime } from './workbench-service.ts'

/**
 * What the workbench hands each panel.
 *
 * `useSession` is an OWNER prop here, not a standard one: `task.panel` is
 * root-scoped, so the slot runtime supplies no session reader — and that is
 * the point (§11.3). The workbench supplies one that reads an empty
 * conversation, which is the truthful answer for a surface that has none, and
 * lets a panel written for the console render here unchanged.
 */
export interface TaskPanelOwnerProps {
  /** An empty conversation: the workbench contributes no session log. */
  readonly useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
  /** The selected execution, in the same shape the console builds. */
  readonly execution: ConsoleExecutionView
  /**
   * Which panels are collapsed or hidden (§20.4).
   *
   * The one channel that reaches every occupant: `renderSlot`'s second
   * argument is identical for every row of a list slot, so an occupant reads
   * its OWN state out of this by its OWN known id and self-applies it. A panel
   * that ignores it is simply unmanaged — no error, always visible.
   */
  readonly layout: PanelLayoutView
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * The workbench's panel grid: the same occupants `console.panel` carries,
     * rendered against the PROJECT selection instead of a session.
     *
     * Root scope on purpose — a panel here is driven by owner props, so it
     * needs nothing from a conversation, and requiring one is exactly the
     * coupling §11 removes.
     */
    'task.panel': { kind: 'list'; scope: 'root'; owner: TaskPanelOwnerProps }
  }
}

export {
  closeHome, openHome, readHome, resetHome, selectProject, showSection, subscribeHome,
  toggleHome, toggleSection, useHome, type Section,
} from './home-store.ts'
export type { HomeState } from './home-store.ts'
export {
  countByStatus, formatBytes, groupExecutionsByTask, taskSegmentOf,
} from './home-selectors.ts'
export { canNavigate, openProject, setNavigator } from './navigate.ts'
export { KNOWN_PANELS } from './known-panels.ts'
export type { KnownPanel } from './known-panels.ts'
export { panelsWithNoExit } from './panel-relevance.ts'
export { createWorkbenchLayoutStore } from './layout-store.ts'
export {
  clearSelection, proposeSelection, readSelection, resetSelections, selectInProject,
  subscribeSelection, useSelection,
} from './selection.ts'
export type { ProjectSelection, SelectionPatch, SelectionPins } from './selection.ts'
export { SelectionRuntime } from './selection-service.ts'
export { WorkbenchRuntime } from './workbench-service.ts'
export type { Navigator } from './navigate.ts'
export type { StatusCounts, TaskExecutionGroup } from './home-selectors.ts'

export const inject = ['slots', 'sessions', 'workspaces']

export function apply(ctx: ClientContext): void {
  // The project's selection, published for the console (and, from P7b, the
  // workbench) to read. Registered before anything else this plugin does, so a
  // consumer resolving it lazily finds it as soon as this row is mounted.
  ctx.plugin(SelectionRuntime)
  // Whether this surface is the section on screen, published for anything that
  // wants to SEND someone here — today the chat result node (§20.3). A second
  // service rather than a member of the first: see `workbench-service.ts` for
  // why "what the project is showing" and "what the frame is showing" must not
  // be the same switch.
  ctx.plugin(WorkbenchRuntime)
  ctx.effect(() => {
    setNavigator({
      connect: workspaceId => ctx.workspaces.connectWorkspace(workspaceId as never)
        .then(sessionId => String(sessionId)),
      open: sessionId => { ctx.sessions.open(sessionId as never) },
    })
    return () => { setNavigator(undefined) }
  })
  // `section`, not `shell.overlay` (§24). The overlay floats above every
  // column, so a surface that wanted to sit BESIDE the sidebar had to work out
  // where the sidebar ends — and the frame publishes its track widths only as
  // an inline `gridTemplateColumns`, never as a custom property. The guess was
  // a hardcoded 19rem, and it was wrong at every width: 23px of transcript
  // showed at the default column, 248px once the column collapsed to its rail.
  // A `section` occupant is bounded by the centre column itself, so there is
  // nothing to guess.
  ctx.slots.inject('section', () => ctx.slots.register({
    name: 'section',
    id: 'rheplicant-workbench',
    label: () => 'Workbench',
    // The panel layout, on the one entry that indisputably owns the grid
    // (§20.4). Store-instance scope pins to the slot an entry registers INTO,
    // and `section` is root-scoped — so this is one layout for the app,
    // where the console's was one per session. Which is what it should always
    // have been: hiding a panel says how you want to read results, not which
    // conversation you were in when you said so.
    store: createWorkbenchLayoutStore,
    // The workbench's own panel grid. A SECOND slot rather than reusing
    // `console.panel` because a child key may be declared exactly once
    // (`ui-slots`: "declaring an already-declared child key throws") and only
    // the declarer's component receives a `renderSlot` bound to it — so one
    // slot cannot serve two seats. Root scope, because a panel driven by the
    // project selection has no use for a session (§11.3).
    children: {
      'task.panel': { kind: 'list', scope: 'root' },
    },
  }, ProjectHome))
  // The cross-project level (§25). A SECOND `section` occupant beside the
  // workbench: the slot is a list, and `home-store`'s one section name makes
  // them mutually exclusive by construction rather than by either page
  // checking on the other.
  ctx.slots.inject('section', () => ctx.slots.register({
    name: 'section',
    id: 'rheplicant-dashboard',
    label: () => 'Dashboard',
  }, Dashboard))
  // Above the Workbench row: a dashboard is where you arrive, a workbench is
  // where you go next.
  ctx.slots.inject('sidebar.nav', () => ctx.slots.register({
    name: 'sidebar.nav',
    id: 'rheplicant-dashboard-trigger',
    order: 5,
    label: () => 'Dashboard',
  }, DashboardTrigger))
  // Primary navigation, beside New Session — not the foot beside Settings
  // (§24). The foot was the only additive seat this column had, so a switch to
  // a whole peer surface read as a utility filed under the session list. It is
  // a destination, and it now sits where destinations go.
  ctx.slots.inject('sidebar.nav', () => ctx.slots.register({
    name: 'sidebar.nav',
    id: 'rheplicant-workbench-trigger',
    order: 10,
    label: () => 'Workbench',
  }, HomeTrigger))
}

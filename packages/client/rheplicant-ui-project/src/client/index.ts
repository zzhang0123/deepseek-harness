/**
 * Browser plugin for the rheplicant project home (`docs/project-model.md`
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
import type { ConsoleExecutionView } from '@rheplicant/dsh-rheplicant-ui-kit/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'

// Type-only: these load the SlotMap augmentations that DECLARE the two seats
// this plugin occupies — `shell.overlay` from ui-layout, `sidebar.footer.action`
// from ui-sidebar. Without them the slot names are not in the map and
// `register` refuses them at compile time, which is the map doing its job.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { HomeTrigger } from './HomeTrigger.tsx'
import { ProjectHome } from './ProjectHome.tsx'
import { setNavigator } from './navigate.ts'
import { SelectionRuntime } from './selection-service.ts'

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

export { closeHome, openHome, readHome, resetHome, selectProject, toggleHome, useHome } from './home-store.ts'
export type { HomeState } from './home-store.ts'
export {
  countByStatus, formatBytes, groupExecutionsByTask, taskSegmentOf,
} from './home-selectors.ts'
export { canNavigate, openProject, setNavigator } from './navigate.ts'
export {
  clearSelection, proposeSelection, readSelection, resetSelections, selectInProject,
  subscribeSelection, useSelection,
} from './selection.ts'
export type { ProjectSelection, SelectionPatch, SelectionPins } from './selection.ts'
export { SelectionRuntime } from './selection-service.ts'
export type { Navigator } from './navigate.ts'
export type { StatusCounts, TaskExecutionGroup } from './home-selectors.ts'

export const inject = ['slots', 'sessions', 'workspaces']

export function apply(ctx: ClientContext): void {
  // The project's selection, published for the console (and, from P7b, the
  // workbench) to read. Registered before anything else this plugin does, so a
  // consumer resolving it lazily finds it as soon as this row is mounted.
  ctx.plugin(SelectionRuntime)
  ctx.effect(() => {
    setNavigator({
      connect: workspaceId => ctx.workspaces.connectWorkspace(workspaceId as never)
        .then(sessionId => String(sessionId)),
      open: sessionId => { ctx.sessions.open(sessionId as never) },
    })
    return () => { setNavigator(undefined) }
  })
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'rheplicant-project-home',
    label: () => 'Project home',
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
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'rheplicant-project-home-trigger',
    // Ahead of the shipped Cordis panel action (order 0 by default) would put
    // a feature control before a diagnostic one; after it keeps the shipped
    // foot order recognisable.
    order: 10,
    label: () => 'Project',
  }, HomeTrigger))
}

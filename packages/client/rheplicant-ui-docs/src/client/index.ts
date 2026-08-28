/**
 * Browser plugin for the harness's own documentation.
 *
 * Two registrations into two root-scoped LIST slots, neither of which shadows
 * anything the harness ships:
 *
 * * `sidebar.nav` — the row, beside Dashboard and Workbench. Primary
 *   navigation is where DESTINATIONS go; the foot beside Settings is where
 *   utilities go, and `ui-project`'s `HomeTrigger.tsx` records the user report
 *   that established the difference.
 * * `section` — the page, a peer of the conversation inside its own column.
 *
 * **This package owns a page but not the register that decides which page is
 * on screen.** That register is one variable in `ui-project`, and it is one
 * variable on purpose: `section` is a list slot whose occupants each paint
 * when they decide they are visible, so two pages holding two open flags both
 * paint the same column. Joining it costs a member of that union and a service
 * call across the bundle boundary — see `section-bridge.ts` for why the
 * boundary cannot be crossed with an ordinary import.
 *
 * The row is registered AFTER the page, so that a composition which somehow
 * mounted only half of this plugin offers no control to a surface that cannot
 * paint.
 *
 * @module @rheplicant/dsh-rheplicant-ui-docs/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'

// Type-only: these load the SlotMap augmentations that DECLARE the two seats
// this plugin occupies — `section` from ui-layout, `sidebar.nav` from
// ui-sidebar. Without them the names are not in the map and `register` refuses
// them at compile time, which is the map doing its job.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

import { DocsPage } from './DocsPage.tsx'
import { DocsTrigger } from './DocsTrigger.tsx'
import { setSectionSource } from './section-bridge.ts'

export {
  DOCS_SECTION, hasSectionRegister, openDocs, readSection, setSectionSource,
} from './section-bridge.ts'
export type { SectionSource } from './section-bridge.ts'
export { openTopic, readTopic, resetTopic, subscribeTopic } from './docs-store.ts'
export {
  FIRST_TOPIC, PARTS, TOPICS, filterTopics, locateTopic, resolveTopic,
} from './outline.ts'
export type { Part, Topic, TopicLocation } from './outline.ts'
export { CHAPTERS } from './chapters/index.ts'
export type { Chapter } from './chapters/index.ts'

/** Required services. */
export const inject = ['slots']

/** Register the documentation section and its sidebar row. */
export function apply(ctx: ClientContext): void {
  // A thunk, not a value: `ctx.get` here would answer undefined whenever
  // ui-project mounts LATER in the composition, and mount order is a profile's
  // business. Re-called until it answers, which removes the constraint rather
  // than documenting it.
  setSectionSource(() => ctx.get('rheplicantWorkbench'))

  ctx.slots.inject('section', () => ctx.slots.register({
    name: 'section',
    id: 'rheplicant-docs',
    label: () => 'Docs',
  }, DocsPage))

  // LAST of the four destinations: you arrive at a dashboard, you work in a
  // workbench, you check what runs while you are away, and you consult
  // documentation. Reading order, not importance — and it keeps Docs out of
  // the foot beside Settings, where a whole peer surface reads as a utility.
  //
  // **20, and it was 15 until Schedules landed there too** (2026-08-28). Two
  // packages picked the same order for the same slot and neither could see the
  // other: `sidebar.nav` order is an integer chosen inside each `register()`
  // call, so unlike the `Section` union — which has one owner and therefore
  // makes a collision a compile error — nothing here fails when two rows
  // claim one seat. It resolves by registration order, which is a profile's
  // business, so the column silently reorders itself when the profile does.
  // The gap to 20 leaves 16..19 for anything that belongs between them.
  ctx.slots.inject('sidebar.nav', () => ctx.slots.register({
    name: 'sidebar.nav',
    id: 'rheplicant-docs-trigger',
    order: 20,
    label: () => 'Docs',
  }, DocsTrigger))
}

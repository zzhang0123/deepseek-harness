/**
 * How this package reaches the app's ONE section register.
 *
 * The register lives in `ui-project`'s `home-store.ts`, in a different client
 * bundle. Importing it as a VALUE from here is refused at build time by the
 * client bundle's own purity gate (`packages/client/tsdown.client.ts`,
 * `dsh-client-bundle-purity`): a cross-plugin value import either inlines a
 * private duplicate of that module's state — two registers, one of which
 * nothing is watching — or asks the loader's module table for a specifier it
 * cannot answer. Cordis services are the channel the gate names, and
 * `ctx.rheplicantWorkbench` is one.
 *
 * **Why not just keep our own flag.** Because two flags is the bug. `section`
 * is a root-scoped LIST slot: every occupant paints when it decides it is on
 * screen, so two pages that each believe they are open both paint the same
 * column. `home-store`'s header states the rule this obeys — *"one variable
 * holds one name, so two sections cannot both paint the column, and a new nav
 * row costs a member of the union rather than a second flag that has to be
 * kept false."* This module is the cost of that membership, paid across a
 * bundle boundary.
 *
 * **Resolved lazily, on every use.** `ctx.get` at `apply()` time answers
 * `undefined` whenever `ui-project` mounts LATER in the composition, and mount
 * order is a profile's business (the same lesson `ui-loop`'s selection bridge
 * records). A thunk re-called until it answers costs nothing and removes the
 * ordering constraint entirely.
 *
 * @module @rheplicant/dsh-rheplicant-ui-docs/client/section-bridge
 */

import { useSyncExternalStore } from 'react'

// Type-only, so no value crosses the bundle boundary: the gate refuses the
// import that would, and permits the one that carries a name and nothing else.
import type { Section } from '@deepseek-ai/dsh-client-rheplicant-ui-project/client'

/** The name this package's page answers to. */
export const DOCS_SECTION: Section = 'docs'

/** The `ctx.rheplicantWorkbench` face, as this package needs it. */
export interface SectionSource {
  go(section: Section): void
  read(): { readonly section: Section }
  subscribe(listener: () => void): () => void
}

let locate: (() => SectionSource | undefined) | undefined

/**
 * Install the lookup. Called once from `apply()`.
 *
 * @param next - the thunk, or undefined to uninstall (tests).
 */
export function setSectionSource(next: (() => SectionSource | undefined) | undefined): void {
  locate = next
}

/**
 * The section register, if it is reachable yet.
 *
 * @returns the service, or undefined when no project surface is mounted.
 */
function source(): SectionSource | undefined {
  return locate?.()
}

/**
 * Whether the section register is reachable at all.
 *
 * `readSection()` cannot answer this: it reports `'conversation'` both when the
 * transcript is on screen and when there is no register to ask, and those are
 * different facts. A caller that needs to know whether this plugin can DO
 * anything — the nav row — has to ask directly.
 *
 * **Read at render time, not at `apply()` time.** `ctx.get` answers `undefined`
 * for a provider that mounts later in the composition, and mount order is a
 * profile's business; the thunk exists so every lookup re-asks. By the time
 * React renders, every `apply()` in the composition has run, so an `undefined`
 * here means the project surface is genuinely absent rather than merely late.
 *
 * The case this does NOT cover, stated rather than implied: a provider
 * *unmounted* at runtime. `subscribeSection` has nothing to subscribe to while
 * the register is missing, so nothing would re-render the row if one appeared
 * or vanished mid-session. That is the same limitation `ui-loop`'s selection
 * bridge carries, and for the same reason.
 *
 * @returns true when a project surface is mounted to coordinate with.
 */
export function hasSectionRegister(): boolean {
  return source() !== undefined
}

/**
 * Which section is on screen.
 *
 * Answers `'conversation'` when the register is unreachable, which is the
 * truthful degradation: with no register there is no section, so this page is
 * not the thing on screen and must not paint over the transcript.
 *
 * @returns the current section name.
 */
export function readSection(): Section {
  return source()?.read().section ?? 'conversation'
}

/** Subscribe to section changes; a no-op unsubscribe when unreachable. */
export function subscribeSection(listener: () => void): () => void {
  return source()?.subscribe(listener) ?? (() => {})
}

/**
 * Go to a section.
 *
 * @param section - the section to show.
 * @returns true when a register was there to be moved.
 */
export function goToSection(section: Section): boolean {
  const service = source()
  if (service === undefined) return false
  service.go(section)
  return true
}

/** Open the documentation section. */
export function openDocs(): boolean {
  return goToSection(DOCS_SECTION)
}

/** Subscribe a component to the section on screen. */
export function useSection(): Section {
  return useSyncExternalStore(subscribeSection, readSection, () => 'conversation')
}
